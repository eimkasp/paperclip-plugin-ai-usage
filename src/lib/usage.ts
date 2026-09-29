import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
export type RateLimit = { label: string; usedPercent: number; windowMinutes: number | null; resetsAt: string | null };
export type ToolUsage = {
  tool: "codex" | "claude";
  cli: { installed: boolean; version: string | null };
  dataFound: boolean;
  today: Tokens;
  last5h: Tokens;
  last7d: Tokens;
  days: { date: string; total: number }[];
  models: { model: string; total: number }[];
  limits: RateLimit[];
  lastActivity: string | null;
};
export type UsageSnapshot = { generatedAt: string; windowDays: number; codex: ToolUsage; claude: ToolUsage };
export type UsageEvent = { ts: number; model: string; input: number; output: number; cacheRead: number; cacheWrite: number };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const zero = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });

function add(t: Tokens, e: UsageEvent) {
  t.input += e.input; t.output += e.output; t.cacheRead += e.cacheRead; t.cacheWrite += e.cacheWrite;
  t.total += e.input + e.output + e.cacheRead + e.cacheWrite;
}

function* jsonLines(text: string): Generator<any> {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip partial or corrupt line */ }
  }
}

/** Claude Code: assistant messages carry message.usage. Deduped by message id + request id. */
export function parseClaudeLog(text: string, seen = new Set<string>()): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const row of jsonLines(text)) {
    const u = row?.message?.usage;
    if (row?.type !== "assistant" || !u) continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    const key = `${row.message.id ?? ""}:${row.requestId ?? ""}`;
    if (key !== ":") { if (seen.has(key)) continue; seen.add(key); }
    const model = String(row.message.model ?? "unknown");
    if (model === "<synthetic>") continue;
    out.push({ ts, model, input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens) });
  }
  return out;
}

/** Codex CLI: token_count events carry per-turn usage and account rate limits. */
export function parseCodexLog(text: string): { events: UsageEvent[]; limits: { ts: number; limits: RateLimit[] } | null } {
  const events: UsageEvent[] = [];
  let model = "unknown";
  let limits: { ts: number; limits: RateLimit[] } | null = null;
  for (const row of jsonLines(text)) {
    const p = row?.payload;
    if (!p) continue;
    if (row.type === "turn_context" && typeof p.model === "string") model = p.model;
    if (row.type !== "event_msg" || p.type !== "token_count") continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    const l = p.info?.last_token_usage;
    if (l) {
      const cached = num(l.cached_input_tokens);
      events.push({ ts, model, input: Math.max(0, num(l.input_tokens) - cached), output: num(l.output_tokens), cacheRead: cached, cacheWrite: 0 });
    }
    const rl = p.rate_limits;
    if (rl && typeof rl === "object") {
      const parsed: RateLimit[] = [];
      for (const [name, w] of [["primary", rl.primary], ["secondary", rl.secondary]] as const) {
        if (!w || typeof w.used_percent !== "number") continue;
        const mins = typeof w.window_minutes === "number" ? w.window_minutes : null;
        const resets = typeof w.resets_at === "number" ? new Date(w.resets_at * 1000).toISOString() : null;
        parsed.push({ label: mins ? (mins >= 1440 ? `${Math.round(mins / 1440)}d window` : `${Math.round(mins / 60)}h window`) : name, usedPercent: w.used_percent, windowMinutes: mins, resetsAt: resets });
      }
      if (parsed.length) limits = { ts, limits: parsed };
    }
  }
  return { events, limits };
}

export function summarise(tool: "codex" | "claude", events: UsageEvent[], now: number, windowDays: number, cli: ToolUsage["cli"], limits: RateLimit[] = []): ToolUsage {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const today = zero(), last5h = zero(), last7d = zero();
  const days = new Map<string, number>();
  const models = new Map<string, number>();
  let last = 0;
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(startOfDay); d.setDate(d.getDate() - i);
    days.set(localDate(d), 0);
  }
  for (const e of events) {
    const tot = e.input + e.output + e.cacheRead + e.cacheWrite;
    if (e.ts >= startOfDay.getTime()) add(today, e);
    if (e.ts >= now - 5 * 3600_000) add(last5h, e);
    if (e.ts >= now - 7 * 86400_000) add(last7d, e);
    const k = localDate(new Date(e.ts));
    if (days.has(k)) days.set(k, (days.get(k) ?? 0) + tot);
    models.set(e.model, (models.get(e.model) ?? 0) + tot);
    last = Math.max(last, e.ts);
  }
  return {
    tool, cli, dataFound: events.length > 0, today, last5h, last7d,
    days: [...days].map(([date, total]) => ({ date, total })),
    models: [...models].map(([model, total]) => ({ model, total })).sort((a, b) => b.total - a.total).slice(0, 8),
    limits, lastActivity: last ? new Date(last).toISOString() : null,
  };
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function* walk(dir: string, sinceMs: number): AsyncGenerator<string> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, sinceMs);
    else if (e.name.endsWith(".jsonl")) {
      try { if ((await stat(p)).mtimeMs >= sinceMs) yield p; } catch { /* file vanished */ }
    }
  }
}

export function cliVersion(bin: string, timeoutMs = 4000): Promise<ToolUsage["cli"]> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve({ installed: false, version: null });
      resolve({ installed: true, version: String(stdout).trim().split("\n")[0] || null });
    });
  });
}

export type Paths = { codexHome: string; claudeHome: string };
export const defaultPaths = (): Paths => ({
  codexHome: process.env.CODEX_HOME || join(homedir(), ".codex"),
  claudeHome: process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
});

export async function collect(paths: Paths = defaultPaths(), windowDays = 14, now = Date.now()): Promise<UsageSnapshot> {
  const since = now - windowDays * 86400_000;
  const [codexCli, claudeCli] = await Promise.all([cliVersion("codex"), cliVersion("claude")]);

  const claudeEvents: UsageEvent[] = [];
  const seen = new Set<string>();
  for await (const f of walk(join(paths.claudeHome, "projects"), since)) {
    try { claudeEvents.push(...parseClaudeLog(await readFile(f, "utf8"), seen)); } catch { /* unreadable */ }
  }

  const codexEvents: UsageEvent[] = [];
  let latest: { ts: number; limits: RateLimit[] } | null = null;
  for await (const f of walk(join(paths.codexHome, "sessions"), since)) {
    try {
      const r = parseCodexLog(await readFile(f, "utf8"));
      codexEvents.push(...r.events);
      if (r.limits && (!latest || r.limits.ts > latest.ts)) latest = r.limits;
    } catch { /* unreadable */ }
  }

  return {
    generatedAt: new Date(now).toISOString(), windowDays,
    codex: summarise("codex", codexEvents.filter((e) => e.ts >= since), now, windowDays, codexCli, latest?.limits ?? []),
    claude: summarise("claude", claudeEvents.filter((e) => e.ts >= since), now, windowDays, claudeCli),
  };
}

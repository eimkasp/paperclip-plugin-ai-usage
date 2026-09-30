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
export type Status = "ok" | "watch" | "high" | "unknown";
export type Weekly = {
  percent: number | null;
  status: Status;
  basis: "codex-limit" | "budget" | null;
  tokens: number;
  resetsAt: string | null;
  note: string;
};
export type AgentRef = { name: string; status: string };
export type ToolView = ToolUsage & { weekly: Weekly; agents: AgentRef[] };
export type UsageSnapshot = { generatedAt: string; windowDays: number; codex: ToolUsage; claude: ToolUsage };
export type UsageView = { generatedAt: string; windowDays: number; codex: ToolView; claude: ToolView; overall: Weekly };
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

/** Claude Code: assistant messages carry message.usage. Each event keeps its message+request id so callers can dedupe across files. */
export function parseClaudeKeyed(text: string): { key: string; event: UsageEvent }[] {
  const out: { key: string; event: UsageEvent }[] = [];
  for (const row of jsonLines(text)) {
    const u = row?.message?.usage;
    if (row?.type !== "assistant" || !u) continue;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    const model = String(row.message.model ?? "unknown");
    if (model === "<synthetic>") continue;
    const key = `${row.message.id ?? ""}:${row.requestId ?? ""}`;
    out.push({ key, event: { ts, model, input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens) } });
  }
  return out;
}

export function parseClaudeLog(text: string, seen = new Set<string>()): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const { key, event } of parseClaudeKeyed(text)) {
    if (key !== ":") { if (seen.has(key)) continue; seen.add(key); }
    out.push(event);
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

type FileCache<T> = Map<string, { mtimeMs: number; size: number; value: T }>;
const claudeCache: FileCache<{ key: string; event: UsageEvent }[]> = new Map();
const codexCache: FileCache<ReturnType<typeof parseCodexLog>> = new Map();

/** Session logs are append-only, so an unchanged file (same size and mtime) is never parsed twice. */
async function cached<T>(cache: FileCache<T>, file: string, parse: (text: string) => T): Promise<T> {
  const st = await stat(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.value;
  const value = parse(await readFile(file, "utf8"));
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, value });
  return value;
}

export async function collect(paths: Paths = defaultPaths(), windowDays = 14, now = Date.now()): Promise<UsageSnapshot> {
  const since = now - windowDays * 86400_000;
  const [codexCli, claudeCli] = await Promise.all([cliVersion("codex"), cliVersion("claude")]);

  const claudeEvents: UsageEvent[] = [];
  const seen = new Set<string>();
  for await (const f of walk(join(paths.claudeHome, "projects"), since)) {
    try {
      for (const { key, event } of await cached(claudeCache, f, parseClaudeKeyed)) {
        if (event.ts < since) continue;
        if (key !== ":") { if (seen.has(key)) continue; seen.add(key); }
        claudeEvents.push(event);
      }
    } catch { /* unreadable */ }
  }

  const codexEvents: UsageEvent[] = [];
  let latest: { ts: number; limits: RateLimit[] } | null = null;
  for await (const f of walk(join(paths.codexHome, "sessions"), since)) {
    try {
      const r = await cached(codexCache, f, parseCodexLog);
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

/** Green under 60%, yellow from 60%, red from 85%. Colour is never the only signal: the UI also prints the word. */
export function statusFor(percent: number | null): Status {
  if (percent === null) return "unknown";
  return percent >= 85 ? "high" : percent >= 60 ? "watch" : "ok";
}

const WEEK_MINUTES = 7 * 24 * 60;

/** Codex reports its own weekly window. Once that window has reset, the last reading no longer applies. */
export function codexWeekly(u: ToolUsage, now: number): Weekly {
  const w = u.limits.find((l) => (l.windowMinutes ?? 0) >= WEEK_MINUTES - 60);
  const tokens = u.last7d.total;
  if (!w) return { percent: null, status: "unknown", basis: null, tokens, resetsAt: null, note: u.dataFound ? "Codex has not reported a weekly limit yet." : "No Codex usage found." };
  if (w.resetsAt && Date.parse(w.resetsAt) < now) return { percent: 0, status: "ok", basis: "codex-limit", tokens, resetsAt: null, note: "Weekly window has reset since the last Codex run." };
  const percent = Math.min(100, Math.max(0, w.usedPercent));
  return { percent, status: statusFor(percent), basis: "codex-limit", tokens, resetsAt: w.resetsAt, note: "Reported by Codex at its last run." };
}

/** Claude Code logs carry no plan limit, so the percentage is measured against a budget the operator sets. Cache reads are excluded. */
export function claudeWeekly(u: ToolUsage, budget: number | null): Weekly {
  const t = u.last7d;
  const tokens = t.input + t.output + t.cacheWrite;
  if (!budget || budget <= 0) return { percent: null, status: "unknown", basis: null, tokens, resetsAt: null, note: "Set a weekly token budget in the plugin settings to see a percentage." };
  const percent = Math.min(999, (tokens / budget) * 100);
  return { percent, status: statusFor(percent), basis: "budget", tokens, resetsAt: null, note: `Rolling 7 days against your ${budget.toLocaleString("en-US")} token budget.` };
}

/** The tighter of the two limits is what will stop work first. */
export function overallWeekly(a: Weekly, b: Weekly): Weekly {
  const known = [a, b].filter((w) => w.percent !== null);
  if (!known.length) return { percent: null, status: "unknown", basis: null, tokens: a.tokens + b.tokens, resetsAt: null, note: "No weekly percentage available yet." };
  const top = known.reduce((x, y) => ((y.percent ?? 0) > (x.percent ?? 0) ? y : x));
  return { ...top, tokens: a.tokens + b.tokens, note: known.length === 2 ? "Highest of Codex and Claude Code." : top.note };
}

export function decorate(snap: UsageSnapshot, opts: { claudeBudget: number | null; agents: { codex: AgentRef[]; claude: AgentRef[] } }, now = Date.now()): UsageView {
  const codex = { ...snap.codex, weekly: codexWeekly(snap.codex, now), agents: opts.agents.codex };
  const claude = { ...snap.claude, weekly: claudeWeekly(snap.claude, opts.claudeBudget), agents: opts.agents.claude };
  return { generatedAt: snap.generatedAt, windowDays: snap.windowDays, codex, claude, overall: overallWeekly(codex.weekly, claude.weekly) };
}

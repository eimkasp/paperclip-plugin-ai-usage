import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { claudeCliUsage, collect, decorate, type ClaudeLimits, type AgentRef, type UsageSnapshot, type UsageView, type Warming } from "./lib/usage.ts";

const TTL_MS = 30_000;
let cache: { at: number; snap: UsageSnapshot } | null = null;
let inflight: Promise<UsageSnapshot> | null = null;

const WARM_WAIT_MS = 20_000;
let warmingSince: string | null = null;

const CLI_TTL_MS = 120_000;
let cliCache: { at: number; limits: ClaudeLimits | null } | null = null;
let cliInflight: Promise<ClaudeLimits | null> | null = null;

/** The CLI report takes a few seconds, so it is cached for two minutes and shared between callers. */
async function claudeLimits(force: boolean): Promise<ClaudeLimits | null> {
  if (!force && cliCache && Date.now() - cliCache.at < CLI_TTL_MS) return cliCache.limits;
  cliInflight ??= claudeCliUsage().then((limits) => { cliCache = { at: Date.now(), limits }; return limits; }).finally(() => { cliInflight = null; });
  return cliInflight;
}

async function snapshot(force: boolean): Promise<UsageSnapshot> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.snap;
  inflight ??= collect().then((snap) => { cache = { at: Date.now(), snap }; return snap; }).finally(() => { inflight = null; });
  return inflight;
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    void snapshot(false).catch(() => undefined);
    void claudeLimits(false).catch(() => undefined); // warm the per-file cache so the first page view is fast
    ctx.data.register("usage", async (params: Record<string, unknown> = {}): Promise<UsageView | Warming> => {
      const force = params.refresh === true;
      // The first read after a restart parses every recent session log, which can outlast the host's 30s RPC limit.
      // Answer "warming" instead of timing out; the work carries on and the next poll is served from cache.
      const ready = Promise.all([snapshot(force), claudeLimits(force)]);
      const first = await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), WARM_WAIT_MS))]);
      if (!first) return { warming: true, since: warmingSince ??= new Date().toISOString() };
      warmingSince = null;
      const [snap, claudeCli] = first;
      const cfg = (await ctx.config.get().catch(() => ({}))) as { claudeWeeklyTokenBudget?: unknown };
      const budget = typeof cfg.claudeWeeklyTokenBudget === "number" && cfg.claudeWeeklyTokenBudget > 0 ? cfg.claudeWeeklyTokenBudget : null;
      const agents: { codex: AgentRef[]; claude: AgentRef[] } = { codex: [], claude: [] };
      if (typeof params.companyId === "string" && params.companyId) {
        try {
          for (const a of await ctx.agents.list({ companyId: params.companyId })) {
            const ref = { name: a.name, status: String(a.status), urlKey: a.urlKey ?? null };
            if (a.adapterType === "codex_local") agents.codex.push(ref);
            if (a.adapterType === "claude_local") agents.claude.push(ref);
          }
        } catch { /* agents are optional context */ }
      }
      return decorate(snap, { claudeBudget: budget, claudeCli, agents });
    });
  },
  async onHealth() {
    return { status: "ok", message: "AI usage ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);

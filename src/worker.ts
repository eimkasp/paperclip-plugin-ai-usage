import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { collect, decorate, type AgentRef, type UsageSnapshot, type UsageView } from "./lib/usage.ts";

const TTL_MS = 30_000;
let cache: { at: number; snap: UsageSnapshot } | null = null;
let inflight: Promise<UsageSnapshot> | null = null;

async function snapshot(force: boolean): Promise<UsageSnapshot> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.snap;
  inflight ??= collect().then((snap) => { cache = { at: Date.now(), snap }; return snap; }).finally(() => { inflight = null; });
  return inflight;
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    void snapshot(false).catch(() => undefined); // warm the per-file cache so the first page view is fast
    ctx.data.register("usage", async (params: Record<string, unknown> = {}): Promise<UsageView> => {
      const snap = await snapshot(params.refresh === true);
      const cfg = (await ctx.config.get().catch(() => ({}))) as { claudeWeeklyTokenBudget?: unknown };
      const budget = typeof cfg.claudeWeeklyTokenBudget === "number" && cfg.claudeWeeklyTokenBudget > 0 ? cfg.claudeWeeklyTokenBudget : null;
      const agents: { codex: AgentRef[]; claude: AgentRef[] } = { codex: [], claude: [] };
      if (typeof params.companyId === "string" && params.companyId) {
        try {
          for (const a of await ctx.agents.list({ companyId: params.companyId })) {
            const ref = { name: a.name, status: String(a.status) };
            if (a.adapterType === "codex_local") agents.codex.push(ref);
            if (a.adapterType === "claude_local") agents.claude.push(ref);
          }
        } catch { /* agents are optional context */ }
      }
      return decorate(snap, { claudeBudget: budget, agents });
    });
  },
  async onHealth() {
    return { status: "ok", message: "AI usage ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);

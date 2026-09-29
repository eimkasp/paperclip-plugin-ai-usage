import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { collect, type UsageSnapshot } from "./lib/usage.ts";

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
    ctx.data.register("usage", async (params: Record<string, unknown> = {}) => snapshot(params.refresh === true));
  },
  async onHealth() {
    return { status: "ok", message: "AI usage ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);

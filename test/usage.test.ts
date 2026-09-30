import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaudeLog, parseCodexLog, summarise } from "../src/lib/usage.ts";

const now = Date.parse("2026-09-29T12:00:00Z");
const cli = { installed: true, version: "x" };

test("claude: sums usage, dedupes by message+request id, skips synthetic", () => {
  const row = (id: string, model = "claude-sonnet-5-5") => JSON.stringify({ type: "assistant", timestamp: "2026-09-29T11:00:00Z", requestId: "r" + id, message: { id, model, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 } } });
  const text = [row("a"), row("a"), row("b", "<synthetic>"), "not json", JSON.stringify({ type: "user" })].join("\n");
  const ev = parseClaudeLog(text);
  assert.equal(ev.length, 1);
  const s = summarise("claude", ev, now, 7, cli);
  assert.equal(s.last5h.total, 116);
  assert.equal(s.models[0].model, "claude-sonnet-5-5");
});

test("codex: per-turn usage, cached split out, latest rate limits", () => {
  const text = [
    JSON.stringify({ timestamp: "2026-09-29T10:00:00Z", type: "turn_context", payload: { model: "gpt-5-codex" } }),
    JSON.stringify({ timestamp: "2026-09-29T10:01:00Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 } }, rate_limits: { primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1790000000 }, secondary: { used_percent: 30, window_minutes: 10080, resets_at: null } } } }),
  ].join("\n");
  const r = parseCodexLog(text);
  assert.equal(r.events.length, 1);
  assert.deepEqual([r.events[0].input, r.events[0].cacheRead, r.events[0].output], [60, 40, 20]);
  assert.equal(r.limits?.limits[0].label, "5h window");
  assert.equal(r.limits?.limits[1].label, "7d window");
  assert.equal(summarise("codex", r.events, now, 7, cli, r.limits!.limits).today.total, 120);
});

test("summarise: empty input reports no data with full day series", () => {
  const s = summarise("codex", [], now, 14, { installed: false, version: null });
  assert.equal(s.dataFound, false);
  assert.equal(s.days.length, 14);
});

import { statusFor, codexWeekly, claudeWeekly, overallWeekly } from "../src/lib/usage.ts";

test("status thresholds: green under 60, yellow 60-84, red 85+", () => {
  assert.deepEqual([0, 59.9, 60, 84.9, 85, 100].map(statusFor), ["ok", "ok", "watch", "watch", "high", "high"]);
  assert.equal(statusFor(null), "unknown");
});

test("codex weekly: uses the 7-day window, resets to 0 once the window has passed", () => {
  const limits = [{ label: "7d window", usedPercent: 72, windowMinutes: 10080, resetsAt: "2026-10-03T20:00:00.000Z" }];
  const u = summarise("codex", [], now, 7, cli, limits);
  assert.equal(codexWeekly(u, now).percent, 72);
  assert.equal(codexWeekly(u, now).status, "watch");
  assert.equal(codexWeekly(u, Date.parse("2026-10-05T00:00:00Z")).percent, 0);
  assert.equal(codexWeekly(summarise("codex", [], now, 7, cli, []), now).status, "unknown");
});

test("claude weekly: percent of budget, excludes cache reads, unknown without a budget", () => {
  const ev = [{ ts: now - 3600_000, model: "m", input: 100, output: 50, cacheRead: 10_000, cacheWrite: 50 }];
  const u = summarise("claude", ev, now, 7, cli);
  assert.equal(claudeWeekly(u, null).percent, null);
  const w = claudeWeekly(u, 400);
  assert.equal(w.tokens, 200);
  assert.equal(w.percent, 50);
  assert.equal(w.status, "ok");
});

test("overall weekly is the higher of the known percentages", () => {
  const mk = (percent: number | null) => ({ percent, status: statusFor(percent), basis: null, tokens: 1, resetsAt: null, note: "" }) as const;
  assert.equal(overallWeekly(mk(30), mk(90)).status, "high");
  assert.equal(overallWeekly(mk(null), mk(40)).percent, 40);
  assert.equal(overallWeekly(mk(null), mk(null)).status, "unknown");
});

import { parseClaudeUsage } from "../src/lib/usage.ts";

const SAMPLE = `You are currently using your subscription to power your Claude Code usage

Current session: 1% used · resets Sep 30 at 7:40pm (Europe/Vilnius)
Current week (all models): 96% used · resets Oct 3 at 5pm (Europe/Vilnius)
Current week (Fable): 0% used · resets Oct 3 at 5pm (Europe/Vilnius)

Last 7d · 38494 requests · 44 sessions
  83% of your usage came from subagent-heavy sessions`;

test("claude /usage: parses plan limit lines and ignores the rest", () => {
  const l = parseClaudeUsage(SAMPLE);
  assert.equal(l.length, 3);
  assert.deepEqual(l[1], { label: "Current week (all models)", percent: 96, resetsText: "Oct 3 at 5pm (Europe/Vilnius)" });
  assert.equal(parseClaudeUsage("nothing useful").length, 0);
});

test("claude weekly prefers the CLI plan limit over a budget, keeps other lines as extras", () => {
  const u = summarise("claude", [], now, 7, cli);
  const w = claudeWeekly(u, 100, parseClaudeUsage(SAMPLE));
  assert.equal(w.percent, 96);
  assert.equal(w.status, "high");
  assert.equal(w.basis, "claude-cli");
  assert.equal(w.extras?.length, 2);
  assert.equal(claudeWeekly(u, null, null).status, "unknown");
});

import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "eimkasp.ai-usage",
  apiVersion: 1,
  version: "0.2.0",
  displayName: "AI CLI Usage",
  description: "Shows Codex CLI and Claude Code weekly usage (percent, tokens, models, rate-limit windows) with green, yellow and red status, read locally from the CLIs' own session data. Read-only; nothing leaves the machine.",
  author: "eimkasp",
  categories: ["workspace", "ui"],
  capabilities: ["agents.read", "ui.page.register", "ui.dashboardWidget.register", "ui.sidebar.register"],
  instanceConfigSchema: {
    type: "object",
    properties: {
      claudeWeeklyTokenBudget: {
        type: "number",
        minimum: 0,
        description: "Weekly token budget for Claude Code (input + output + cache writes). Claude Code logs carry no plan limit, so the weekly percentage is measured against this number. Leave empty to hide the percentage.",
      },
    },
  },
  entrypoints: { worker: "dist/worker.js", ui: "dist/ui" },
  ui: {
    slots: [
      { type: "page", id: "ai-usage-page", displayName: "AI Usage", exportName: "AiUsagePage", routePath: "ai-usage" },
      { type: "dashboardWidget", id: "ai-usage-widget", displayName: "AI CLI usage", exportName: "AiUsageWidget", order: 20 },
      { type: "sidebar", id: "ai-usage-nav", displayName: "AI Usage", exportName: "AiUsageSidebar", order: 60 },
    ],
  },
};

export default manifest;

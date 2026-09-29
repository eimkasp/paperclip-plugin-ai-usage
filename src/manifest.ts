import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "eimkasp.ai-usage",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "AI CLI Usage",
  description: "Shows Codex CLI and Claude Code usage (tokens, models, rate-limit windows) read locally from the CLIs' own session data. Read-only; nothing leaves the machine.",
  author: "eimkasp",
  categories: ["workspace", "ui"],
  capabilities: ["ui.page.register", "ui.dashboardWidget.register", "ui.sidebar.register"],
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

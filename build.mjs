/**
 * Build the three bundles the host loads: manifest, worker, and UI.
 *
 * The configs come from the SDK's own bundler presets so the externals match
 * the plugin loader contract (React and the UI SDK stay external; the host
 * provides them at runtime).
 */

import { build } from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({
  workerEntry: "src/worker.ts",
  manifestEntry: "src/manifest.ts",
  uiEntry: "src/ui/index.tsx",
  outdir: "dist",
  minify: process.env.NODE_ENV === "production",
});

// The UI bundle is React with no runtime import of `react` in scope, so the
// automatic JSX runtime is required (it stays external per the preset).
const uiConfig = { ...presets.esbuild.ui, jsx: "automatic" };

await Promise.all([
  build(presets.esbuild.manifest),
  build(presets.esbuild.worker),
  build(uiConfig),
]);

console.log("built dist/manifest.js, dist/worker.js, dist/ui/index.js");

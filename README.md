# Paperclip AI CLI Usage

Paperclip plugin that shows **Codex CLI** and **Claude Code** usage inside Paperclip: tokens today, in the last 5 hours and over 7 days, a 14-day sparkline, per-model totals, and Codex rate-limit windows with reset times. It also reports whether each CLI is installed (`codex --version`, `claude --version`).

Adds a dashboard widget, an **AI Usage** page (`/ai-usage`) and a sidebar link.

## How it works

The worker reads the CLIs' own local session logs on the machine running Paperclip:

- Claude Code: `$CLAUDE_CONFIG_DIR` or `~/.claude/projects/**/*.jsonl` (assistant `message.usage`)
- Codex CLI: `$CODEX_HOME` or `~/.codex/sessions/**/*.jsonl` (`token_count` events, including rate limits)

Only token counts, model names, timestamps and rate-limit fields are extracted. Prompts and responses are never stored, returned or transmitted. The plugin is read-only and makes no network requests. Results are cached for 30 seconds.

Claude Code logs contain no plan rate-limit data, so it shows token totals only (the 5h figure is a rolling 5-hour sum, not your plan quota). Codex percentages come from the latest event Codex recorded, so they are as fresh as your last Codex run.

## Trust

Paperclip plugin workers are trusted code with no filesystem sandbox. This plugin declares only UI capabilities, but it reads your home-directory CLI logs and runs the two `--version` commands. Review the source in `src/lib/usage.ts` before installing. It suits a single-user, local Paperclip instance and will show nothing on hosts without those CLIs.

## Install

From npm, in Paperclip's plugin settings install the package `paperclip-plugin-ai-usage`, or from a checkout:

```bash
npm install && npm run build
paperclipai plugin install "$PWD"
```

## Develop

```bash
npm run verify   # typecheck, tests, build
```

MIT licensed.

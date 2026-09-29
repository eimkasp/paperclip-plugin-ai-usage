import { usePluginData, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import type { ToolUsage, UsageSnapshot, Tokens } from "../lib/usage.ts";

const styles = `
.au { font-family: inherit; color: inherit; padding: 24px; font-size: 14px; max-width: 100%; }
.au h1 { font-size: 1.25rem; margin: 0 0 4px; }
.au h2 { font-size: 1.05rem; margin: 0 0 8px; display: flex; gap: 8px; align-items: center; }
.au-note { opacity: .7; font-size: .8rem; }
.au-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 16px; }
.au-card { border: 1px solid var(--border, #8885); padding: 16px; min-width: 0; }
.au-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
.au-stat b { display: block; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.au-stat span { font-size: .75rem; opacity: .7; }
.au-bar { height: 8px; background: var(--border, #8883); margin: 4px 0 10px; }
.au-bar i { display: block; height: 100%; background: currentColor; }
.au-days { display: flex; align-items: flex-end; gap: 3px; height: 56px; margin: 12px 0; }
.au-days i { flex: 1; background: currentColor; opacity: .55; min-height: 1px; }
.au-badge { font-size: .72rem; padding: 1px 6px; border: 1px solid var(--border, #8885); font-weight: 400; }
.au-btn { padding: 6px 14px; border: 1px solid var(--border, #8885); background: transparent; color: inherit; font: inherit; cursor: pointer; min-height: 36px; }
.au-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.au table { border-collapse: collapse; width: 100%; font-size: .85rem; }
.au td { padding: 4px 0; border-bottom: 1px solid var(--border, #8883); }
.au td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .au { padding: 16px; } .au-grid { grid-template-columns: 1fr; } }
`;

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const reset = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "unknown");

function Stat({ label, t }: { label: string; t: Tokens }) {
  return <div className="au-stat"><b>{fmt(t.total)}</b><span>{label}</span></div>;
}

function ToolCard({ u, compact }: { u: ToolUsage; compact?: boolean }) {
  const name = u.tool === "codex" ? "Codex CLI" : "Claude Code";
  const max = Math.max(1, ...u.days.map((d) => d.total));
  return (
    <section className="au-card" aria-label={name}>
      <h2>{name}<span className="au-badge">{u.cli.installed ? `CLI ${u.cli.version ?? "connected"}` : "CLI not found"}</span></h2>
      {!u.dataFound ? (
        <p className="au-note">No usage found in the last window. Run {u.tool} once on this machine and refresh.</p>
      ) : (
        <>
          <div className="au-stats"><Stat label="Today" t={u.today} /><Stat label="Last 5h" t={u.last5h} /><Stat label="7 days" t={u.last7d} /></div>
          {u.limits.map((l) => (
            <div key={l.label}>
              <div className="au-note">{l.label}: {l.usedPercent.toFixed(0)}% used, resets {reset(l.resetsAt)}</div>
              <div className="au-bar" role="progressbar" aria-valuenow={Math.round(l.usedPercent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, l.usedPercent)}%` }} /></div>
            </div>
          ))}
          <div className="au-days" aria-hidden="true">{u.days.map((d) => <i key={d.date} title={`${d.date}: ${fmt(d.total)}`} style={{ height: `${(d.total / max) * 100}%` }} />)}</div>
          {!compact && <table><tbody>{u.models.map((m) => <tr key={m.model}><td>{m.model}</td><td>{fmt(m.total)}</td></tr>)}</tbody></table>}
          <p className="au-note">Tokens include cache reads/writes. Last activity {u.lastActivity ? new Date(u.lastActivity).toLocaleString() : "n/a"}.</p>
        </>
      )}
    </section>
  );
}

function useUsage() {
  return usePluginData<UsageSnapshot>("usage", {});
}

export function AiUsagePage() {
  const { data, loading, error, refresh } = useUsage();
  return (
    <div className="au"><style>{styles}</style>
      <h1>AI CLI usage</h1>
      <p className="au-note">Read locally from Codex CLI and Claude Code session data. {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}.` : ""}</p>
      <button className="au-btn" onClick={() => refresh()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      {error && <p role="alert">Could not load usage: {error.message}</p>}
      {data && <div className="au-grid"><ToolCard u={data.codex} /><ToolCard u={data.claude} /></div>}
    </div>
  );
}

export function AiUsageWidget() {
  const { data, loading, error } = useUsage();
  return (
    <div className="au" style={{ padding: 0 }}><style>{styles}</style>
      {loading && !data && <p className="au-note">Loading…</p>}
      {error && <p role="alert">Could not load usage: {error.message}</p>}
      {data && <div className="au-grid"><ToolCard u={data.codex} compact /><ToolCard u={data.claude} compact /></div>}
    </div>
  );
}

export function AiUsageSidebar() {
  const nav = useHostNavigation();
  return <a {...nav.linkProps("/ai-usage")} style={{ display: "block", padding: "6px 10px", color: "inherit", textDecoration: "none" }}>AI Usage</a>;
}

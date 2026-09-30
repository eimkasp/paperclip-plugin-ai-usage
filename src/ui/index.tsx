import { usePluginData, useHostNavigation, type PluginPageProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import type { ToolView, UsageView, Tokens, Weekly, Status } from "../lib/usage.ts";

const styles = `
.au { --au-ok: #22a559; --au-watch: #d99a06; --au-high: #e5484d; --au-none: #8a8f98; }
.au [data-status="ok"] { --au-c: var(--au-ok); }
.au [data-status="watch"] { --au-c: var(--au-watch); }
.au [data-status="high"] { --au-c: var(--au-high); }
.au [data-status="unknown"] { --au-c: var(--au-none); }
.au-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--au-c); color: var(--au-c); font-size: .72rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.au-pill::before { content: ""; width: 8px; height: 8px; background: var(--au-c); border-radius: 50%; }
.au-hero { display: grid; grid-template-columns: auto 1fr; gap: 20px; align-items: center; margin-top: 16px; padding: 20px; border: 1px solid var(--border, #8885); border-left: 4px solid var(--au-c); }
.au-big { font-size: 2.6rem; line-height: 1; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--au-c); }
.au-meter { height: 12px; background: var(--border, #8883); margin: 8px 0; position: relative; overflow: hidden; }
.au-meter i { display: block; height: 100%; background: var(--au-c); }
.au-meter::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to right, transparent 59.6%, #8886 59.6%, #8886 60%, transparent 60%, transparent 84.6%, #8886 84.6%, #8886 85%, transparent 85%); }
.au-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--au-c); }
.au-agents { margin: 8px 0 0; font-size: .8rem; opacity: .85; }
.au-legend { display: flex; gap: 14px; flex-wrap: wrap; margin: 12px 0 0; font-size: .75rem; opacity: .8; }
.au-legend span::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--au-c); }
.au-weekly { margin: 12px 0; padding: 12px; border: 1px solid var(--border, #8885); border-left: 3px solid var(--au-c); }
.au-weekly-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.au-weekly-pct { font-size: 1.5rem; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--au-c); }
@media (max-width: 600px) { .au-hero { grid-template-columns: 1fr; } }
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

const label: Record<Status, string> = { ok: "OK", watch: "Watch", high: "High", unknown: "No data" };
const pct = (w: Weekly) => (w.percent === null ? "—" : `${Math.round(w.percent)}%`);

const note = (w: Weekly) => `${w.note}${w.resetsAt ? ` Resets ${reset(w.resetsAt)}.` : w.resetsText ? ` Resets ${w.resetsText}.` : ""}`;

function Meter({ w }: { w: Weekly }) {
  return (
    <div className="au-meter" role="progressbar" aria-label="Weekly usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.percent === null ? undefined : Math.round(Math.min(100, w.percent))}>
      <i style={{ width: `${Math.min(100, w.percent ?? 0)}%` }} />
    </div>
  );
}

function Overall({ w }: { w: Weekly }) {
  return (
    <section className="au-hero" data-status={w.status} aria-label="Overall weekly usage">
      <div className="au-big">{pct(w)}</div>
      <div>
        <div><b>Weekly usage, overall</b> <span className="au-pill">{label[w.status]}</span></div>
        <Meter w={w} />
        <div className="au-note">{note(w)}</div>
        <div className="au-legend"><span data-status="ok">Under 60%</span><span data-status="watch">60–84%</span><span data-status="high">85% and over</span></div>
      </div>
    </section>
  );
}

function ToolCard({ u, compact }: { u: ToolView; compact?: boolean }) {
  const name = u.tool === "codex" ? "Codex CLI" : "Claude Code";
  const max = Math.max(1, ...u.days.map((d) => d.total));
  const w = u.weekly;
  return (
    <section className="au-card" aria-label={name}>
      <h2>{name}<span className="au-badge">{u.cli.installed ? `CLI ${u.cli.version ?? "connected"}` : "CLI not found"}</span></h2>
      <div className="au-weekly" data-status={w.status}>
        <div className="au-weekly-top"><span>Weekly usage <span className="au-pill">{label[w.status]}</span></span><span className="au-weekly-pct">{pct(w)}</span></div>
        <Meter w={w} />
        <div className="au-note">{note(w)}</div>
        {w.extras?.map((x) => <div key={x.label} className="au-note" data-status={x.percent >= 85 ? "high" : x.percent >= 60 ? "watch" : "ok"}><span className="au-dot" />{x.label.replace("Current ", "")}: {Math.round(x.percent)}%{x.resetsText ? `, resets ${x.resetsText}` : ""}</div>)}
      </div>
      <p className="au-agents">{u.agents.length ? `Used by ${u.agents.length} agent${u.agents.length === 1 ? "" : "s"} here: ${u.agents.map((a) => a.name).join(", ")}` : "No Paperclip agents in this company use this CLI."}</p>
      {!u.dataFound ? (
        <p className="au-note">No usage found in the last window. Run {u.tool} once on this machine and refresh.</p>
      ) : (
        <>
          <div className="au-stats"><Stat label="Today" t={u.today} /><Stat label="Last 5h" t={u.last5h} /><Stat label="7 days" t={u.last7d} /></div>
          <div className="au-days" aria-hidden="true">{u.days.map((d) => <i key={d.date} title={`${d.date}: ${fmt(d.total)}`} style={{ height: `${(d.total / max) * 100}%` }} />)}</div>
          {!compact && <table><tbody>{u.models.map((m) => <tr key={m.model}><td>{m.model}</td><td>{fmt(m.total)}</td></tr>)}</tbody></table>}
          <p className="au-note">Tokens include cache reads/writes. Last activity {u.lastActivity ? new Date(u.lastActivity).toLocaleString() : "n/a"}.</p>
        </>
      )}
    </section>
  );
}

function useUsage(companyId: string | null) {
  return usePluginData<UsageView>("usage", { companyId });
}

export function AiUsagePage({ context }: PluginPageProps) {
  const { data, loading, error, refresh } = useUsage(context.companyId);
  return (
    <div className="au"><style>{styles}</style>
      <h1>AI CLI usage</h1>
      <p className="au-note">Read locally from Codex CLI and Claude Code session data. {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}.` : ""}</p>
      <button className="au-btn" onClick={() => refresh()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      {error && <p role="alert">Could not load usage: {error.message}</p>}
      {data && <><Overall w={data.overall} /><div className="au-grid"><ToolCard u={data.codex} /><ToolCard u={data.claude} /></div></>}
    </div>
  );
}

export function AiUsageWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = useUsage(context.companyId);
  return (
    <div className="au" style={{ padding: 0 }}><style>{styles}</style>
      {loading && !data && <p className="au-note">Loading…</p>}
      {error && <p role="alert">Could not load usage: {error.message}</p>}
      {data && <><Overall w={data.overall} /><div className="au-grid"><ToolCard u={data.codex} compact /><ToolCard u={data.claude} compact /></div></>}
    </div>
  );
}

export function AiUsageSidebar() {
  const nav = useHostNavigation();
  return <a {...nav.linkProps("/ai-usage")} style={{ display: "block", padding: "6px 10px", color: "inherit", textDecoration: "none" }}>AI Usage</a>;
}

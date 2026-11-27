import { useEffect, useState } from "react";
import { usePluginData, useHostNavigation, type PluginPageProps, type PluginWidgetProps, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import type { ToolView, UsageView, Warming, Tokens, Weekly, Status } from "../lib/usage.ts";

const styles = `
.au { --au-ok: #22a559; --au-watch: #d99a06; --au-high: #e5484d; --au-none: #8a8f98;
  --au-line: var(--border, #8884); --au-muted: var(--muted-foreground, #8a8f98); --au-track: var(--muted, #8883); --au-r: var(--radius, 8px);
  font-family: inherit; color: inherit; font-size: 14px; max-width: 100%; }
.au [data-status="ok"], .au[data-status="ok"] { --au-c: var(--au-ok); }
.au [data-status="watch"], .au[data-status="watch"] { --au-c: var(--au-watch); }
.au [data-status="high"], .au[data-status="high"] { --au-c: var(--au-high); }
.au [data-status="unknown"], .au[data-status="unknown"] { --au-c: var(--au-none); }
.au-page { padding: 24px; max-width: 1200px; }
.au-muted { color: var(--au-muted); }
.au-small { font-size: .8rem; }
.au-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.au-head h1 { font-size: 1.25rem; margin: 0; }
.au-head p { margin: 4px 0 0; }
.au-btn { display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; min-height: 36px; border: 1px solid var(--au-line); border-radius: var(--au-r); background: transparent; color: inherit; font: inherit; font-size: .85rem; cursor: pointer; }
.au-btn:hover:not(:disabled) { background: var(--accent, #8882); }
.au-btn:focus-visible, .au a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.au-btn:disabled { opacity: .6; cursor: progress; }
.au-btn svg { width: 14px; height: 14px; }
.au-btn[aria-busy="true"] svg { animation: au-spin 1s linear infinite; }
@keyframes au-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .au-btn[aria-busy="true"] svg, .au-skel { animation: none !important; } .au-meter i { transition: none; } }
.au a { color: inherit; }
.au-pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--au-c) 14%, transparent); color: var(--au-c); font-size: .7rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.au-pill::before { content: ""; width: 6px; height: 6px; background: var(--au-c); border-radius: 50%; }
.au-num { font-variant-numeric: tabular-nums; }
.au-meter { height: 10px; background: var(--au-track); border-radius: 999px; position: relative; overflow: hidden; }
.au-meter i { display: block; height: 100%; background: var(--au-c); border-radius: 999px; transition: width .4s ease; }
.au-meter[data-size="s"] { height: 6px; }
.au-ticks { position: relative; height: 14px; font-size: .65rem; color: var(--au-muted); }
.au-ticks span { position: absolute; top: 2px; transform: translateX(-50%); }
.au-meter-wrap { position: relative; }
.au-meter-wrap::before, .au-meter-wrap::after { content: ""; position: absolute; top: -3px; height: 16px; width: 1px; background: var(--au-muted); opacity: .5; z-index: 1; }
.au-meter-wrap::before { left: 60%; } .au-meter-wrap::after { left: 85%; }
.au-hero { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; margin-top: 20px; padding: 20px 24px; border: 1px solid var(--au-line); border-radius: calc(var(--au-r) * 1.5); background: var(--card, transparent); }
.au-big { font-size: 3rem; line-height: 1; font-weight: 650; color: var(--au-c); letter-spacing: -.02em; }
.au-hero-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.au-hero-top b { font-weight: 600; }
.au-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-top: 16px; }
.au-card { border: 1px solid var(--au-line); border-radius: calc(var(--au-r) * 1.5); padding: 20px; min-width: 0; background: var(--card, transparent); display: flex; flex-direction: column; gap: 16px; }
.au-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.au-card-head h2 { font-size: 1rem; margin: 0; font-weight: 600; }
.au-ver { font-size: .72rem; color: var(--au-muted); font-variant-numeric: tabular-nums; }
.au-ver[data-missing] { color: var(--au-high); }
.au-weekly-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.au-weekly-top > span:first-child { display: inline-flex; align-items: center; gap: 8px; }
.au-weekly-pct { font-size: 1.6rem; font-weight: 650; color: var(--au-c); line-height: 1; }
.au-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: .78rem; color: var(--au-muted); }
.au-stale { color: var(--au-watch); }
.au-extras { display: grid; gap: 10px; margin-top: 14px; }
.au-extra { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; font-size: .8rem; }
.au-extra .au-meter { grid-column: 1 / -1; }
.au-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 0; border-top: 1px solid var(--au-line); border-bottom: 1px solid var(--au-line); }
.au-stat b { display: block; font-size: 1.2rem; font-weight: 600; }
.au-stat span { font-size: .75rem; color: var(--au-muted); }
.au-label { font-size: .7rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--au-muted); margin: 0 0 8px; }
.au-days { display: flex; align-items: flex-end; gap: 3px; height: 64px; }
.au-days i { flex: 1; background: currentColor; opacity: .3; min-height: 2px; border-radius: 2px 2px 0 0; }
.au-days i:hover { opacity: .6; }
.au-days i[data-today] { opacity: .85; }
.au-days-axis { display: flex; justify-content: space-between; font-size: .68rem; color: var(--au-muted); margin-top: 4px; }
.au-models { display: grid; gap: 8px; }
.au-model { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; font-size: .82rem; }
.au-model > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.au-share { grid-column: 1 / -1; height: 3px; background: var(--au-track); border-radius: 2px; overflow: hidden; }
.au-share i { display: block; height: 100%; background: currentColor; opacity: .5; }
.au-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.au-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--au-line); border-radius: 999px; font-size: .78rem; text-decoration: none; }
a.au-chip:hover { background: var(--accent, #8882); }
.au-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--au-c, var(--au-none)); }
.au-empty { padding: 16px; border: 1px dashed var(--au-line); border-radius: var(--au-r); font-size: .85rem; color: var(--au-muted); }
.au-empty code { font-size: .8rem; }
.au-skel { background: var(--au-track); border-radius: var(--au-r); animation: au-pulse 1.4s ease-in-out infinite; }
@keyframes au-pulse { 50% { opacity: .5; } }
.au-alert { margin-top: 16px; padding: 12px 16px; border: 1px solid var(--au-high); border-radius: var(--au-r); color: var(--au-high); font-size: .85rem; }
/* Dashboard widget */
.au-w { display: grid; gap: 14px; }
.au-w-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.au-w-head h3 { font-size: .9rem; margin: 0; font-weight: 600; }
.au-w-head a { font-size: .8rem; color: var(--au-muted); text-decoration: none; }
.au-w-head a:hover { color: inherit; }
.au-w-overall { display: flex; align-items: baseline; gap: 10px; }
.au-w-overall .au-big { font-size: 2.2rem; }
.au-w-row { display: grid; grid-template-columns: 96px 1fr 44px; gap: 12px; align-items: center; font-size: .82rem; }
.au-w-row .au-num { text-align: right; font-weight: 600; color: var(--au-c); }
/* Sidebar */
.au-side-pct { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: .75rem; font-variant-numeric: tabular-nums; color: var(--au-c); }
.au-side-pct::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--au-c); }
@media (max-width: 640px) {
  .au-page { padding: 16px; }
  .au-hero { grid-template-columns: 1fr; gap: 12px; padding: 16px; }
  .au-big { font-size: 2.4rem; }
  .au-grid { grid-template-columns: 1fr; }
  .au-card { padding: 16px; }
}
`;

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const statusLabel: Record<Status, string> = { ok: "OK", watch: "Watch", high: "High", unknown: "No data" };
const pct = (w: Weekly) => (w.percent === null ? "—" : `${Math.round(w.percent)}%`);
const toolName = (t: ToolView["tool"]) => (t === "codex" ? "Codex CLI" : "Claude Code");
const statusFor = (p: number): Status => (p >= 85 ? "high" : p >= 60 ? "watch" : "ok");

/** "2.1.328 (Claude Code)" and "codex-cli 0.170.0" both read as "v2.1.328" / "v0.170.0". */
const version = (v: string | null) => {
  const m = v?.match(/\d+\.\d+(?:\.\d+)?/);
  return m ? `v${m[0]}` : "installed";
};

function span(ms: number) {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function resetText(w: Weekly) {
  if (w.resetsAt) {
    const at = Date.parse(w.resetsAt);
    const when = new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    return at > Date.now() ? `Resets ${when}, in ${span(at - Date.now())}` : `Reset ${when}`;
  }
  return w.resetsText ? `Resets ${w.resetsText}` : null;
}

/** "Current session" → "Session", "Current week (Fable)" → "Week (Fable)". */
const limitLabel = (s: string) => {
  const t = s.replace(/^current\s+/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const STALE_MS = 24 * 3600_000;

function Meter({ percent, size, label }: { percent: number | null; size?: "s"; label: string }) {
  const v = percent === null ? undefined : Math.round(Math.min(100, percent));
  return (
    <div className="au-meter" data-size={size} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <i style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
    </div>
  );
}

/** Marks the 60% and 85% thresholds where the status turns yellow and red. */
function ThresholdMeter({ w, label }: { w: Weekly; label: string }) {
  return (
    <>
      <div className="au-meter-wrap"><Meter percent={w.percent} label={label} /></div>
      <div className="au-ticks" aria-hidden="true"><span style={{ left: "60%" }}>60</span><span style={{ left: "85%" }}>85</span></div>
    </>
  );
}

function Pill({ s }: { s: Status }) {
  return <span className="au-pill" data-status={s}>{statusLabel[s]}</span>;
}

function limitingTool(d: UsageView) {
  const a = d.codex.weekly.percent, b = d.claude.weekly.percent;
  if (a === null || b === null) return null;
  return b >= a ? "Claude Code" : "Codex CLI";
}

function Overall({ d }: { d: UsageView }) {
  const w = d.overall;
  const lead = limitingTool(d);
  const reset = resetText(w);
  return (
    <section className="au-hero" data-status={w.status} aria-label="Overall weekly usage">
      <div className="au-big au-num">{pct(w)}</div>
      <div>
        <div className="au-hero-top"><b>Weekly usage, overall</b><Pill s={w.status} /></div>
        <ThresholdMeter w={w} label="Overall weekly usage" />
        <div className="au-meta">
          <span>{lead ? `${lead} is closest to its limit` : w.note}</span>
          {reset && <span>{reset}</span>}
        </div>
      </div>
    </section>
  );
}

function Chart({ days }: { days: ToolView["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  const day = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <div>
      <p className="au-label">Tokens per day</p>
      <div className="au-days" role="img" aria-label={`Tokens per day over the last ${days.length} days; today ${fmt(days.at(-1)?.total ?? 0)}`}>
        {days.map((d, i) => <i key={d.date} data-today={i === days.length - 1 ? "" : undefined} title={`${day(d.date)}: ${fmt(d.total)} tokens`} style={{ height: `${(d.total / max) * 100}%` }} />)}
      </div>
      <div className="au-days-axis" aria-hidden="true"><span>{days[0] ? day(days[0].date) : ""}</span><span>Today</span></div>
    </div>
  );
}

const share = (n: number, sum: number) => { const p = (n / sum) * 100; return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`; };

function Models({ models }: { models: ToolView["models"] }) {
  const sum = models.reduce((a, m) => a + m.total, 0) || 1;
  return (
    <div>
      <p className="au-label">Models, 14 days</p>
      <div className="au-models">
        {models.map((m) => (
          <div className="au-model" key={m.model}>
            <span title={m.model}>{m.model}</span>
            <span className="au-num au-muted">{fmt(m.total)} · {share(m.total, sum)}</span>
            <div className="au-share" aria-hidden="true"><i style={{ width: `${(m.total / sum) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mix({ t }: { t: Tokens }) {
  const parts = ([["input", t.input], ["output", t.output], ["cache write", t.cacheWrite], ["cache read", t.cacheRead]] as const).filter(([, n]) => n > 0);
  if (!parts.length) return null;
  return <p className="au-small au-muted" style={{ margin: 0 }}>7 days: {parts.map(([k, n]) => `${fmt(n)} ${k}`).join(" · ")}</p>;
}

const agentStatus = (s: string): Status => (s === "error" ? "high" : s === "paused" ? "watch" : s === "running" || s === "active" || s === "idle" ? "ok" : "unknown");

function Agents({ u }: { u: ToolView }) {
  const nav = useHostNavigation();
  if (!u.agents.length) return null;
  return (
    <div>
      <p className="au-label">Agents on this CLI</p>
      <div className="au-chips">
        {u.agents.map((a) => a.urlKey
          ? <a key={a.name} className="au-chip" data-status={agentStatus(a.status)} title={`${a.name}: ${a.status}`} {...nav.linkProps(`/agents/${a.urlKey}`)}>{a.name}</a>
          : <span key={a.name} className="au-chip" data-status={agentStatus(a.status)} title={`${a.name}: ${a.status}`}>{a.name}</span>)}
      </div>
    </div>
  );
}

function ToolCard({ u }: { u: ToolView }) {
  const w = u.weekly;
  const reset = resetText(w);
  const age = u.lastActivity ? Date.now() - Date.parse(u.lastActivity) : 0;
  const stale = w.basis === "codex-limit" && w.resetsAt !== null && age > STALE_MS;
  return (
    <section className="au-card" aria-label={toolName(u.tool)}>
      <div className="au-card-head">
        <h2>{toolName(u.tool)}</h2>
        <span className="au-ver" data-missing={u.cli.installed ? undefined : ""} title={u.cli.version ?? undefined}>{u.cli.installed ? version(u.cli.version) : "CLI not found"}</span>
      </div>

      <div data-status={w.status}>
        <div className="au-weekly-top"><span>This week <Pill s={w.status} /></span><span className="au-weekly-pct au-num">{pct(w)}</span></div>
        <ThresholdMeter w={w} label={`${toolName(u.tool)} weekly usage`} />
        <div className="au-meta">
          {reset && <span>{reset}</span>}
          {stale ? <span className="au-stale">From the last Codex run, {span(age)} ago</span> : <span>{w.note}</span>}
        </div>
        {!!w.extras?.length && (
          <div className="au-extras">
            {w.extras.map((x) => (
              <div className="au-extra" key={x.label} data-status={statusFor(x.percent)}>
                <span>{limitLabel(x.label)}{x.resetsText ? <span className="au-muted"> · resets {x.resetsText}</span> : null}</span>
                <span className="au-num" style={{ color: "var(--au-c)", fontWeight: 600 }}>{Math.round(x.percent)}%</span>
                <Meter percent={x.percent} size="s" label={limitLabel(x.label)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {!u.dataFound ? (
        <div className="au-empty">
          {u.cli.installed
            ? <>No {toolName(u.tool)} sessions in the last 14 days on this machine. Run <code>{u.tool}</code> once, then refresh.</>
            : <>{toolName(u.tool)} is not installed on the machine running Paperclip.</>}
        </div>
      ) : (
        <>
          <div className="au-stats">
            <div className="au-stat"><b className="au-num">{fmt(u.today.total)}</b><span>Today</span></div>
            <div className="au-stat"><b className="au-num">{fmt(u.last5h.total)}</b><span>Last 5h</span></div>
            <div className="au-stat"><b className="au-num">{fmt(u.last7d.total)}</b><span>7 days</span></div>
          </div>
          <Chart days={u.days} />
          <Models models={u.models} />
          <Mix t={u.last7d} />
        </>
      )}
      <Agents u={u} />
    </section>
  );
}

/**
 * A refresh asks the worker to re-read the logs and the Claude Code report instead of returning its cache.
 * While the worker is still on its first read after a restart it answers "warming", and this polls until data lands.
 */
function useUsage(companyId: string | null) {
  const [force, setForce] = useState(0);
  const [poll, setPoll] = useState(0);
  const res = usePluginData<UsageView | Warming>("usage", force ? { companyId, refresh: true, nonce: force } : { companyId, poll });
  const warming = !!res.data && "warming" in res.data;
  useEffect(() => {
    if (!warming) return;
    const t = setTimeout(() => { setForce(0); setPoll((n) => n + 1); }, 4000);
    return () => clearTimeout(t);
  }, [warming, res.data]);
  const data = res.data && !("warming" in res.data) ? res.data : null;
  return { data, warming, loading: res.loading || warming, error: res.error, refresh: () => setForce((n) => n + 1) };
}

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></svg>
);

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading usage">
      <div className="au-skel" style={{ height: 112, marginTop: 20 }} />
      <div className="au-grid"><div className="au-skel" style={{ height: 420 }} /><div className="au-skel" style={{ height: 420 }} /></div>
    </div>
  );
}

export function AiUsagePage({ context }: PluginPageProps) {
  const { data, loading, warming, error, refresh } = useUsage(context.companyId);
  return (
    <div className="au au-page"><style>{styles}</style>
      <header className="au-head">
        <div>
          <h1>AI CLI usage</h1>
          <p className="au-small au-muted">{data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · read locally from Codex CLI and Claude Code` : warming ? "Reading recent session logs for the first time since Paperclip started. This can take a minute." : "Reading local Codex CLI and Claude Code data…"}</p>
        </div>
        <button className="au-btn" onClick={refresh} disabled={loading} aria-busy={loading}><RefreshIcon />{loading ? "Refreshing" : "Refresh"}</button>
      </header>
      {error && !loading && (
        <div className="au-alert" role="alert">
          Could not load usage: {error.message}. The first read after a restart parses every recent session log and can take a minute.{" "}
          <button className="au-btn" style={{ marginLeft: 8, minHeight: 28 }} onClick={refresh}>Try again</button>
        </div>
      )}
      {!data && (loading || error) && <Skeleton />}
      {data && <><Overall d={data} /><div className="au-grid"><ToolCard u={data.codex} /><ToolCard u={data.claude} /></div></>}
    </div>
  );
}

/** Compact: the overall figure plus one row per CLI. Details live on the page. */
export function AiUsageWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = useUsage(context.companyId);
  const nav = useHostNavigation();
  return (
    <div className="au au-w"><style>{styles}</style>
      <div className="au-w-head">
        <h3>AI CLI usage</h3>
        <a {...nav.linkProps("/ai-usage")}>Details →</a>
      </div>
      {error && <p className="au-alert" role="alert">Could not load usage: {error.message}</p>}
      {!data && loading && <div className="au-skel" style={{ height: 120 }} />}
      {data && (
        <>
          <div className="au-w-overall" data-status={data.overall.status}>
            <span className="au-big au-num">{pct(data.overall)}</span>
            <span className="au-small au-muted">of the tighter weekly limit</span>
            <span style={{ marginLeft: "auto" }}><Pill s={data.overall.status} /></span>
          </div>
          {[data.codex, data.claude].map((u) => (
            <div className="au-w-row" key={u.tool} data-status={u.weekly.status} title={resetText(u.weekly) ?? u.weekly.note}>
              <span>{toolName(u.tool)}</span>
              <Meter percent={u.weekly.percent} label={`${toolName(u.tool)} weekly usage`} />
              <span className="au-num">{pct(u.weekly)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const GaugeIcon = () => (
  <svg className="h-4 w-4" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>
);

/** Matches the host's own nav links and shows the overall weekly figure at a glance. */
export function AiUsageSidebar({ context }: PluginSidebarProps) {
  const nav = useHostNavigation();
  const { data } = useUsage(context.companyId);
  const w = data?.overall;
  return (
    <div className="au"><style>{styles}</style>
      <a {...nav.linkProps("/ai-usage")} className="flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 text-(length:--text-compact) font-medium transition-colors text-foreground/80 hover:bg-accent/50 hover:text-foreground" style={{ textDecoration: "none" }}>
        <GaugeIcon />
        <span>AI Usage</span>
        {w && w.percent !== null && <span className="au-side-pct" data-status={w.status} title={`Weekly usage: ${statusLabel[w.status]}`}>{pct(w)}</span>}
      </a>
    </div>
  );
}

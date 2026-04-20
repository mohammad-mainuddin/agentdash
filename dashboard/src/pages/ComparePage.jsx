import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

function elapsed(start, end) {
  if (!end) return "running";
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function costStr(v) {
  if (!v || v === 0) return "$0.00";
  return v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;
}

const TYPE_ICON = {
  log: "›", tool_call: "⚡", mcp_call: "⬡", llm_call: "◈",
  run_start: "▶", run_end: "■", span_start: "⊢", span_end: "⊣",
};
const TYPE_COLOR = {
  log: "text-terminal-text", tool_call: "text-terminal-amber",
  mcp_call: "text-terminal-purple", llm_call: "text-terminal-cyan",
  run_start: "text-terminal-green", run_end: "text-terminal-cyan",
  span_start: "text-terminal-dim", span_end: "text-terminal-dim",
};

function eventLabel(e) {
  switch (e.type) {
    case "log":       return e.data?.message || "";
    case "tool_call": return `${e.data?.tool}() — ${e.data?.duration_ms}ms`;
    case "mcp_call":  return `[${e.data?.server}] ${e.data?.tool}`;
    case "llm_call":  return `${e.data?.model} — ${e.data?.input_tokens}+${e.data?.output_tokens} tok`;
    case "run_start": return `run started`;
    case "run_end":   return `run ended · ${e.data?.status}`;
    default:          return e.type;
  }
}

// ── RunPanel ──────────────────────────────────────────────────────────────────

function RunPanel({ run, events, label, side }) {
  const [tab, setTab] = useState("events");
  if (!run) return <div className="flex-1 flex items-center justify-center text-terminal-dim text-sm">Loading…</div>;

  const llmCalls  = events.filter((e) => e.type === "llm_call");
  const toolCalls = events.filter((e) => e.type === "tool_call");

  const borderColor = side === "a" ? "border-terminal-green/40" : "border-terminal-cyan/40";
  const accentColor = side === "a" ? "text-terminal-green border-terminal-green" : "text-terminal-cyan border-terminal-cyan";

  return (
    <div className={`flex-1 min-w-0 border ${borderColor} rounded-lg overflow-hidden flex flex-col`}>
      {/* Run header */}
      <div className={`px-4 py-3 border-b ${borderColor} bg-terminal-surface`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-mono font-bold uppercase ${accentColor.split(" ")[0]}`}>{label}</span>
          <StatusBadge status={run.status} />
        </div>
        <div className="text-sm font-bold text-terminal-text truncate">{run.agent_name}</div>
        {run.project && (
          <div className="text-xs text-terminal-cyan mt-0.5">{run.project}</div>
        )}
        <div className="text-xs text-terminal-dim font-mono mt-1">{run.id.slice(0, 16)}…</div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Duration", value: elapsed(run.started_at, run.ended_at) },
            { label: "Tokens",   value: run.token_count?.toLocaleString() || "0" },
            { label: "Cost",     value: costStr(run.cost_usd) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-terminal-bg rounded p-2 text-center">
              <div className="text-[10px] text-terminal-dim uppercase">{label}</div>
              <div className="text-xs font-bold text-terminal-text mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex border-b ${borderColor}`}>
        {[["events", `Events (${events.length})`], ["prompts", `Prompts (${llmCalls.length})`], ["tools", `Tools (${toolCalls.length})`]].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs font-mono border-b-2 -mb-px transition-colors ${
              tab === key ? `${accentColor}` : "border-transparent text-terminal-dim hover:text-terminal-text"
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3 space-y-1">
        {tab === "events" && events.map((e, i) => (
          <div key={e.id || i} className="flex items-start gap-2 py-1 border-b border-terminal-border/20 animate-fade-in">
            <span className={`text-xs flex-shrink-0 w-4 ${TYPE_COLOR[e.type] || "text-terminal-dim"}`}>
              {TYPE_ICON[e.type] || "·"}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-xs truncate ${TYPE_COLOR[e.type] || "text-terminal-text"}`}>
                {eventLabel(e)}
              </div>
              <div className="text-[10px] text-terminal-dim">
                {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {tab === "prompts" && llmCalls.map((e, i) => {
          const d = e.data || {};
          return (
            <div key={e.id || i} className="mb-3 rounded border border-terminal-cyan/20 overflow-hidden">
              <div className="px-3 py-2 bg-terminal-cyan/5 text-xs font-mono text-terminal-cyan flex justify-between">
                <span>{d.model}</span>
                <span>{d.input_tokens}+{d.output_tokens} tok</span>
              </div>
              {(d.messages || []).map((m, mi) => (
                <div key={mi} className={`px-3 py-2 text-xs border-t border-terminal-border/20 ${
                  m.role === "user" ? "text-terminal-green" : "text-terminal-cyan"
                }`}>
                  <span className="font-bold uppercase text-[10px] mr-2 opacity-60">{m.role}</span>
                  <span className="text-terminal-text">{typeof m.content === "string" ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}</span>
                </div>
              ))}
              {d.response && (
                <div className="px-3 py-2 text-xs border-t border-terminal-border/20 bg-terminal-muted/20">
                  <span className="font-bold uppercase text-[10px] text-terminal-dim mr-2">response</span>
                  <span className="text-terminal-text">{d.response.slice(0, 300)}</span>
                </div>
              )}
            </div>
          );
        })}

        {tab === "tools" && toolCalls.map((e, i) => {
          const d = e.data || {};
          return (
            <div key={e.id || i} className="mb-2 rounded border border-terminal-amber/20 overflow-hidden">
              <div className="px-3 py-2 bg-terminal-amber/5 text-xs font-mono text-terminal-amber flex justify-between">
                <span>{d.tool}()</span>
                <span>{d.duration_ms}ms</span>
              </div>
              <div className="px-3 py-1.5 text-[10px] text-terminal-dim">
                IN: {JSON.stringify(d.input || {}).slice(0, 120)}
              </div>
              <div className="px-3 py-1.5 text-[10px] text-terminal-green border-t border-terminal-border/20">
                OUT: {JSON.stringify(d.output || {}).slice(0, 120)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: link to full run */}
      <div className={`px-4 py-2 border-t ${borderColor} bg-terminal-surface`}>
        <Link to={`/runs/${run.id}`} className="text-xs text-terminal-dim hover:text-terminal-text transition-colors">
          Open full run →
        </Link>
      </div>
    </div>
  );
}

// ── Diff summary ──────────────────────────────────────────────────────────────

function DiffSummary({ runA, runB, eventsA, eventsB }) {
  if (!runA || !runB) return null;

  const durationA = runA.ended_at ? new Date(runA.ended_at) - new Date(runA.started_at) : null;
  const durationB = runB.ended_at ? new Date(runB.ended_at) - new Date(runB.started_at) : null;
  const durationDiff = durationA && durationB ? durationB - durationA : null;

  const tokenDiff = runB.token_count - runA.token_count;
  const costDiff  = runB.cost_usd   - runA.cost_usd;

  const toolsA = new Set(eventsA.filter(e => e.type === "tool_call").map(e => e.data?.tool));
  const toolsB = new Set(eventsB.filter(e => e.type === "tool_call").map(e => e.data?.tool));
  const onlyInA = [...toolsA].filter(t => !toolsB.has(t));
  const onlyInB = [...toolsB].filter(t => !toolsA.has(t));

  function Delta({ v, unit = "", invert = false }) {
    if (!v && v !== 0) return <span className="text-terminal-dim">—</span>;
    const pos = v > 0;
    const good = invert ? !pos : pos;
    return (
      <span className={pos ? (good ? "text-terminal-green" : "text-terminal-red") : (good ? "text-terminal-green" : "text-terminal-red")}>
        {pos ? "+" : ""}{typeof v === "number" && !Number.isInteger(v) ? v.toFixed(4) : v}{unit}
      </span>
    );
  }

  return (
    <div className="card p-4 mb-4 bg-terminal-surface">
      <div className="text-xs font-semibold text-terminal-dim uppercase tracking-wider mb-3">Diff Summary (B vs A)</div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-terminal-dim mb-1">Duration</div>
          <Delta v={durationDiff ? Math.round(durationDiff / 100) / 10 : null} unit="s" invert={true} />
        </div>
        <div>
          <div className="text-terminal-dim mb-1">Tokens</div>
          <Delta v={tokenDiff} invert={true} />
        </div>
        <div>
          <div className="text-terminal-dim mb-1">Cost</div>
          <Delta v={parseFloat(costDiff.toFixed(6))} unit=" USD" invert={true} />
        </div>
      </div>
      {(onlyInA.length > 0 || onlyInB.length > 0) && (
        <div className="mt-3 pt-3 border-t border-terminal-border grid grid-cols-2 gap-4 text-xs">
          {onlyInA.length > 0 && (
            <div>
              <div className="text-terminal-dim mb-1">Only in A</div>
              {onlyInA.map(t => <span key={t} className="block text-terminal-red">{t}()</span>)}
            </div>
          )}
          {onlyInB.length > 0 && (
            <div>
              <div className="text-terminal-dim mb-1">Only in B</div>
              {onlyInB.map(t => <span key={t} className="block text-terminal-green">{t}()</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const idA = searchParams.get("a");
  const idB = searchParams.get("b");

  const [runA, setRunA]     = useState(null);
  const [runB, setRunB]     = useState(null);
  const [eventsA, setEA]    = useState([]);
  const [eventsB, setEB]    = useState([]);

  useEffect(() => {
    if (idA) api.getRun(idA).then((d) => { setRunA(d); setEA(d.events || []); }).catch(console.error);
    if (idB) api.getRun(idB).then((d) => { setRunB(d); setEB(d.events || []); }).catch(console.error);
  }, [idA, idB]);

  if (!idA || !idB) {
    return (
      <div className="flex-1 flex items-center justify-center text-terminal-dim text-sm">
        Navigate here from a run page using the Compare button.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-xs text-terminal-dim hover:text-terminal-text">
          ← Back
        </button>
        <h1 className="text-xl font-display font-bold text-terminal-text">Compare Runs</h1>
      </div>

      <DiffSummary runA={runA} runB={runB} eventsA={eventsA} eventsB={eventsB} />

      <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
        <RunPanel run={runA} events={eventsA} label="Run A" side="a" />
        <RunPanel run={runB} events={eventsB} label="Run B" side="b" />
      </div>
    </div>
  );
}

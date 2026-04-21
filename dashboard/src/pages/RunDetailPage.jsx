import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useWs } from "../context/WsContext";
import { api } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsed(start, end) {
  const ms = new Date(end || Date.now()) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── LogStream ─────────────────────────────────────────────────────────────────

function LogStream({ events }) {
  const bottomRef = useRef(null);
  const logs = events.filter((e) => e.type === "log" || e.type === "run_start" || e.type === "run_end");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="bg-terminal-bg rounded-lg border border-terminal-border h-64 overflow-auto p-4 font-mono text-sm">
      {logs.length === 0 ? (
        <div className="text-terminal-dim text-xs">Waiting for logs<span className="animate-blink">_</span></div>
      ) : (
        logs.map((e, i) => {
          const isStart = e.type === "run_start";
          const isEnd   = e.type === "run_end";
          return (
            <div key={e.id || i} className="flex gap-3 mb-1 animate-fade-in">
              <span className="text-terminal-dim text-xs flex-shrink-0 w-20">{ts(e.timestamp)}</span>
              <span className={`text-xs flex-shrink-0 w-4 ${isStart ? "text-terminal-green" : isEnd ? "text-terminal-cyan" : "text-terminal-dim"}`}>
                {isStart ? "▶" : isEnd ? "■" : "›"}
              </span>
              <span className={`flex-1 ${isStart ? "text-terminal-green" : isEnd ? "text-terminal-cyan" : "text-terminal-text"}`}>
                {isStart ? `agent started · ${e.data?.agentName}` : isEnd ? `run ended · ${e.data?.status}` : e.data?.message}
              </span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── LLMCallCard ───────────────────────────────────────────────────────────────

function LLMCallCard({ event }) {
  const [open, setOpen] = useState(false);
  const d = event.data || {};
  const messages = d.messages || [];

  const costDisplay = d.cost_usd > 0
    ? d.cost_usd >= 0.01 ? `$${d.cost_usd.toFixed(2)}` : `$${d.cost_usd.toFixed(4)}`
    : null;

  return (
    <div className="card overflow-hidden animate-fade-in border-l-2 border-terminal-cyan">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-terminal-muted/30 transition-colors text-left"
      >
        <span className="text-terminal-cyan text-sm">◈</span>
        <span className="flex-1 text-sm font-medium text-terminal-text">{d.model}</span>
        <span className="text-xs text-terminal-dim">{d.input_tokens} → {d.output_tokens} tok</span>
        {costDisplay && (
          <span className="text-xs text-terminal-purple font-mono">{costDisplay}</span>
        )}
        <span className="text-xs text-terminal-dim ml-1">{d.duration_ms}ms</span>
        <span className="text-xs text-terminal-dim ml-2">{ts(event.timestamp)}</span>
        <span className="text-terminal-dim text-xs ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-terminal-border p-4 space-y-2 max-h-[32rem] overflow-auto">
          {messages.map((msg, i) => {
            const content = typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content, null, 2);
            const roleColor = msg.role === "user"
              ? "text-terminal-green"
              : msg.role === "assistant"
              ? "text-terminal-cyan"
              : "text-terminal-dim";
            const bgColor = msg.role === "user"
              ? "bg-terminal-muted/40"
              : "bg-terminal-cyan/5 border border-terminal-cyan/15";
            return (
              <div key={i} className={`rounded p-3 text-xs ${bgColor}`}>
                <div className={`font-mono uppercase mb-1 font-semibold ${roleColor}`}>{msg.role}</div>
                <pre className="whitespace-pre-wrap break-all font-mono text-terminal-text leading-relaxed">
                  {content}
                </pre>
              </div>
            );
          })}
          {d.response && (
            <div className="rounded p-3 text-xs bg-terminal-cyan/5 border border-terminal-cyan/20">
              <div className="font-mono uppercase mb-1 font-semibold text-terminal-cyan">response</div>
              <pre className="whitespace-pre-wrap break-all font-mono text-terminal-text leading-relaxed">
                {d.response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MCPCallCard ───────────────────────────────────────────────────────────────

function MCPCallCard({ event }) {
  const [open, setOpen] = useState(false);
  const d = event.data || {};

  const kindClass = {
    tool:     "bg-terminal-purple/20 text-terminal-purple border-terminal-purple/30",
    resource: "bg-terminal-cyan/20   text-terminal-cyan   border-terminal-cyan/30",
    prompt:   "bg-terminal-amber/20  text-terminal-amber  border-terminal-amber/30",
  }[d.kind] || "bg-terminal-muted text-terminal-dim border-terminal-border";

  return (
    <div className="card overflow-hidden animate-fade-in border-l-2 border-terminal-purple">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-terminal-muted/30 transition-colors text-left"
      >
        <span className="text-terminal-purple text-sm">⬡</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border font-mono flex-shrink-0 ${kindClass}`}>{d.kind || "tool"}</span>
        <span className="flex-shrink-0 text-xs text-terminal-dim font-mono">{d.server}</span>
        <span className="text-terminal-dim text-xs">›</span>
        <span className="flex-1 text-sm font-medium text-terminal-text truncate">{d.tool}</span>
        {d.error && <span className="text-xs text-terminal-red flex-shrink-0">error</span>}
        <span className="text-xs text-terminal-dim">{d.duration_ms}ms</span>
        <span className="text-xs text-terminal-dim ml-2">{ts(event.timestamp)}</span>
        <span className="text-terminal-dim text-xs ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-terminal-border grid grid-cols-2 divide-x divide-terminal-border">
          <div className="p-4">
            <div className="text-xs text-terminal-dim uppercase tracking-wider mb-2">Input</div>
            <pre className="text-xs text-terminal-text whitespace-pre-wrap break-all">
              {JSON.stringify(d.input, null, 2)}
            </pre>
          </div>
          <div className="p-4">
            <div className="text-xs text-terminal-dim uppercase tracking-wider mb-2">
              {d.error ? "Error" : "Output"}
            </div>
            <pre className={`text-xs whitespace-pre-wrap break-all ${d.error ? "text-terminal-red" : "text-terminal-purple"}`}>
              {d.error || JSON.stringify(d.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ToolCallCard ──────────────────────────────────────────────────────────────

function ToolCallCard({ event }) {
  const [open, setOpen] = useState(false);
  const d = event.data || {};

  return (
    <div className="card overflow-hidden animate-fade-in">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-terminal-muted/30 transition-colors text-left"
      >
        <span className="text-terminal-amber text-sm">⚡</span>
        <span className="flex-1 text-sm font-medium text-terminal-text">{d.tool}</span>
        <span className="text-xs text-terminal-dim">{d.duration_ms}ms</span>
        <span className="text-xs text-terminal-dim ml-2">{ts(event.timestamp)}</span>
        <span className="text-terminal-dim text-xs ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-terminal-border grid grid-cols-2 divide-x divide-terminal-border">
          <div className="p-4">
            <div className="text-xs text-terminal-dim uppercase tracking-wider mb-2">Input</div>
            <pre className="text-xs text-terminal-text whitespace-pre-wrap break-all">
              {JSON.stringify(d.input, null, 2)}
            </pre>
          </div>
          <div className="p-4">
            <div className="text-xs text-terminal-dim uppercase tracking-wider mb-2">Output</div>
            <pre className="text-xs text-terminal-green whitespace-pre-wrap break-all">
              {JSON.stringify(d.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TokenChart ────────────────────────────────────────────────────────────────

function TokenChart({ events }) {
  const buckets = {};
  for (const e of events) {
    const key = e.type === "tool_call" ? e.data?.tool || "tool" : e.type;
    const tokens = Math.ceil(JSON.stringify(e.data || "").length / 4);
    buckets[key] = (buckets[key] || 0) + tokens;
  }

  const data = Object.entries(buckets).map(([name, tokens]) => ({ name, tokens }));
  const COLORS = ["#00ff88", "#00d4ff", "#ffaa00", "#cc88ff", "#ff4466"];

  if (data.length === 0) return (
    <div className="h-40 flex items-center justify-center text-terminal-dim text-sm">No token data yet</div>
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ fill: "#4a6080", fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#4a6080", fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0f1419", border: "1px solid #1a2332", borderRadius: 6, fontFamily: "monospace", fontSize: 12 }}
          labelStyle={{ color: "#a8b8c8" }}
          itemStyle={{ color: "#00ff88" }}
        />
        <Bar dataKey="tokens" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── SpanTimeline ──────────────────────────────────────────────────────────────

/**
 * Renders events as a tree indented by span nesting.
 * span_start/span_end events form the tree skeleton;
 * log and tool_call events are rendered at the depth of their containing span.
 */
function SpanTimeline({ events }) {
  // Build a map of spanId → depth based on span_start/span_end nesting
  const spanDepth = {};
  let currentDepth = 0;
  const depthStack = []; // stack of { spanId, depth }

  // Assign each event a display depth
  const annotated = events.map((e) => {
    const spanId = e.data?.spanId || null;

    if (e.type === "span_start") {
      const depth = depthStack.length;
      spanDepth[e.data?.spanId] = depth;
      depthStack.push({ spanId: e.data?.spanId, depth });
      return { ...e, _depth: depth };
    }

    if (e.type === "span_end") {
      const frame = depthStack.findLastIndex((f) => f.spanId === e.data?.spanId);
      const depth = frame >= 0 ? depthStack[frame].depth : depthStack.length;
      if (frame >= 0) depthStack.splice(frame, 1);
      return { ...e, _depth: depth };
    }

    // log / tool_call — depth = their span's depth + 1, or top-level
    const depth = spanId && spanDepth[spanId] !== undefined
      ? spanDepth[spanId] + 1
      : depthStack.length;
    return { ...e, _depth: depth };
  });

  const typeStyle = {
    run_start:  "border-terminal-green  bg-terminal-green",
    log:        "border-terminal-dim    bg-terminal-dim",
    tool_call:  "border-terminal-amber  bg-terminal-amber",
    mcp_call:   "border-terminal-purple bg-terminal-purple",
    run_end:    "border-terminal-cyan   bg-terminal-cyan",
    span_start: "border-terminal-cyan   bg-terminal-cyan/50",
    span_end:   "border-terminal-cyan   bg-terminal-cyan/30",
  };
  const typeIcon = {
    run_start: "▶", log: "›", tool_call: "⚡",
    mcp_call: "⬡", run_end: "■", span_start: "❯", span_end: "❮",
  };

  return (
    <div className="relative pl-6 space-y-2">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-terminal-border" />

      {annotated.map((e, i) => {
        const indent = e._depth * 16;
        const label =
          e.type === "log"        ? e.data?.message :
          e.type === "tool_call"  ? `${e.data?.tool}() — ${e.data?.duration_ms}ms` :
          e.type === "mcp_call"   ? `[${e.data?.server}] ${e.data?.tool} — ${e.data?.duration_ms}ms${e.data?.error ? " ✕" : ""}` :
          e.type === "run_start"  ? "run started" :
          e.type === "run_end"    ? `run ended · ${e.data?.status}` :
          e.type === "span_start" ? `span: ${e.data?.name}` :
          e.type === "span_end"   ? `span end · ${e.data?.status}` : e.type;

        return (
          <div
            key={e.id || i}
            className="relative flex items-start gap-3 animate-fade-in"
            style={{ paddingLeft: indent }}
          >
            <div className={`absolute w-3 h-3 rounded-full border bg-terminal-bg flex items-center justify-center mt-0.5 ${typeStyle[e.type] || "border-terminal-dim text-terminal-dim"}`}
              style={{ left: `${indent - 8}px` }}
            >
              <span className="text-[6px]">{typeIcon[e.type] || "·"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-terminal-text truncate">{label}</div>
              <div className="text-xs text-terminal-dim">{ts(e.timestamp)}</div>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded bg-terminal-muted/50 flex-shrink-0 ${(typeStyle[e.type] || "").split(" ")[1] || "text-terminal-dim"}`}>
              {e.type}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { subscribe } = useWs();
  const [run, setRun]       = useState(null);
  const [events, setEvents] = useState([]);
  const [tab, setTab]       = useState("logs");
  const [compareRuns, setCompareRuns] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  const load = () =>
    api.getRun(id)
      .then((data) => { setRun(data); setEvents(data.events || []); })
      .catch(console.error);

  useEffect(() => {
    load();
    const unsub = subscribe((event) => {
      if (event.runId === id || event._run?.id === id) load();
    });
    return unsub;
  }, [id, subscribe]);

  const handleDelete = async () => {
    if (!window.confirm(`Delete run "${run.agent_name}"? This cannot be undone.`)) return;
    await api.deleteRun(id);
    navigate("/runs");
  };

  const openCompare = async () => {
    if (!run) return;
    const all = await api.getRuns({ q: run.agent_name });
    setCompareRuns(all.filter((r) => r.id !== id).slice(0, 10));
    setShowCompare(true);
  };

  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-terminal-dim">
        Loading<span className="animate-blink">_</span>
      </div>
    );
  }

  const toolCalls = events.filter((e) => e.type === "tool_call");
  const mcpCalls  = events.filter((e) => e.type === "mcp_call");
  const llmCalls  = events.filter((e) => e.type === "llm_call");
  const hasSpans  = events.some((e)  => e.type === "span_start");

  const costDisplay = run.cost_usd > 0
    ? run.cost_usd >= 0.01 ? `$${run.cost_usd.toFixed(2)}` : `$${run.cost_usd.toFixed(4)}`
    : "$0.00";

  const TABS = [
    { key: "logs",     label: `Logs (${events.filter(e => e.type === "log").length})` },
    { key: "prompts",  label: `Prompts (${llmCalls.length})` },
    { key: "tools",    label: `Tools (${toolCalls.length})` },
    { key: "mcp",      label: `MCP (${mcpCalls.length})` },
    { key: "tokens",   label: "Tokens" },
    { key: "timeline", label: hasSpans ? "Span Tree" : "Timeline" },
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <button onClick={() => navigate("/runs")} className="text-xs text-terminal-dim hover:text-terminal-text mb-2 flex items-center gap-1">
            ← Back to runs
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-display font-bold text-terminal-text">{run.agent_name}</h1>
            {run.project && (
              <span className="text-xs text-terminal-cyan bg-terminal-cyan/10 px-2 py-0.5 rounded font-mono">
                {run.project}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <StatusBadge status={run.status} />
            <span className="text-xs text-terminal-dim font-mono">{run.id}</span>
            {run.parent_run_id && (
              <Link to={`/runs/${run.parent_run_id}`}
                className="text-xs text-terminal-purple hover:underline">
                ↳ parent run
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2 relative">
          <button onClick={openCompare} className="btn-primary text-xs bg-terminal-surface border-terminal-border text-terminal-dim hover:text-terminal-text">
            ⇄ Compare
          </button>
          <a href={api.getExportUrl(id)} download className="btn-primary text-xs">↓ Export</a>
          <button onClick={handleDelete} className="btn-danger text-xs">Delete Run</button>

          {/* Compare picker dropdown */}
          {showCompare && (
            <div className="absolute right-0 top-9 z-50 w-80 card border border-terminal-border shadow-xl">
              <div className="px-4 py-2 border-b border-terminal-border flex items-center justify-between">
                <span className="text-xs font-semibold text-terminal-text">Compare with…</span>
                <button onClick={() => setShowCompare(false)} className="text-terminal-dim hover:text-terminal-text text-xs">✕</button>
              </div>
              {compareRuns.length === 0 ? (
                <div className="px-4 py-6 text-xs text-terminal-dim text-center">
                  No other runs for "{run.agent_name}"
                </div>
              ) : (
                compareRuns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/compare?a=${id}&b=${r.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-terminal-muted/30 border-b border-terminal-border/30 text-left transition-colors"
                  >
                    <span className={`text-xs w-2 h-2 rounded-full flex-shrink-0 ${
                      r.status === "success" ? "bg-terminal-green" :
                      r.status === "error"   ? "bg-terminal-red" : "bg-terminal-amber"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-terminal-text truncate">{r.id.slice(0, 8)}…</div>
                      <div className="text-[10px] text-terminal-dim">{new Date(r.started_at).toLocaleString()}</div>
                    </div>
                    <span className={`text-[10px] ${
                      r.status === "success" ? "text-terminal-green" :
                      r.status === "error"   ? "text-terminal-red" : "text-terminal-amber"
                    }`}>{r.status}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Started",  value: new Date(run.started_at).toLocaleString() },
          { label: "Duration", value: elapsed(run.started_at, run.ended_at) },
          { label: "Events",   value: events.length },
          { label: "Tokens",   value: `~${run.token_count?.toLocaleString() || "0"}` },
          { label: "Cost",     value: costDisplay },
        ].map(({ label, value }) => (
          <div key={label} className="card px-4 py-3">
            <div className="text-xs text-terminal-dim uppercase tracking-wider mb-1">{label}</div>
            <div className="text-sm font-medium text-terminal-text">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-terminal-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-terminal-green text-terminal-green"
                : "border-transparent text-terminal-dim hover:text-terminal-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "logs" && <LogStream events={events} />}

      {tab === "prompts" && (
        <div className="space-y-2">
          {llmCalls.length === 0 ? (
            <div className="card p-8 text-center text-terminal-dim text-sm">
              No LLM calls recorded
              <div className="text-xs mt-2 text-terminal-dim/60">
                Use AnthropicInstrumentation or OpenAIInstrumentation to capture full prompt/response data
              </div>
            </div>
          ) : (
            llmCalls.map((e, i) => <LLMCallCard key={e.id || i} event={e} />)
          )}
        </div>
      )}

      {tab === "tools" && (
        <div className="space-y-2">
          {toolCalls.length === 0 ? (
            <div className="card p-8 text-center text-terminal-dim text-sm">No tool calls recorded</div>
          ) : (
            toolCalls.map((e, i) => <ToolCallCard key={e.id || i} event={e} />)
          )}
        </div>
      )}

      {tab === "mcp" && (
        <div className="space-y-2">
          {mcpCalls.length === 0 ? (
            <div className="card p-8 text-center text-terminal-dim text-sm">
              No MCP calls recorded
              <div className="text-xs mt-2 text-terminal-dim/60">
                Wrap your MCP session with MCPInstrumentation to capture calls here
              </div>
            </div>
          ) : (
            mcpCalls.map((e, i) => <MCPCallCard key={e.id || i} event={e} />)
          )}
        </div>
      )}

      {tab === "tokens" && (
        <div className="card p-5">
          <div className="text-xs text-terminal-dim uppercase tracking-wider mb-4">
            Token Usage by Event Type
            <span className="ml-2 text-terminal-dim/60">(estimated — install tiktoken for accurate counts)</span>
          </div>
          <TokenChart events={events} />
          <div className="mt-4 pt-4 border-t border-terminal-border flex items-center justify-between text-sm">
            <span className="text-terminal-dim">Total estimated tokens</span>
            <span className="text-terminal-amber font-medium">~{run.token_count?.toLocaleString() || "0"}</span>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <div className="card p-5">
          <div className="text-xs text-terminal-dim uppercase tracking-wider mb-4">
            {hasSpans ? "Span Tree — nested agent phases" : "Event Timeline"}
          </div>
          {events.length === 0
            ? <div className="text-terminal-dim text-sm text-center py-8">No events yet</div>
            : <SpanTimeline events={events} />
          }
        </div>
      )}

      {/* Child runs */}
      {run.children?.length > 0 && (
        <div className="mt-6">
          <div className="text-xs text-terminal-dim uppercase tracking-wider mb-3">
            Child Runs ({run.children.length})
          </div>
          <div className="space-y-2">
            {run.children.map((child) => (
              <div key={child.id}
                onClick={() => navigate(`/runs/${child.id}`)}
                className="card px-4 py-3 flex items-center gap-3 cursor-pointer
                           hover:bg-terminal-muted/30 transition-colors">
                <span className="text-terminal-purple text-xs">↳</span>
                <span className="flex-1 text-sm text-terminal-text">{child.agent_name}</span>
                <StatusBadge status={child.status} />
                <span className="text-xs text-terminal-dim font-mono">{child.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useWs } from "../context/WsContext";
import { api } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

function StatCard({ label, value, color = "text-terminal-green", sub }) {
  return (
    <div className="card p-5 animate-fade-in">
      <div className="text-xs text-terminal-dim uppercase tracking-widest mb-2">{label}</div>
      <div className={`text-3xl font-display font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-terminal-dim mt-1">{sub}</div>}
    </div>
  );
}

function EventRow({ event }) {
  const icons = { log: "›", tool_call: "⚡", run_start: "▶", run_end: "■" };
  const colors = {
    log: "text-terminal-text",
    tool_call: "text-terminal-amber",
    run_start: "text-terminal-green",
    run_end: "text-terminal-cyan",
  };

  const label =
    event.type === "log" ? event.data?.message :
    event.type === "tool_call" ? `${event.data?.tool}()` :
    event.type === "run_start" ? `run started · ${event.agent_name}` :
    event.type === "run_end" ? `run ended · ${event.data?.status}` :
    event.type;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-terminal-border/40 animate-fade-in">
      <span className={`text-sm mt-0.5 w-4 flex-shrink-0 ${colors[event.type] || "text-terminal-dim"}`}>
        {icons[event.type] || "·"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-terminal-text truncate">{label}</div>
        <div className="text-xs text-terminal-dim">{event.agent_name} · {new Date(event.timestamp).toLocaleTimeString()}</div>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded bg-terminal-muted/50 ${colors[event.type] || "text-terminal-dim"} flex-shrink-0`}>
        {event.type}
      </span>
    </div>
  );
}

export default function HomePage() {
  const { subscribe } = useWs();
  const [stats, setStats] = useState({ total: 0, active: 0, tokens: 0, recentEvents: [] });

  const loadStats = () => api.getStats().then(setStats).catch(console.error);

  useEffect(() => {
    loadStats();
    const unsub = subscribe(() => loadStats());
    return unsub;
  }, [subscribe]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-display font-bold text-terminal-text">Overview</h1>
        <p className="text-sm text-terminal-dim mt-0.5">Real-time agent monitoring dashboard</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Active Runs"
          value={stats.active}
          color="text-terminal-green"
          sub={stats.active === 1 ? "1 agent running" : `${stats.active} agents running`}
        />
        <StatCard
          label="Total Runs"
          value={stats.total}
          color="text-terminal-cyan"
          sub="all time"
        />
        <StatCard
          label="Tokens Used"
          value={stats.tokens?.toLocaleString() || "0"}
          color="text-terminal-amber"
          sub="estimated"
        />
      </div>

      {/* Live feed */}
      <div className="card">
        <div className="px-5 py-3 border-b border-terminal-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-terminal-text">Live Activity</h2>
          <div className="flex items-center gap-1.5 text-xs text-terminal-green">
            <span className="live-dot" />
            live
          </div>
        </div>
        <div className="px-5 py-2 max-h-96 overflow-auto">
          {stats.recentEvents.length === 0 ? (
            <div className="py-8 text-center text-terminal-dim text-sm">
              <div className="text-2xl mb-2">◎</div>
              No activity yet. Connect an agent to see events.
            </div>
          ) : (
            stats.recentEvents.map((e) => <EventRow key={e.id} event={e} />)
          )}
        </div>
      </div>
    </div>
  );
}

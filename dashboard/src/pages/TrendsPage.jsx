import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useWs } from "../context/WsContext";
import { api } from "../lib/api";

const PERIODS = [
  { label: "7d",  days: 7  },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

function shortDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function costStr(v) {
  if (!v || v === 0) return "$0.00";
  return v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;
}

const tipStyle = {
  contentStyle: { background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 6, fontSize: 11 },
  labelStyle:   { color: "#6b7280" },
  cursor:       { fill: "rgba(255,255,255,0.03)" },
};

function ChartCard({ title, sub, children }) {
  return (
    <div className="card p-5">
      <div className="mb-1 text-xs font-semibold text-terminal-text uppercase tracking-wider">{title}</div>
      {sub && <div className="text-xs text-terminal-dim mb-4">{sub}</div>}
      {children}
    </div>
  );
}

function SummaryPill({ label, value, color }) {
  return (
    <div className="card px-5 py-4 text-center">
      <div className="text-xs text-terminal-dim uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function TrendsPage() {
  const [days, setDays]         = useState(14);
  const [project, setProject]   = useState("");
  const [projects, setProjects] = useState([]);
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const { subscribe } = useWs();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getTrends({ days, project }),
      api.getProjects(),
    ]).then(([trends, projs]) => {
      setData(trends.daily || []);
      setProjects(projs);
      setLoading(false);
    }).catch(console.error);
  };

  useEffect(() => { load(); }, [days, project]);
  useEffect(() => { const unsub = subscribe(() => load()); return unsub; }, [subscribe, days, project]);

  const totalRuns   = data.reduce((s, d) => s + d.runs,   0);
  const totalTokens = data.reduce((s, d) => s + d.tokens, 0);
  const totalCost   = data.reduce((s, d) => s + d.cost,   0);
  const totalErrors = data.reduce((s, d) => s + d.errors, 0);
  const errRate     = totalRuns > 0 ? ((totalErrors / totalRuns) * 100).toFixed(1) : "0.0";

  const chartData = data.map((d) => ({
    ...d,
    label:    shortDay(d.day),
    errRate:  d.runs > 0 ? parseFloat(((d.errors / d.runs) * 100).toFixed(1)) : 0,
    costCents: parseFloat((d.cost * 100).toFixed(4)),
  }));

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header + controls */}
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex-1">
          <h1 className="text-xl font-display font-bold text-terminal-text">Trends</h1>
          <p className="text-sm text-terminal-dim mt-0.5">Cost, usage, and error patterns over time</p>
        </div>

        {/* Project filter */}
        <select
          className="input w-44 text-sm"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.project} value={p.project}>{p.project}</option>
          ))}
        </select>

        {/* Period selector */}
        <div className="flex rounded overflow-hidden border border-terminal-border">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                days === p.days
                  ? "bg-terminal-green/20 text-terminal-green"
                  : "text-terminal-dim hover:text-terminal-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryPill label="Total Runs"   value={totalRuns.toLocaleString()} color="text-terminal-cyan" />
        <SummaryPill label="Total Tokens" value={totalTokens.toLocaleString()} color="text-terminal-amber" />
        <SummaryPill label="Total Cost"   value={costStr(totalCost)} color="text-terminal-purple" />
        <SummaryPill label="Error Rate"   value={`${errRate}%`} color={parseFloat(errRate) > 5 ? "text-terminal-red" : "text-terminal-green"} />
      </div>

      {loading ? (
        <div className="text-center text-terminal-dim py-16 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Runs per day */}
          <ChartCard title="Runs per day" sub="Total agent runs started each day">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={chartData.length > 14 ? 8 : 14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip {...tipStyle} formatter={(v) => [v, "runs"]} />
                <Bar dataKey="runs" fill="#22c55e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Tokens per day */}
          <ChartCard title="Tokens per day" sub="Total tokens consumed (input + output)">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip {...tipStyle} formatter={(v) => [v.toLocaleString(), "tokens"]} />
                <Area type="monotone" dataKey="tokens" stroke="#f59e0b" fill="url(#tokGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Cost per day */}
          <ChartCard title="Cost per day (¢)" sub="USD cost × 100 — each bar is cents spent">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={chartData.length > 14 ? 8 : 14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                  tickFormatter={(v) => `¢${v}`} />
                <Tooltip {...tipStyle} formatter={(v) => [`¢${v.toFixed(4)}`, "cost"]} />
                <Bar dataKey="costCents" fill="#a855f7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Error rate */}
          <ChartCard title="Error rate %" sub="Percentage of runs that ended with status=error">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={32}
                  domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...tipStyle} formatter={(v) => [`${v}%`, "error rate"]} />
                <Line type="monotone" dataKey="errRate" stroke="#ef4444" strokeWidth={2}
                  dot={{ fill: "#ef4444", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

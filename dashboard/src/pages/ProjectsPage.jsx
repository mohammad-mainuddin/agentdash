import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWs } from "../context/WsContext";
import { api } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

function costStr(v) {
  if (!v || v === 0) return "$0.00";
  return v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;
}

function durStr(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso);
  if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Project list ──────────────────────────────────────────────────────────────

function ProjectCard({ p, onClick }) {
  const errRate = p.run_count > 0 ? ((p.error_count / p.run_count) * 100).toFixed(0) : 0;
  return (
    <div
      onClick={onClick}
      className="card p-5 cursor-pointer hover:border-terminal-green/40 hover:shadow-md transition-all animate-fade-in group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-base font-display font-bold text-terminal-text group-hover:text-terminal-green transition-colors">
            {p.project}
          </div>
          <div className="text-xs text-terminal-dim mt-0.5">
            {p.agent_count} agent{p.agent_count !== 1 ? "s" : ""} · last active {timeAgo(p.last_run_at)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.active_count > 0 && (
            <span className="flex items-center gap-1 text-xs text-terminal-green bg-terminal-green/10 px-2 py-0.5 rounded-full">
              <span className="live-dot" />{p.active_count} running
            </span>
          )}
          <span className="text-terminal-dim group-hover:text-terminal-green text-sm transition-colors">→</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 pt-3 border-t border-terminal-border">
        <div>
          <div className="text-xs text-terminal-dim mb-1">Runs</div>
          <div className="text-lg font-bold text-terminal-cyan">{p.run_count}</div>
        </div>
        <div>
          <div className="text-xs text-terminal-dim mb-1">Tokens</div>
          <div className="text-lg font-bold text-terminal-amber">{p.total_tokens.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-terminal-dim mb-1">Cost</div>
          <div className="text-lg font-bold text-terminal-purple">{costStr(p.total_cost)}</div>
        </div>
        <div>
          <div className="text-xs text-terminal-dim mb-1">Errors</div>
          <div className={`text-lg font-bold ${p.error_count > 0 ? "text-terminal-red" : "text-terminal-dim"}`}>
            {errRate}%
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsListPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const { subscribe } = useWs();
  const navigate = useNavigate();

  const load = () => api.getProjects().then((p) => { setProjects(p); setLoading(false); }).catch(console.error);

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = subscribe(() => load()); return unsub; }, [subscribe]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-display font-bold text-terminal-text">Projects</h1>
        <p className="text-sm text-terminal-dim mt-0.5">
          Group agents by project to monitor teams independently
        </p>
      </div>

      {loading ? (
        <div className="text-center text-terminal-dim py-16 text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-3 text-terminal-dim">◎</div>
          <div className="text-sm text-terminal-dim mb-4">No projects yet.</div>
          <pre className="text-xs text-terminal-green bg-terminal-bg rounded p-4 text-left inline-block">
{`from agentdash import AgentDash

dash = AgentDash(url="http://localhost:4242")

with dash.start_run("my-agent", project="sales-bot") as run:
    run.log("Working...")`}
          </pre>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.project} p={p} onClick={() => navigate(`/projects/${encodeURIComponent(p.project)}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project detail — agent registry ──────────────────────────────────────────

function AgentRow({ agent, onClick }) {
  const errRate = agent.run_count > 0 ? ((agent.error_count / agent.run_count) * 100).toFixed(0) : 0;
  return (
    <div
      onClick={onClick}
      className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-terminal-border/40
                 hover:bg-terminal-muted/30 cursor-pointer transition-colors animate-fade-in"
    >
      <div className="col-span-3 flex items-center gap-2">
        <span className="text-sm font-medium text-terminal-text">{agent.agent_name}</span>
        {agent.active_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-terminal-green">
            <span className="live-dot" />
          </span>
        )}
      </div>
      <div className="col-span-2 text-sm text-terminal-cyan flex items-center">{agent.run_count}</div>
      <div className="col-span-2 text-sm text-terminal-amber flex items-center">
        {agent.total_tokens.toLocaleString()}
      </div>
      <div className="col-span-2 text-sm text-terminal-purple flex items-center">
        {costStr(agent.total_cost)}
      </div>
      <div className="col-span-1 text-sm text-terminal-dim flex items-center">
        {durStr(agent.avg_duration_ms)}
      </div>
      <div className={`col-span-1 text-sm flex items-center ${agent.error_count > 0 ? "text-terminal-red" : "text-terminal-dim"}`}>
        {errRate}%
      </div>
      <div className="col-span-1 text-xs text-terminal-dim flex items-center justify-end">
        {timeAgo(agent.last_run_at)}
      </div>
    </div>
  );
}

export function ProjectDetailPage() {
  const { name } = useParams();
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWs();
  const navigate = useNavigate();

  const decodedName = decodeURIComponent(name);

  const load = () =>
    api.getProjectAgents(decodedName)
      .then((a) => { setAgents(a); setLoading(false); })
      .catch(console.error);

  useEffect(() => { load(); }, [name]);
  useEffect(() => { const unsub = subscribe(() => load()); return unsub; }, [subscribe]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/projects")}
          className="text-terminal-dim hover:text-terminal-text text-sm transition-colors"
        >
          ← Projects
        </button>
        <span className="text-terminal-border">/</span>
        <h1 className="text-xl font-display font-bold text-terminal-text">{decodedName}</h1>
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-terminal-border text-xs text-terminal-dim uppercase tracking-wider">
          <div className="col-span-3">Agent</div>
          <div className="col-span-2">Runs</div>
          <div className="col-span-2">Tokens</div>
          <div className="col-span-2">Cost</div>
          <div className="col-span-1">Avg Time</div>
          <div className="col-span-1">Errors</div>
          <div className="col-span-1 text-right">Last Run</div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-terminal-dim text-sm">Loading…</div>
        ) : agents.length === 0 ? (
          <div className="px-5 py-10 text-center text-terminal-dim text-sm">No agents found.</div>
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={agent.agent_name}
              agent={agent}
              onClick={() => navigate(`/runs?project=${encodeURIComponent(decodedName)}&q=${encodeURIComponent(agent.agent_name)}`)}
            />
          ))
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => navigate(`/runs?project=${encodeURIComponent(decodedName)}`)}
          className="btn-primary text-sm"
        >
          View all runs →
        </button>
      </div>
    </div>
  );
}

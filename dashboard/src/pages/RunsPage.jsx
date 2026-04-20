import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWs } from "../context/WsContext";
import { api } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

export default function RunsPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWs();
  const navigate = useNavigate();

  const load = () =>
    api.getRuns().then((r) => { setRuns(r); setLoading(false); }).catch(console.error);

  useEffect(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  }, [subscribe]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await api.deleteRun(id);
    setRuns((r) => r.filter((x) => x.id !== id));
  };

  const duration = (run) => {
    if (!run.ended_at) return "—";
    const ms = new Date(run.ended_at) - new Date(run.started_at);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-terminal-text">Runs</h1>
          <p className="text-sm text-terminal-dim mt-0.5">{runs.length} total runs</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-terminal-border text-xs text-terminal-dim uppercase tracking-wider">
          <div className="col-span-3">Agent</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Started</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-1">Tokens</div>
          <div className="col-span-1"></div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="px-5 py-10 text-center text-terminal-dim text-sm">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-2xl mb-2 text-terminal-dim">◎</div>
            <div className="text-sm text-terminal-dim">No runs yet. Start an agent to see runs here.</div>
          </div>
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              onClick={() => navigate(`/runs/${run.id}`)}
              className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-terminal-border/40
                         hover:bg-terminal-muted/30 cursor-pointer transition-colors animate-fade-in
                         group"
            >
              <div className="col-span-3 text-sm text-terminal-text font-medium truncate">
                {run.agent_name}
                <div className="text-xs text-terminal-dim font-normal mt-0.5 truncate">{run.id.slice(0, 8)}…</div>
              </div>
              <div className="col-span-2 flex items-center">
                <StatusBadge status={run.status} />
              </div>
              <div className="col-span-3 text-sm text-terminal-dim flex items-center">
                {new Date(run.started_at).toLocaleString()}
              </div>
              <div className="col-span-2 text-sm text-terminal-dim flex items-center">
                {duration(run)}
              </div>
              <div className="col-span-1 text-sm text-terminal-amber flex items-center">
                {run.token_count?.toLocaleString() || "0"}
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <button
                  onClick={(e) => handleDelete(e, run.id)}
                  className="opacity-0 group-hover:opacity-100 text-terminal-red text-xs
                             hover:text-terminal-red/80 transition-all px-2 py-1 rounded
                             hover:bg-terminal-red/10"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React from "react";
import { NavLink } from "react-router-dom";
import { useWs } from "../context/WsContext";

const NAV = [
  { to: "/",        label: "Overview",  icon: "⬡" },
  { to: "/runs",    label: "Runs",      icon: "▶" },
  { to: "/settings",label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const { connected } = useWs();

  return (
    <aside className="w-56 flex-shrink-0 border-r border-terminal-border bg-terminal-surface flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <span className="text-terminal-green font-display text-lg font-bold tracking-tight">
            Agent<span className="text-terminal-cyan">Dash</span>
          </span>
          <span className="text-terminal-dim text-xs">v1.0</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-terminal-dim">
          {connected ? (
            <>
              <span className="live-dot" />
              <span className="text-terminal-green">live</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-terminal-red" />
              <span className="text-terminal-red">offline</span>
            </>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <span className="text-base leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-terminal-border text-xs text-terminal-dim">
        <div>AgentDash</div>
        <div className="text-terminal-dim/60">open-source • MIT</div>
      </div>
    </aside>
  );
}

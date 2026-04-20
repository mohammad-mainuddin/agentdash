import React from "react";

export default function StatusBadge({ status }) {
  if (status === "running") {
    return (
      <span className="badge-running">
        <span className="live-dot w-1.5 h-1.5" />
        running
      </span>
    );
  }
  if (status === "success") {
    return <span className="badge-success">✓ success</span>;
  }
  return <span className="badge-error">✕ {status || "error"}</span>;
}

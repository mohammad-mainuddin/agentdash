/**
 * AgentDash Database
 * SQLite via better-sqlite3
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "agentdash.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,
    agent_name  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'running',  -- running | success | error
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    token_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id        TEXT PRIMARY KEY,
    run_id    TEXT NOT NULL,
    type      TEXT NOT NULL,   -- run_start | log | tool_call | run_end
    data      TEXT NOT NULL,   -- JSON blob
    timestamp TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
`);

console.log(`[DB] SQLite database ready at ${DB_PATH}`);

module.exports = db;

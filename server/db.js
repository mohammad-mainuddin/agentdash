/**
 * AgentDash Database — SQLite via better-sqlite3
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "agentdash.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Base schema
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id            TEXT PRIMARY KEY,
    agent_name    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'running',
    started_at    TEXT NOT NULL,
    ended_at      TEXT,
    token_count   INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL    NOT NULL DEFAULT 0,
    parent_run_id TEXT,
    llm_calls     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id        TEXT PRIMARY KEY,
    run_id    TEXT NOT NULL,
    type      TEXT NOT NULL,
    data      TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_run_id   ON events(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs(status);
`);

// Migrate older DBs that lack the new columns
const migrate = (sql) => { try { db.exec(sql); } catch (_) {} };
migrate(`ALTER TABLE runs ADD COLUMN cost_usd      REAL    NOT NULL DEFAULT 0`);
migrate(`ALTER TABLE runs ADD COLUMN parent_run_id TEXT`);
migrate(`ALTER TABLE runs ADD COLUMN llm_calls     INTEGER NOT NULL DEFAULT 0`);
migrate(`ALTER TABLE runs ADD COLUMN project       TEXT    NOT NULL DEFAULT ''`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_agent_name ON runs(agent_name)`);

// Seed default settings
const seedSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
for (const [k, v] of [
  ["alert_webhook_url",   ""],
  ["alert_on_error",      "0"],
  ["alert_token_budget",  "0"],
  ["alert_time_budget_s", "0"],
  ["retention_days",      "0"],
]) seedSetting.run(k, v);

console.log(`[DB] SQLite ready at ${DB_PATH}`);
module.exports = db;

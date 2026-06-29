import { createClient, Client } from '@libsql/client';

let _db: Client | null = null;

export function getDb(): Client {
  if (!_db) {
    if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL manquant');
    if (!process.env.TURSO_AUTH_TOKEN)   throw new Error('TURSO_AUTH_TOKEN manquant');
    _db = createClient({
      url:       process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _db;
}

export const db = {
  execute:       (...args: Parameters<Client['execute']>)       => getDb().execute(...args),
  executeMultiple: (...args: Parameters<Client['executeMultiple']>) => getDb().executeMultiple(...args),
  batch:         (...args: Parameters<Client['batch']>)         => getDb().batch(...args),
  transaction:   (...args: Parameters<Client['transaction']>)   => getDb().transaction(...args),
  close:         ()                                             => getDb().close(),
};

export async function initDb() {
  // Add columns that may be missing in older DB instances (ALTER TABLE ignores existing columns via try/catch)
  const migrations = [
    'ALTER TABLE reports ADD COLUMN workspace_id TEXT',
    'ALTER TABLE reports ADD COLUMN created_by TEXT',
    'ALTER TABLE users ADD COLUMN first_login_at TEXT',
    'ALTER TABLE users ADD COLUMN last_login_at TEXT',
    'ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN status TEXT DEFAULT \'active\'',
    'ALTER TABLE reports ADD COLUMN total_time_seconds INTEGER DEFAULT 0',
    'ALTER TABLE reports ADD COLUMN interaction_count INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN total_time_seconds INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN interaction_count INTEGER DEFAULT 0',
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id               TEXT PRIMARY KEY,
      email            TEXT UNIQUE NOT NULL,
      password_hash    TEXT NOT NULL,
      name             TEXT DEFAULT '',
      is_global_admin  INTEGER DEFAULT 0,
      created_at       TEXT NOT NULL,
      first_login_at   TEXT,
      last_login_at    TEXT,
      login_count      INTEGER DEFAULT 0,
      status           TEXT DEFAULT 'active',
      total_time_seconds INTEGER DEFAULT 0,
      interaction_count  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      owner_id   TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      user_id      TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (user_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id           TEXT PRIMARY KEY,
      prospect     TEXT NOT NULL DEFAULT '',
      site_url     TEXT NOT NULL DEFAULT '',
      sector       TEXT NOT NULL DEFAULT '',
      state_b64    TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      workspace_id TEXT,
      created_by   TEXT,
      total_time_seconds INTEGER DEFAULT 0,
      interaction_count  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id             TEXT PRIMARY KEY,
      token          TEXT UNIQUE NOT NULL,
      email          TEXT NOT NULL,
      invited_by     TEXT NOT NULL,
      workspace_id   TEXT,
      workspace_role TEXT DEFAULT 'reader',
      expires_at     TEXT NOT NULL,
      accepted_at    TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_views (
      id         TEXT PRIMARY KEY,
      report_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      viewed_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id         TEXT PRIMARY KEY,
      token      TEXT UNIQUE NOT NULL,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_user_stats (
      report_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      time_seconds INTEGER DEFAULT 0,
      interactions INTEGER DEFAULT 0,
      view_count   INTEGER DEFAULT 0,
      last_viewed  TEXT,
      PRIMARY KEY (report_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_report_views_report ON report_views(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_views_user   ON report_views(user_id);
    CREATE INDEX IF NOT EXISTS idx_report_views_date   ON report_views(viewed_at DESC);
  `);
}

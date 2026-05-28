import { createClient } from '@libsql/client';

if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL manquant');
if (!process.env.TURSO_AUTH_TOKEN)   throw new Error('TURSO_AUTH_TOKEN manquant');

export const db = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id               TEXT PRIMARY KEY,
      email            TEXT UNIQUE NOT NULL,
      password_hash    TEXT NOT NULL,
      name             TEXT DEFAULT '',
      is_global_admin  INTEGER DEFAULT 0,
      created_at       TEXT NOT NULL
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
      created_by   TEXT
    );
  `);
}

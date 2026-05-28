import { createClient } from '@libsql/client';

if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL manquant');
if (!process.env.TURSO_AUTH_TOKEN)   throw new Error('TURSO_AUTH_TOKEN manquant');

export const db = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id           TEXT PRIMARY KEY,
      prospect     TEXT NOT NULL DEFAULT '',
      site_url     TEXT NOT NULL DEFAULT '',
      sector       TEXT NOT NULL DEFAULT '',
      state_b64    TEXT NOT NULL,
      created_at   TEXT NOT NULL
    )
  `);
}

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Mot de passe trop court (8 caractères min.)' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });
    if (existing.rows.length) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
    }

    // First user = global admin
    const countRes = await db.execute('SELECT COUNT(*) FROM users');
    const isAdmin  = (countRes.rows[0][0] as number) === 0 ? 1 : 0;

    const userId   = uid();
    const hash     = await bcrypt.hash(password, 12);
    const now      = new Date().toISOString();

    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash, name, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [userId, email.toLowerCase().trim(), hash, name || '', isAdmin, now],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

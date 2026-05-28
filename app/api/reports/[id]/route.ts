import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const result = await db.execute({
      sql: 'SELECT state_b64 FROM reports WHERE id = ?',
      args: [params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
    }

    return NextResponse.json({ stateB64: result.rows[0][0] });
  } catch (err) {
    console.error('[reports/[id] GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

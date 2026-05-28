import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* POST /api/reports — save a new report */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { id, prospect, siteUrl, sector, stateB64 } = await req.json();

    if (!id || !stateB64) {
      return NextResponse.json({ error: 'id and stateB64 are required' }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT OR REPLACE INTO reports (id, prospect, site_url, sector, state_b64, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, prospect ?? '', siteUrl ?? '', sector ?? '', stateB64, new Date().toISOString()],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/* GET /api/reports — list all reports, newest first */
export async function GET() {
  try {
    await initDb();
    const result = await db.execute(
      `SELECT id, prospect, site_url, sector, created_at
       FROM reports
       ORDER BY created_at DESC`
    );

    const rows = result.rows.map(r => ({
      id:        r[0] as string,
      prospect:  r[1] as string,
      siteUrl:   r[2] as string,
      sector:    r[3] as string,
      createdAt: r[4] as string,
    }));

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[reports GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

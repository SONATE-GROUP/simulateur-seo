import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* POST /api/reports — save a new report */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();
    const { id, prospect, siteUrl, sector, stateB64, workspaceId } = await req.json();

    if (!id || !stateB64) {
      return NextResponse.json({ error: 'id and stateB64 are required' }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT OR REPLACE INTO reports (id, prospect, site_url, sector, state_b64, created_at, workspace_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, prospect ?? '', siteUrl ?? '', sector ?? '', stateB64, new Date().toISOString(), workspaceId ?? null, session.user.id],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/* GET /api/reports — list reports (all for admin, workspace-filtered for members) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();
    let rows;

    if (session.user.isGlobalAdmin) {
      const result = await db.execute(
        `SELECT r.id, r.prospect, r.site_url, r.sector, r.created_at, r.workspace_id, w.name as workspace_name
         FROM reports r
         LEFT JOIN workspaces w ON w.id = r.workspace_id
         ORDER BY r.created_at DESC`
      );
      rows = result.rows;
    } else {
      const result = await db.execute({
        sql: `SELECT r.id, r.prospect, r.site_url, r.sector, r.created_at, r.workspace_id, w.name as workspace_name
              FROM reports r
              LEFT JOIN workspaces w ON w.id = r.workspace_id
              WHERE r.workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = ?
              )
              ORDER BY r.created_at DESC`,
        args: [session.user.id],
      });
      rows = result.rows;
    }

    return NextResponse.json(rows.map(r => ({
      id:            r[0] as string,
      prospect:      r[1] as string,
      siteUrl:       r[2] as string,
      sector:        r[3] as string,
      createdAt:     r[4] as string,
      workspaceId:   r[5] as string | null,
      workspaceName: r[6] as string | null,
    })));
  } catch (err) {
    console.error('[reports GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

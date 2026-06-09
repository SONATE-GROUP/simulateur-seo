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

    const viewSubquery = `(
      SELECT rv.report_id,
             COUNT(*) as view_count,
             MAX(rv.viewed_at) as last_viewed_at,
             (SELECT u2.name FROM users u2
              JOIN report_views rv2 ON rv2.user_id = u2.id
              WHERE rv2.report_id = rv.report_id
              ORDER BY rv2.viewed_at DESC LIMIT 1) as last_viewer_name,
             (SELECT u3.email FROM users u3
              JOIN report_views rv3 ON rv3.user_id = u3.id
              WHERE rv3.report_id = rv.report_id
              ORDER BY rv3.viewed_at DESC LIMIT 1) as last_viewer_email
      FROM report_views rv
      GROUP BY rv.report_id
    ) vs`;

    if (session.user.isGlobalAdmin) {
      const result = await db.execute(
        `SELECT r.id, r.prospect, r.site_url, r.sector, r.created_at, r.workspace_id,
                w.name as workspace_name,
                COALESCE(vs.view_count, 0) as view_count,
                vs.last_viewed_at, vs.last_viewer_name, vs.last_viewer_email
         FROM reports r
         LEFT JOIN workspaces w ON w.id = r.workspace_id
         LEFT JOIN ${viewSubquery} ON vs.report_id = r.id
         ORDER BY r.created_at DESC`
      );
      rows = result.rows;
    } else {
      const result = await db.execute({
        sql: `SELECT r.id, r.prospect, r.site_url, r.sector, r.created_at, r.workspace_id,
                     w.name as workspace_name,
                     COALESCE(vs.view_count, 0) as view_count,
                     vs.last_viewed_at, vs.last_viewer_name, vs.last_viewer_email
              FROM reports r
              LEFT JOIN workspaces w ON w.id = r.workspace_id
              LEFT JOIN ${viewSubquery} ON vs.report_id = r.id
              WHERE r.created_by = ?
                 OR r.workspace_id IN (
                   SELECT workspace_id FROM workspace_members WHERE user_id = ?
                 )
              ORDER BY r.created_at DESC`,
        args: [session.user.id, session.user.id],
      });
      rows = result.rows;
    }

    return NextResponse.json(rows.map(r => ({
      id:               r[0] as string,
      prospect:         r[1] as string,
      siteUrl:          r[2] as string,
      sector:           r[3] as string,
      createdAt:        r[4] as string,
      workspaceId:      r[5] as string | null,
      workspaceName:    r[6] as string | null,
      viewCount:        Number(r[7]) || 0,
      lastViewedAt:     r[8] as string | null,
      lastViewerName:   r[9] as string | null,
      lastViewerEmail:  r[10] as string | null,
    })));
  } catch (err) {
    console.error('[reports GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();

    // Check access
    if (!session.user.isGlobalAdmin) {
      const reportRes = await db.execute({
        sql: 'SELECT workspace_id, created_by FROM reports WHERE id = ?',
        args: [params.id],
      });
      if (!reportRes.rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
      const workspaceId = reportRes.rows[0][0] as string | null;
      const createdBy   = reportRes.rows[0][1] as string;
      if (createdBy !== session.user.id) {
        if (workspaceId) {
          const check = await db.execute({
            sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
            args: [workspaceId, session.user.id],
          });
          if (!check.rows.length) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        } else {
          return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }
      }
    }

    const result = await db.execute({
      sql: `SELECT
              s.user_id,
              u.name,
              u.email,
              s.time_seconds,
              s.interactions,
              s.view_count,
              s.last_viewed
            FROM report_user_stats s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.report_id = ?
            ORDER BY s.last_viewed DESC`,
      args: [params.id],
    });

    const viewers = result.rows.map(row => ({
      userId:       row[0] as string,
      name:         row[1] as string | null,
      email:        row[2] as string | null,
      timeSeconds:  row[3] as number,
      interactions: row[4] as number,
      viewCount:    row[5] as number,
      lastViewed:   row[6] as string | null,
    }));

    return NextResponse.json(viewers);
  } catch (err) {
    console.error('[reports/[id]/viewers GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

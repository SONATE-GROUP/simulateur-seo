import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* POST /api/reports/[id]/engagement — accumulate time spent / interaction count for a report.
   Fire-and-forget from the client (periodic heartbeat + flush on unload), never blocks the UI. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { seconds, interactions } = await req.json();
    const secondsToAdd      = Math.max(0, Math.round(Number(seconds) || 0));
    const interactionsToAdd = Math.max(0, Math.round(Number(interactions) || 0));
    if (secondsToAdd === 0 && interactionsToAdd === 0) {
      return NextResponse.json({ ok: true });
    }

    await initDb();
    const now = new Date().toISOString();

    await db.execute({
      sql: `UPDATE reports
            SET total_time_seconds = COALESCE(total_time_seconds, 0) + ?,
                interaction_count  = COALESCE(interaction_count, 0)  + ?
            WHERE id = ?`,
      args: [secondsToAdd, interactionsToAdd, params.id],
    });

    await db.execute({
      sql: `INSERT INTO report_user_stats (report_id, user_id, time_seconds, interactions, view_count, last_viewed)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT (report_id, user_id) DO UPDATE SET
              time_seconds = time_seconds + excluded.time_seconds,
              interactions = interactions + excluded.interactions,
              last_viewed  = excluded.last_viewed`,
      args: [params.id, session.user.id, secondsToAdd, interactionsToAdd, now],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports/[id]/engagement POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

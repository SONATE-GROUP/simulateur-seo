import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* POST /api/users/me/engagement - accumulate overall time spent / interactions for the
   logged-in user, independently of whether a report is open/saved. Fire-and-forget. */
export async function POST(req: NextRequest) {
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
    await db.execute({
      sql: `UPDATE users
            SET total_time_seconds = COALESCE(total_time_seconds, 0) + ?,
                interaction_count  = COALESCE(interaction_count, 0)  + ?
            WHERE id = ?`,
      args: [secondsToAdd, interactionsToAdd, session.user.id],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[users/me/engagement POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

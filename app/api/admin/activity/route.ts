import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* GET /api/admin/activity — recent logins + report views (global admin only) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  // Recent logins (last 30)
  const loginsRes = await db.execute(`
    SELECT u.id, u.name, u.email, u.last_login_at, u.login_count, u.first_login_at
    FROM users u
    WHERE u.last_login_at IS NOT NULL
    ORDER BY u.last_login_at DESC
    LIMIT 30
  `);

  const logins = loginsRes.rows.map(r => ({
    type:       'login' as const,
    userId:     r[0] as string,
    userName:   (r[1] as string) || null,
    userEmail:  r[2] as string,
    date:       r[3] as string,
    loginCount: Number(r[4]),
    firstLogin: r[5] as string | null,
  }));

  // Recent report views (last 50)
  const viewsRes = await db.execute(`
    SELECT rv.id, rv.viewed_at,
           u.id as user_id, u.name as user_name, u.email as user_email,
           r.id as report_id, r.prospect, r.site_url
    FROM report_views rv
    JOIN users u ON u.id = rv.user_id
    JOIN reports r ON r.id = rv.report_id
    ORDER BY rv.viewed_at DESC
    LIMIT 50
  `);

  const views = viewsRes.rows.map(r => ({
    type:        'report_view' as const,
    viewId:      r[0] as string,
    date:        r[1] as string,
    userId:      r[2] as string,
    userName:    (r[3] as string) || null,
    userEmail:   r[4] as string,
    reportId:    r[5] as string,
    prospect:    r[6] as string,
    siteUrl:     r[7] as string,
  }));

  // Merge + sort by date desc, keep top 50
  const all = [...logins, ...views]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);

  return NextResponse.json(all);
}

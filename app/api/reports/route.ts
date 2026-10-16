import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { REPORT_ID_RE, type LegacyStats, type ReportSummary } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/* POST /api/reports - enregistre un nouveau rapport. L'auteur est la personne
   connectée (imposé par la RLS) ; le compte est « Sonate interne » par défaut. */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { id, prospect, siteUrl, sector, stateB64, accountId } = await req.json();

  if (typeof id !== 'string' || !REPORT_ID_RE.test(id) || typeof stateB64 !== 'string' || !stateB64) {
    return NextResponse.json({ error: 'id et stateB64 requis' }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('reports').insert({
    id,
    prospect: prospect ?? '',
    site_url: siteUrl ?? '',
    sector: sector ?? '',
    state: stateB64,
    created_by: user?.id,
    ...(accountId ? { account_id: accountId } : {}),
  });

  if (error) {
    console.error('[reports POST]', error.message);
    const refused = error.code === '42501';
    return NextResponse.json(
      { error: refused ? 'Accès refusé : le Simulateur SEO ne vous est pas ouvert' : 'Erreur serveur' },
      { status: refused ? 403 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

/* GET /api/reports - tous les rapports visibles (la RLS : toute l'équipe qui a
   l'outil), avec le compte, l'auteur et les consultations. Le détail de qui a
   consulté n'est rendu qu'aux admins de l'outil. */
export async function GET() {
  const supabase = createServerClient();

  const [reports, accounts, authors, stats, views, viewers] = await Promise.all([
    supabase.from('reports')
      .select('id, prospect, site_url, sector, account_id, created_by, legacy_author, time_seconds, interactions, legacy_stats, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase.rpc('report_accounts'),
    supabase.rpc('report_authors'),
    supabase.rpc('report_view_stats'),
    // Admins seulement (RLS) ; un membre reçoit une liste vide.
    supabase.from('report_views').select('report_id, user_id, viewed_at').order('viewed_at', { ascending: false }),
    supabase.rpc('report_viewers'),
  ]);

  if (reports.error) {
    console.error('[reports GET]', reports.error.message);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  const accountName = new Map((accounts.data ?? []).map(a => [a.report_id, a.account_name]));
  const authorEmail = new Map((authors.data ?? []).map(a => [a.user_id, a.email]));
  const viewStats   = new Map((stats.data ?? []).map(s => [s.report_id, s]));
  const viewerEmail = new Map((viewers.data ?? []).map(v => [v.user_id, v.email]));
  const lastView    = new Map<string, { user_id: string | null; viewed_at: string }>();
  for (const v of views.data ?? []) if (!lastView.has(v.report_id)) lastView.set(v.report_id, v);

  const rows: ReportSummary[] = reports.data.map(r => {
    const legacy = (r.legacy_stats ?? {}) as LegacyStats;
    const s = viewStats.get(r.id);
    const last = lastView.get(r.id);
    const lastNow = s?.last_viewed_at ?? null;
    const lastBefore = legacy.last_viewed_at ?? null;
    return {
      id: r.id,
      prospect: r.prospect,
      siteUrl: r.site_url,
      sector: r.sector,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      accountId: r.account_id,
      accountName: accountName.get(r.id) ?? null,
      createdBy: r.created_by,
      authorEmail: (r.created_by && authorEmail.get(r.created_by)) || r.legacy_author || null,
      viewCount: Number(s?.view_count ?? 0) + Number(legacy.views ?? 0),
      lastViewedAt: lastNow && lastBefore ? (lastNow > lastBefore ? lastNow : lastBefore) : (lastNow ?? lastBefore),
      lastViewerEmail: last?.user_id ? viewerEmail.get(last.user_id) ?? null : null,
      totalTimeSeconds: r.time_seconds,
      interactionCount: r.interactions,
    };
  });

  return NextResponse.json(rows);
}

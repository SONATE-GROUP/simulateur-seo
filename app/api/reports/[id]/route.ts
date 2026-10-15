import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/* GET /api/reports/[id] - l'état d'un rapport, et sa consultation notée.
   Dans Turso, tout compte connecté lisait n'importe quel rapport : ici, la RLS
   réserve la lecture à l'équipe qui a l'outil. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('reports').select('state').eq('id', params.id).maybeSingle();

  if (error) {
    console.error('[reports/[id] GET]', error.message);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });

  // Jamais bloquant : une consultation non notée ne doit pas empêcher d'ouvrir le rapport.
  const { error: viewError } = await supabase.rpc('record_view', { p_report_id: params.id });
  if (viewError) console.error('[reports/[id] GET] record_view', viewError.message);

  return NextResponse.json({ stateB64: data.state });
}

/* PUT /api/reports/[id] - réenregistre un rapport. Un membre ne réécrit que les
   siens, un admin tous (RLS) : zéro ligne touchée = refus. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { prospect, siteUrl, sector, stateB64 } = await req.json();
  if (typeof stateB64 !== 'string' || !stateB64) {
    return NextResponse.json({ error: 'stateB64 requis' }, { status: 400 });
  }

  const { data, error } = await supabase.from('reports')
    .update({ prospect: prospect ?? '', site_url: siteUrl ?? '', sector: sector ?? '', state: stateB64 })
    .eq('id', params.id)
    .select('id');

  if (error) {
    console.error('[reports/[id] PUT]', error.message);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'Accès refusé : seul l’auteur ou un admin réenregistre ce rapport' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/* DELETE /api/reports/[id] - l'auteur ou un admin (RLS). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('reports').delete().eq('id', params.id).select('id');

  if (error) {
    console.error('[reports/[id] DELETE]', error.message);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'Accès refusé : seul l’auteur ou un admin supprime ce rapport' }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/* PATCH /api/reports/[id] - rattache un rapport à un autre compte du portail.
   Une seule porte : simulateur_seo.move_report_account(), admin de l'outil,
   motif obligatoire, trace dans core.events. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { accountId, reason } = await req.json();
  if (typeof accountId !== 'string' || !accountId) {
    return NextResponse.json({ error: 'accountId requis' }, { status: 400 });
  }

  const { error } = await supabase.rpc('move_report_account', {
    p_report_id: params.id,
    p_account_id: accountId,
    p_reason: typeof reason === 'string' ? reason : '',
  });

  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === 'P0002' ? 404 : 500;
    if (status === 500) console.error('[reports/[id] PATCH]', error.message);
    return NextResponse.json({ error: status === 500 ? 'Erreur serveur' : error.message }, { status });
  }
  return NextResponse.json({ ok: true });
}

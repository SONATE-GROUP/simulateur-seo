import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/* POST /api/reports/[id]/engagement - ajoute du temps passé et des interactions
   au suivi d'un rapport (battement du front toutes les 30 s et à la fermeture).
   Par simulateur_seo.add_engagement(), plafonnée : ni écriture directe de la
   ligne, ni suivi par personne (D10 du plan). Ne bloque jamais l'interface. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { seconds, interactions } = await req.json().catch(() => ({}));

  const { error } = await supabase.rpc('add_engagement', {
    p_report_id: params.id,
    p_seconds: Math.max(0, Math.round(Number(seconds) || 0)),
    p_interactions: Math.max(0, Math.round(Number(interactions) || 0)),
  });
  if (error) console.error('[reports/[id]/engagement POST]', error.message);

  return NextResponse.json({ ok: !error });
}

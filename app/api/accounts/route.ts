import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/* GET /api/accounts - les comptes du portail auxquels rattacher un rapport
   (ex-« espaces »), lus par simulateur_seo.list_accounts() : vide sans l'outil. */
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('list_accounts');
  if (error) {
    console.error('[accounts GET]', error.message);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  return NextResponse.json((data ?? []).map(a => ({ id: a.id, name: a.name, status: a.status })));
}

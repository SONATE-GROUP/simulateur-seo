import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/* POST /api/auth/signout - ferme la session de l'outil. La session du portail
   est la même Auth : on se déconnecte localement, sans toucher aux autres
   appareils (scope « local »). */
export async function POST() {
  const supabase = createServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.json({ ok: true });
}

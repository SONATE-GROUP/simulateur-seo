import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/* Le schéma de l'outil dans les projets Supabase du portail Ma Sonate (0059).
   L'Auth est celle du portail : la session est la même personne, et la RLS du
   schéma décide de ce qu'elle voit à chaque requête. */
export const DB_SCHEMA = 'simulateur_seo' as const;

/* Client de la personne connectée (cookies) : toutes les lectures et écritures
   de l'application passent par lui, donc par la RLS. */
export function createServerClient() {
  const cookieStore = cookies();

  return createSSRClient<Database, typeof DB_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    }
  );
}

/* Service-role : réservé à la route /sso (registre des tickets, journal,
   ouverture de la session). Jamais pour lire ou écrire un rapport. */
export function createServiceClient() {
  return createSupabaseClient<Database, typeof DB_SCHEMA>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

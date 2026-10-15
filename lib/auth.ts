import { createServerClient } from '@/lib/supabase/server';

export type ToolRole = 'admin' | 'member';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  /* Le rôle dans l'outil, lu dans l'écran Équipe du portail à chaque requête
     (`simulateur_seo.tool_role()`). null : la personne n'a pas l'outil. */
  toolRole: ToolRole | null;
}

/* La personne connectée et son rôle dans l'outil, ou null sans session. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: role } = await supabase.rpc('tool_role');
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    id: user.id,
    email: (user.email ?? '').toLowerCase(),
    name: meta.full_name || meta.name || '',
    toolRole: role === 'admin' || role === 'member' ? role : null,
  };
}

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ToolRole } from '@/lib/auth';

/* La session côté navigateur : la personne connectée et son rôle dans l'outil,
   relus par /api/me (donc dans l'écran Équipe du portail). Remplace
   next-auth/react : même forme d'usage, `useSession()` et `signOut()`. */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  toolRole: ToolRole | null;
  isAdmin: boolean;
}

type Status = 'loading' | 'authenticated' | 'unauthenticated';

const SessionContext = createContext<{ data: { user: SessionUser } | null; status: Status }>({
  data: null,
  status: 'loading',
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<{ data: { user: SessionUser } | null; status: Status }>({
    data: null,
    status: 'loading',
  });

  useEffect(() => {
    // Sur /login, personne n'est connecté par définition : pas d'appel inutile (401).
    if (window.location.pathname.startsWith('/login')) {
      setValue({ data: null, status: 'unauthenticated' });
      return;
    }
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (cancelled) return;
        setValue(u
          ? { data: { user: { ...u, isAdmin: u.toolRole === 'admin' } }, status: 'authenticated' }
          : { data: null, status: 'unauthenticated' });
      })
      .catch(() => { if (!cancelled) setValue({ data: null, status: 'unauthenticated' }); });
    return () => { cancelled = true; };
  }, []);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/* Ferme la session de l'outil, puis renvoie vers le portail (ou /login). */
export async function signOut() {
  await fetch('/api/auth/signout', { method: 'POST' }).catch(() => { /* ignore */ });
  window.location.href = process.env.NEXT_PUBLIC_PORTAL_URL || '/login';
}

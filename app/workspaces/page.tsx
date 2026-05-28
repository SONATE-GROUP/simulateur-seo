'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const G    = '#1a2e25';
const G2   = '#142218';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export default function WorkspacesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch('/api/workspaces')
        .then(r => r.json())
        .then(data => { setWorkspaces(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [status, router]);

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const ws = await res.json();
      setWorkspaces(prev => [ws, ...prev]);
      setNewName('');
    }
    setCreating(false);
  };

  if (status === 'loading' || loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CREAM, fontFamily: 'Inter, sans-serif' }}>
        Chargement…
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: G, color: CREAM, fontFamily: 'Inter, sans-serif', padding: '40px 32px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Espaces de travail</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>
              Bonjour, {session?.user?.name || session?.user?.email}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 8, padding: '9px 18px', color: CREAM,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              ← Simulateur
            </Link>
            <Link href="/rapports" style={{
              backgroundColor: G4, color: CREAM,
              padding: '9px 18px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}>
              📋 Rapports
            </Link>
          </div>
        </div>

        {/* Create workspace form */}
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
            Créer un espace
          </h2>
          <form onSubmit={createWorkspace} style={{ display: 'flex', gap: 10 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom de l'espace (ex : Agence Durand)"
              style={{
                flex: 1, backgroundColor: G3, border: `1px solid ${G4}`,
                borderRadius: 8, padding: '10px 14px', color: CREAM,
                fontSize: 14, outline: 'none',
              }}
            />
            <button type="submit" disabled={creating || !newName.trim()} style={{
              backgroundColor: ORANGE, border: 'none', borderRadius: 8,
              padding: '10px 20px', color: 'white', fontSize: 14,
              fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.7 : 1,
            }}>
              {creating ? 'Création…' : 'Créer'}
            </button>
          </form>
        </div>

        {/* Workspace list */}
        {workspaces.length === 0 ? (
          <div style={{
            backgroundColor: G5, borderRadius: 12, padding: '48px 32px',
            textAlign: 'center', color: '#7a9e8e', fontSize: 15, border: `1px solid ${G3}`,
          }}>
            Aucun espace de travail.<br />Créez-en un pour commencer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workspaces.map(ws => (
              <Link key={ws.id} href={`/workspaces/${ws.id}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: G5, borderRadius: 10, padding: '16px 20px',
                border: `1px solid ${G3}`, textDecoration: 'none', color: CREAM,
                transition: 'border-color .15s',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ws.name}</div>
                  <div style={{ color: '#7a9e8e', fontSize: 12, marginTop: 3 }}>
                    {new Date(ws.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <span style={{ color: '#5a7a6a', fontSize: 13 }}>Gérer →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

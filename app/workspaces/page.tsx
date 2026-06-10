'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const G    = '#1a2e25';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

const ROLE_LABEL: Record<string, string> = {
  owner:  'Propriétaire',
  editor: 'Éditeur',
  reader: 'Lecteur',
};

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  role: string;
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

  const deleteWorkspace = async (id: string, name: string) => {
    if (!confirm(`Supprimer l'espace "${name}" ? Ses rapports ne seront pas supprimés.`)) return;
    const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    if (res.ok) setWorkspaces(prev => prev.filter(w => w.id !== id));
  };

  if (status === 'loading' || loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CREAM, fontFamily: 'Inter, sans-serif' }}>
        Chargement…
      </main>
    );
  }

  const isAdmin = session?.user?.isGlobalAdmin;

  return (
    <main style={{ height: '100vh', overflowY: 'auto', backgroundColor: G, color: CREAM, fontFamily: 'Inter, sans-serif', padding: '40px 32px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Espaces clients</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>{workspaces.length} espace{workspaces.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && (
              <Link href="/users" style={{
                backgroundColor: 'transparent', border: `1px solid ${G3}`,
                borderRadius: 8, padding: '9px 18px', color: CREAM,
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>
                👤 Utilisateurs
              </Link>
            )}
            {isAdmin && (
              <Link href="/configuration" style={{
                backgroundColor: 'transparent', border: `1px solid ${G3}`,
                borderRadius: 8, padding: '9px 18px', color: CREAM,
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>
                ⚙️ Configuration
              </Link>
            )}
            <Link href="/rapports" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 8, padding: '9px 18px', color: CREAM,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              📋 Rapports
            </Link>
            <Link href="/" style={{
              backgroundColor: G4, color: CREAM,
              padding: '9px 18px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}>
              ← Simulateur
            </Link>
          </div>
        </div>

        {/* Create workspace form (admin only) */}
        {isAdmin && (
          <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
              Nouvel espace client
            </h2>
            <form onSubmit={createWorkspace} style={{ display: 'flex', gap: 10 }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nom du client (ex : Agence Durand)"
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
        )}

        {/* Workspace list */}
        {workspaces.length === 0 ? (
          <div style={{
            backgroundColor: G5, borderRadius: 12, padding: '48px 32px',
            textAlign: 'center', color: '#7a9e8e', fontSize: 15, border: `1px solid ${G3}`,
          }}>
            Aucun espace client.{isAdmin ? ' Créez-en un pour commencer.' : ''}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workspaces.map(ws => (
              <div key={ws.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: G5, borderRadius: 10, padding: '16px 20px',
                border: `1px solid ${G3}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ws.name}</div>
                  <div style={{ color: '#7a9e8e', fontSize: 12, marginTop: 3 }}>
                    {new Date(ws.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    backgroundColor: ws.role === 'owner' ? ORANGE + '22' : G3,
                    color: ws.role === 'owner' ? ORANGE : '#7a9e8e',
                    borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                  }}>
                    {ROLE_LABEL[ws.role] ?? ws.role}
                  </span>
                  {(isAdmin || ws.role === 'owner') && (
                    <Link href={`/workspaces/${ws.id}`} style={{
                      backgroundColor: G4, color: CREAM,
                      borderRadius: 6, padding: '6px 14px', fontSize: 12,
                      fontWeight: 600, textDecoration: 'none',
                    }}>
                      Gérer
                    </Link>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => deleteWorkspace(ws.id, ws.name)}
                      style={{
                        backgroundColor: 'transparent', border: '1px solid #e05050',
                        borderRadius: 6, padding: '5px 12px', color: '#e05050',
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

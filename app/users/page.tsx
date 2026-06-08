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

interface User {
  id: string;
  email: string;
  name: string;
  isGlobalAdmin: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', isGlobalAdmin: false });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      if (!session?.user?.isGlobalAdmin) { router.push('/'); return; }
      loadUsers();
    }
  }, [status, session, router]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadUsers() {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) return;
    setCreating(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers(prev => [data, ...prev]);
      setForm({ name: '', email: '', password: '', isGlobalAdmin: false });
    } else {
      setError(data.error || 'Erreur');
    }
    setCreating(false);
  };

  const toggleAdmin = async (userId: string, current: boolean) => {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isGlobalAdmin: !current }),
    });
    if (res.ok) setUsers(prev => prev.map(u => u.id === userId ? { ...u, isGlobalAdmin: !current } : u));
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Supprimer l'utilisateur "${userName}" ?`)) return;
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId));
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
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Utilisateurs</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>{users.length} utilisateur{users.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/workspaces" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 8, padding: '9px 18px', color: CREAM,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              👥 Espaces clients
            </Link>
            <Link href="/" style={{
              backgroundColor: ORANGE, color: '#fff',
              padding: '9px 18px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}>
              ← Simulateur
            </Link>
          </div>
        </div>

        {/* Create form */}
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
            Créer un utilisateur
          </h2>
          <form onSubmit={createUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nom"
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email *"
                required
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Mot de passe * (8 min.)"
                required
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isGlobalAdmin}
                  onChange={e => setForm(f => ({ ...f, isGlobalAdmin: e.target.checked }))}
                />
                Admin global
              </label>
              <button type="submit" disabled={creating} style={{
                backgroundColor: ORANGE, border: 'none', borderRadius: 8,
                padding: '10px 24px', color: 'white', fontSize: 14,
                fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.7 : 1,
              }}>
                {creating ? 'Création…' : 'Créer'}
              </button>
              {error && <span style={{ color: '#e05050', fontSize: 13 }}>{error}</span>}
            </div>
          </form>
        </div>

        {/* Users list */}
        {users.length === 0 ? (
          <div style={{ backgroundColor: G5, borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: '#7a9e8e', fontSize: 15, border: `1px solid ${G3}` }}>
            Aucun utilisateur.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 140px 120px 80px',
              gap: 12, padding: '6px 16px',
              color: '#5a7a6a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              <span>Nom</span><span>Email</span><span>Rôle</span><span>Créé le</span><span></span>
            </div>
            {users.map(u => (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 140px 120px 80px',
                gap: 12, alignItems: 'center',
                backgroundColor: G5, borderRadius: 10, padding: '13px 16px',
                border: `1px solid ${G3}`,
              }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{u.name || <span style={{ color: '#5a7a6a', fontStyle: 'italic' }}>—</span>}</span>
                <span style={{ color: '#7a9e8e', fontSize: 13 }}>{u.email}</span>
                <span>
                  {u.id !== session?.user?.id ? (
                    <button
                      onClick={() => toggleAdmin(u.id, u.isGlobalAdmin)}
                      style={{
                        backgroundColor: u.isGlobalAdmin ? ORANGE + '22' : G3,
                        color: u.isGlobalAdmin ? ORANGE : '#7a9e8e',
                        border: `1px solid ${u.isGlobalAdmin ? ORANGE + '44' : G4}`,
                        borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {u.isGlobalAdmin ? 'Admin' : 'Utilisateur'}
                    </button>
                  ) : (
                    <span style={{ backgroundColor: ORANGE + '22', color: ORANGE, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                      Admin
                    </span>
                  )}
                </span>
                <span style={{ color: '#5a7a6a', fontSize: 12 }}>
                  {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                </span>
                <div>
                  {u.id !== session?.user?.id && (
                    <button
                      onClick={() => deleteUser(u.id, u.name || u.email)}
                      style={{
                        backgroundColor: 'transparent', border: '1px solid #e05050',
                        borderRadius: 6, padding: '4px 10px', color: '#e05050',
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

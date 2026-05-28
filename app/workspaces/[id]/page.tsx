'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

const G    = '#1a2e25';
const G2   = '#142218';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function WorkspaceDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(() => {
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then(r => r.json())
      .then(data => { setMembers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') loadMembers();
  }, [status, router, loadMembers]);

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    if (res.ok) {
      setInviteEmail('');
      loadMembers();
    } else {
      const data = await res.json();
      setInviteError(data.error || 'Erreur');
    }
    setInviting(false);
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    loadMembers();
  };

  if (status === 'loading' || loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CREAM, fontFamily: 'Inter, sans-serif' }}>
        Chargement…
      </main>
    );
  }

  const currentUserRole = members.find(m => m.id === session?.user?.id)?.role;
  const canManage = session?.user?.isGlobalAdmin || currentUserRole === 'admin';

  return (
    <main style={{ minHeight: '100vh', backgroundColor: G, color: CREAM, fontFamily: 'Inter, sans-serif', padding: '40px 32px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Membres de l'espace</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>{members.length} membre{members.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/workspaces" style={{
            backgroundColor: 'transparent', border: `1px solid ${G3}`,
            borderRadius: 8, padding: '9px 18px', color: CREAM,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>
            ← Espaces
          </Link>
        </div>

        {/* Invite form (admin only) */}
        {canManage && (
          <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
              Inviter un membre
            </h2>
            <form onSubmit={inviteMember} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="email@exemple.com"
                  style={{
                    width: '100%', backgroundColor: G3, border: `1px solid ${G4}`,
                    borderRadius: 8, padding: '10px 14px', color: CREAM,
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'member' | 'admin')}
                style={{
                  backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8,
                  padding: '10px 12px', color: CREAM, fontSize: 14, outline: 'none',
                }}
              >
                <option value="member">Membre</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" disabled={inviting || !inviteEmail.trim()} style={{
                backgroundColor: ORANGE, border: 'none', borderRadius: 8,
                padding: '10px 20px', color: 'white', fontSize: 14,
                fontWeight: 700, cursor: inviting ? 'not-allowed' : 'pointer',
                opacity: inviting ? 0.7 : 1, whiteSpace: 'nowrap',
              }}>
                {inviting ? '…' : 'Inviter'}
              </button>
            </form>
            {inviteError && <div style={{ color: '#e05050', fontSize: 13, marginTop: 8 }}>{inviteError}</div>}
          </div>
        )}

        {/* Members list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: G5, borderRadius: 10, padding: '14px 18px',
              border: `1px solid ${G3}`,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name || m.email}</div>
                {m.name && <div style={{ color: '#7a9e8e', fontSize: 12, marginTop: 2 }}>{m.email}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  backgroundColor: m.role === 'admin' ? ORANGE + '22' : G3,
                  color: m.role === 'admin' ? ORANGE : '#7a9e8e',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  {m.role === 'admin' ? 'Admin' : 'Membre'}
                </span>
                {canManage && m.id !== session?.user?.id && (
                  <button
                    onClick={() => removeMember(m.id)}
                    style={{
                      backgroundColor: 'transparent', border: `1px solid #e05050`,
                      borderRadius: 6, padding: '4px 10px', color: '#e05050',
                      fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

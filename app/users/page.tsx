'use client';

import { useState, useEffect, useCallback } from 'react';
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
  firstLoginAt?: string | null;
  lastLoginAt?: string | null;
  loginCount?: number;
  workspaceCount?: number;
}

interface AccessWorkspace {
  id: string;
  name: string;
  role: string;
  reports: { id: string; prospect: string; siteUrl: string; sector: string; createdAt: string }[];
}

const ROLE_LABEL: Record<string, string> = {
  owner:  'Propriétaire',
  editor: 'Éditeur',
  reader: 'Lecteur',
};
const ROLE_COLOR: Record<string, string> = {
  owner:  '#e8571a',
  editor: '#4caf7d',
  reader: '#7a9e8e',
};

interface Invitation {
  id: string;
  email: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceRole: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'expired';
}

interface Workspace {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending:  'Invitation envoyée',
  accepted: 'Compte activé',
  expired:  'Invitation expirée',
};
const STATUS_COLOR: Record<string, string> = {
  pending:  '#d4a820',
  accepted: '#4caf7d',
  expired:  '#888',
};
const STATUS_BG: Record<string, string> = {
  pending:  '#d4a82022',
  accepted: '#4caf7d22',
  expired:  '#88888822',
};

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers]               = useState<User[]>([]);
  const [invitations, setInvitations]   = useState<Invitation[]>([]);
  const [workspaces, setWorkspaces]     = useState<Workspace[]>([]);
  const [loading, setLoading]           = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail]         = useState('');
  const [inviteWorkspace, setInviteWorkspace] = useState('');
  const [inviteRole, setInviteRole]           = useState('reader');
  const [sending, setSending]                 = useState(false);
  const [inviteMsg, setInviteMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [freshLink, setFreshLink]             = useState<string | null>(null);
  const [copied, setCopied]                   = useState(false);

  // Direct create form
  const [createForm, setCreateForm]   = useState({ email: '', password: '', name: '' });
  const [creating, setCreating]       = useState(false);
  const [createMsg, setCreateMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  // Resend state
  const [resending, setResending]   = useState<string | null>(null);
  const [resendLinks, setResendLinks] = useState<Record<string, string>>({});

  // Access panel per user
  const [expandedUser, setExpandedUser]   = useState<string | null>(null);
  const [accessData, setAccessData]       = useState<Record<string, AccessWorkspace[]>>({});
  const [accessLoading, setAccessLoading] = useState<string | null>(null);

  // Activity feed
  type ActivityItem =
    | { type: 'login'; userId: string; userName: string | null; userEmail: string; date: string; loginCount: number; firstLogin: string | null }
    | { type: 'report_view'; viewId: string; date: string; userId: string; userName: string | null; userEmail: string; reportId: string; prospect: string; siteUrl: string };
  const [activity, setActivity]       = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityOpen, setActivityOpen]       = useState(false);

  const loadActivity = async () => {
    if (activity.length > 0) { setActivityOpen(o => !o); return; }
    setActivityOpen(true);
    setActivityLoading(true);
    const res = await fetch('/api/admin/activity');
    const data = await res.json();
    setActivity(Array.isArray(data) ? data : []);
    setActivityLoading(false);
  };

  const toggleAccess = async (userId: string) => {
    if (expandedUser === userId) { setExpandedUser(null); return; }
    setExpandedUser(userId);
    if (accessData[userId]) return; // already loaded
    setAccessLoading(userId);
    const res = await fetch(`/api/users/${userId}/access`);
    const data = await res.json();
    setAccessData(prev => ({ ...prev, [userId]: data.workspaces ?? [] }));
    setAccessLoading(null);
  };

  const loadData = useCallback(async () => {
    const [usersRes, invRes, wsRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/invitations').then(r => r.json()),
      fetch('/api/workspaces').then(r => r.json()),
    ]);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    setInvitations(Array.isArray(invRes) ? invRes : []);
    setWorkspaces(Array.isArray(wsRes) ? wsRes : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      if (!session?.user?.isGlobalAdmin) { router.push('/'); return; }
      loadData();
    }
  }, [status, session, router, loadData]);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg(null);
    if (!inviteEmail) return;
    setSending(true);
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail,
        workspaceId: inviteWorkspace || null,
        workspaceRole: inviteRole,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setInviteMsg({ ok: true, text: `Lien généré pour ${inviteEmail}` });
      setFreshLink(data.inviteUrl);
      setCopied(false);
      setInviteEmail('');
      setInviteWorkspace('');
      setInviteRole('reader');
      setInvitations(prev => [data, ...prev]);
    } else {
      setInviteMsg({ ok: false, text: data.error || 'Erreur' });
      setFreshLink(null);
    }
    setSending(false);
  };

  const resendInvite = async (inv: Invitation) => {
    setResending(inv.id);
    const res = await fetch('/api/invitations/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId: inv.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setInvitations(prev => prev.map(i =>
        i.id === inv.id
          ? { ...i, status: 'pending', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }
          : i
      ));
      setResendLinks(prev => ({ ...prev, [inv.id]: data.inviteUrl }));
    }
    setResending(null);
  };

  const copyLink = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Mark as copied per-row too (reuse copied state for simplicity)
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg(null);
    if (!createForm.email || !createForm.password) return;
    setCreating(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers(prev => [data, ...prev]);
      setCreateForm({ email: '', password: '', name: '' });
      setCreateMsg({ ok: true, text: `Compte créé pour ${createForm.email}` });
    } else {
      setCreateMsg({ ok: false, text: data.error || 'Erreur' });
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

  const pendingInvites = invitations.filter(i => i.status !== 'accepted');
  const activeUsers    = users;

  return (
    <main style={{ height: '100vh', overflowY: 'auto', backgroundColor: G, color: CREAM, fontFamily: 'Inter, sans-serif', padding: '40px 32px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Utilisateurs</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>
              {activeUsers.length} compte{activeUsers.length !== 1 ? 's' : ''} actif{activeUsers.length !== 1 ? 's' : ''}
              {pendingInvites.length > 0 && ` · ${pendingInvites.length} invitation${pendingInvites.length > 1 ? 's' : ''} en cours`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/workspaces" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 8, padding: '9px 18px', color: CREAM,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              👥 Espaces clients
            </Link>
            <Link href="/configuration" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 8, padding: '9px 18px', color: CREAM,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              ⚙️ Configuration
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

        {/* Invite form */}
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
            Inviter un utilisateur par email
          </h2>
          <form onSubmit={sendInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10, marginBottom: 10 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="Email du client *"
                required
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
              <select
                value={inviteWorkspace}
                onChange={e => setInviteWorkspace(e.target.value)}
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: inviteWorkspace ? CREAM : '#7a9e8e', fontSize: 14, outline: 'none' }}
              >
                <option value="">Aucun espace</option>
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              >
                <option value="reader">Lecteur</option>
                <option value="editor">Éditeur</option>
                <option value="owner">Propriétaire</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="submit" disabled={sending} style={{
                backgroundColor: ORANGE, border: 'none', borderRadius: 8,
                padding: '10px 24px', color: 'white', fontSize: 14,
                fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.7 : 1,
              }}>
                {sending ? 'Génération…' : '+ Générer un lien d\'invitation'}
              </button>
              {inviteMsg && (
                <span style={{ fontSize: 13, color: inviteMsg.ok ? '#4caf7d' : '#e05050' }}>
                  {inviteMsg.text}
                </span>
              )}
            </div>
          </form>

          {freshLink && (
            <div style={{ marginTop: 14, backgroundColor: G3, borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#7a9e8e', flexShrink: 0 }}>Lien à envoyer :</span>
              <span style={{ fontSize: 12, color: CREAM, flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>{freshLink}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(freshLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ backgroundColor: copied ? '#4caf7d' : ORANGE, border: 'none', borderRadius: 6, padding: '6px 14px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                {copied ? '✓ Copié !' : 'Copier'}
              </button>
            </div>
          )}
        </div>

        {/* Direct create form */}
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
            Créer un compte directement
          </h2>
          <form onSubmit={createUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nom (optionnel)"
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
              <input
                type="email"
                value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email *"
                required
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
              <input
                type="password"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Mot de passe * (8 min.)"
                required
                style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="submit" disabled={creating} style={{
                backgroundColor: G4, border: 'none', borderRadius: 8,
                padding: '10px 24px', color: CREAM, fontSize: 14,
                fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.7 : 1,
              }}>
                {creating ? 'Création…' : '+ Créer le compte'}
              </button>
              {createMsg && (
                <span style={{ fontSize: 13, color: createMsg.ok ? '#4caf7d' : '#e05050' }}>{createMsg.text}</span>
              )}
            </div>
          </form>
        </div>

        {/* Invitations list */}
        {invitations.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
              Invitations
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 130px 100px 100px 100px',
                gap: 10, padding: '4px 16px',
                color: '#5a7a6a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span>Email</span><span>Espace</span><span>Statut</span><span>Envoyée</span><span>Expire / Activée</span><span></span>
              </div>
              {invitations.map(inv => (
                <div key={inv.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 160px 130px 100px 100px 100px',
                  gap: 10, alignItems: 'center',
                  backgroundColor: G5, borderRadius: 10, padding: '12px 16px',
                  border: `1px solid ${G3}`,
                }}>
                  <span style={{ fontSize: 13, color: '#7a9e8e' }}>{inv.email}</span>
                  <span style={{ fontSize: 12, color: '#5a7a6a' }}>{inv.workspaceName || '—'}</span>
                  <span>
                    <span style={{
                      backgroundColor: STATUS_BG[inv.status],
                      color: STATUS_COLOR[inv.status],
                      border: `1px solid ${STATUS_COLOR[inv.status]}44`,
                      borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                    }}>
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: '#5a7a6a' }}>{fmt(inv.createdAt)}</span>
                  <span style={{ fontSize: 11, color: '#5a7a6a' }}>
                    {inv.status === 'accepted' ? fmt(inv.acceptedAt) : fmt(inv.expiresAt)}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {inv.status !== 'accepted' && (
                      <>
                        <button
                          onClick={() => resendInvite(inv)}
                          disabled={resending === inv.id}
                          style={{
                            backgroundColor: 'transparent', border: `1px solid ${G4}`,
                            borderRadius: 6, padding: '4px 10px', color: '#7a9e8e',
                            fontSize: 11, cursor: resending === inv.id ? 'not-allowed' : 'pointer',
                            opacity: resending === inv.id ? 0.6 : 1, whiteSpace: 'nowrap',
                          }}
                        >
                          {resending === inv.id ? '…' : 'Régénérer'}
                        </button>
                        {resendLinks[inv.id] && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(resendLinks[inv.id]); }}
                            style={{
                              backgroundColor: ORANGE + '22', border: `1px solid ${ORANGE}44`,
                              borderRadius: 6, padding: '4px 10px', color: ORANGE,
                              fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            Copier lien
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active users list */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
            Comptes actifs
          </h2>
          {users.length === 0 ? (
            <div style={{ backgroundColor: G5, borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: '#7a9e8e', fontSize: 15, border: `1px solid ${G3}` }}>
              Aucun utilisateur.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 130px 72px 100px 100px 80px 80px',
                gap: 10, padding: '4px 16px',
                color: '#5a7a6a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span>Nom</span><span>Email</span><span>Rôle</span><span>Espaces</span><span>1re cnx</span><span>Dernière cnx</span><span>Cnx</span><span></span>
              </div>
              {users.map(u => (
                <div key={u.id}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 130px 72px 100px 100px 80px 80px',
                    gap: 10, alignItems: 'center',
                    backgroundColor: G5, borderRadius: expandedUser === u.id ? '10px 10px 0 0' : 10,
                    padding: '12px 16px',
                    border: `1px solid ${expandedUser === u.id ? G4 : G3}`,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name || <span style={{ color: '#5a7a6a', fontStyle: 'italic' }}>—</span>}</span>
                    <span style={{ color: '#7a9e8e', fontSize: 12 }}>{u.email}</span>
                    <span>
                      {u.id !== session?.user?.id ? (
                        <button onClick={() => toggleAdmin(u.id, u.isGlobalAdmin)} style={{
                          backgroundColor: u.isGlobalAdmin ? ORANGE + '22' : G3,
                          color: u.isGlobalAdmin ? ORANGE : '#7a9e8e',
                          border: `1px solid ${u.isGlobalAdmin ? ORANGE + '44' : G4}`,
                          borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}>
                          {u.isGlobalAdmin ? 'Admin' : 'Utilisateur'}
                        </button>
                      ) : (
                        <span style={{ backgroundColor: ORANGE + '22', color: ORANGE, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>Admin</span>
                      )}
                    </span>
                    {/* Workspace count badge */}
                    <button
                      onClick={() => toggleAccess(u.id)}
                      title="Voir les accès"
                      style={{
                        backgroundColor: (u.workspaceCount ?? 0) === 0 ? '#e0505022' : G3,
                        color: (u.workspaceCount ?? 0) === 0 ? '#e05050' : '#7a9e8e',
                        border: `1px solid ${(u.workspaceCount ?? 0) === 0 ? '#e0505044' : G4}`,
                        borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {u.workspaceCount ?? 0} {expandedUser === u.id ? '▲' : '▼'}
                    </button>
                    <span style={{ fontSize: 11, color: u.firstLoginAt ? '#7a9e8e' : '#e05050', fontStyle: u.firstLoginAt ? 'normal' : 'italic' }}>
                      {u.firstLoginAt ? fmt(u.firstLoginAt) : 'Jamais connecté'}
                    </span>
                    <span style={{ fontSize: 11, color: u.lastLoginAt ? '#7a9e8e' : '#5a7a6a' }}>{fmt(u.lastLoginAt)}</span>
                    <span style={{ fontSize: 11, color: (u.loginCount ?? 0) > 0 ? '#7a9e8e' : '#5a7a6a', textAlign: 'center' }}>{u.loginCount ?? 0}</span>
                    <div>
                      {u.id !== session?.user?.id && (
                        <button onClick={() => deleteUser(u.id, u.name || u.email)} style={{
                          backgroundColor: 'transparent', border: '1px solid #e05050',
                          borderRadius: 6, padding: '4px 10px', color: '#e05050', fontSize: 11, cursor: 'pointer',
                        }}>
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Access panel */}
                  {expandedUser === u.id && (
                    <div style={{
                      backgroundColor: '#1e3529', border: `1px solid ${G4}`, borderTop: 'none',
                      borderRadius: '0 0 10px 10px', padding: '14px 16px',
                    }}>
                      {accessLoading === u.id ? (
                        <span style={{ color: '#5a7a6a', fontSize: 12 }}>Chargement…</span>
                      ) : (accessData[u.id] ?? []).length === 0 ? (
                        <span style={{ color: '#5a7a6a', fontSize: 12, fontStyle: 'italic' }}>Aucun espace associé.</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {(accessData[u.id] ?? []).map(ws => (
                            <div key={ws.id}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Link href={`/workspaces/${ws.id}`} style={{ color: CREAM, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                                  {ws.name}
                                </Link>
                                <span style={{
                                  backgroundColor: ROLE_COLOR[ws.role] + '22',
                                  color: ROLE_COLOR[ws.role],
                                  border: `1px solid ${ROLE_COLOR[ws.role]}44`,
                                  borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                                }}>
                                  {ROLE_LABEL[ws.role] ?? ws.role}
                                </span>
                                <span style={{ color: '#5a7a6a', fontSize: 11 }}>
                                  {ws.reports.length} rapport{ws.reports.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {ws.reports.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12, borderLeft: `2px solid ${G3}` }}>
                                  {ws.reports.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <Link href={`/?report=${r.id}`} style={{ color: '#7a9e8e', fontSize: 12, textDecoration: 'none' }}>
                                        {r.prospect || <em>Sans nom</em>}
                                      </Link>
                                      {r.siteUrl && <span style={{ color: '#3a5c4e', fontSize: 11 }}>{r.siteUrl}</span>}
                                      <span style={{ color: '#3a5c4e', fontSize: 11, marginLeft: 'auto' }}>{fmt(r.createdAt)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Activité récente ── */}
        <div style={{ marginTop: 32 }}>
          <button
            onClick={loadActivity}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              backgroundColor: G5, border: `1px solid ${G3}`, borderRadius: activityOpen ? '10px 10px 0 0' : 10,
              padding: '13px 18px', cursor: 'pointer', color: CREAM,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>
              Activité récente
            </span>
            <span style={{ marginLeft: 'auto', color: '#5a7a6a', fontSize: 12 }}>{activityOpen ? '▲ Réduire' : '▼ Afficher'}</span>
          </button>

          {activityOpen && (
            <div style={{ border: `1px solid ${G3}`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              {activityLoading ? (
                <div style={{ padding: '20px 18px', color: '#5a7a6a', fontSize: 13 }}>Chargement…</div>
              ) : activity.length === 0 ? (
                <div style={{ padding: '20px 18px', color: '#5a7a6a', fontSize: 13, fontStyle: 'italic' }}>Aucune activité enregistrée.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activity.map((item, i) => (
                    <div key={item.type === 'login' ? `l-${item.userId}-${i}` : item.viewId} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 18px',
                      backgroundColor: i % 2 === 0 ? G5 : '#1e3529',
                      borderTop: i === 0 ? 'none' : `1px solid ${G3}`,
                    }}>
                      {/* Type badge */}
                      <span style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', borderRadius: 5, padding: '2px 7px',
                        backgroundColor: item.type === 'login' ? '#4caf7d22' : '#3a7a9e22',
                        color: item.type === 'login' ? '#4caf7d' : '#5ab8e8',
                        border: `1px solid ${item.type === 'login' ? '#4caf7d44' : '#5ab8e844'}`,
                        minWidth: 68, textAlign: 'center',
                      }}>
                        {item.type === 'login' ? 'Connexion' : 'Rapport'}
                      </span>
                      {/* User */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: CREAM, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.userName || item.userEmail}
                      </span>
                      {item.userName && (
                        <span style={{ fontSize: 11, color: '#5a7a6a', minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.userEmail}
                        </span>
                      )}
                      {/* Detail */}
                      {item.type === 'report_view' && (
                        <span style={{ fontSize: 12, color: '#7a9e8e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Link href={`/?report=${item.reportId}`} style={{ color: '#7a9e8e', textDecoration: 'none' }}>
                            {item.prospect || 'Sans nom'}{item.siteUrl ? ` — ${item.siteUrl}` : ''}
                          </Link>
                        </span>
                      )}
                      {item.type === 'login' && (
                        <span style={{ fontSize: 11, color: '#5a7a6a', flex: 1 }}>
                          {item.loginCount} connexion{item.loginCount > 1 ? 's' : ''} au total
                          {item.firstLogin && ` · 1re : ${fmt(item.firstLogin)}`}
                        </span>
                      )}
                      {/* Date */}
                      <span style={{ flexShrink: 0, fontSize: 11, color: '#5a7a6a', marginLeft: 'auto' }}>
                        {new Date(item.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

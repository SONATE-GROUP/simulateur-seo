'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

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

interface Member   { id: string; email: string; name: string | null; role: string; }
interface Workspace { id: string; name: string; }
interface Report   { id: string; prospect: string; siteUrl: string; sector: string; createdAt: string; }
interface User     { id: string; email: string; name: string; }

export default function WorkspaceDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers]     = useState<Member[]>([]);
  const [allUsers, setAllUsers]   = useState<User[]>([]);
  const [reports, setReports]     = useState<Report[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole]     = useState<'owner' | 'editor' | 'reader'>('reader');
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState('');
  const [addMode, setAddMode]     = useState<'existing' | 'invite'>('existing');
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<'owner' | 'editor' | 'reader'>('reader');
  const [inviting, setInviting]         = useState(false);
  const [inviteError, setInviteError]   = useState('');
  const [inviteLink, setInviteLink]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [renaming, setRenaming]   = useState(false);
  const [newName, setNewName]     = useState('');

  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  }

  const loadMembers = useCallback(() => {
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then(r => r.json())
      .then(data => { setMembers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch(`/api/workspaces/${workspaceId}`).then(r => r.json()).then(data => { setWorkspace(data); setNewName(data.name || ''); });
      loadMembers();
      fetch(`/api/workspaces/${workspaceId}/reports`).then(r => r.json()).then(data => setReports(Array.isArray(data) ? data : []));
      if (session?.user?.isGlobalAdmin) {
        fetch('/api/users').then(r => r.json()).then(data => setAllUsers(Array.isArray(data) ? data : []));
      }
    }
  }, [status, router, workspaceId, session, loadMembers]);

  const currentUserRole = members.find(m => m.id === session?.user?.id)?.role;
  const canManage = session?.user?.isGlobalAdmin || currentUserRole === 'owner';

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId) return;
    setAdding(true); setAddError('');
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addUserId, memberRole: addRole }),
    });
    if (res.ok) { setAddUserId(''); loadMembers(); }
    else { const data = await res.json(); setAddError(data.error || 'Erreur'); }
    setAdding(false);
  };

  const changeRole = async (userId: string, memberRole: string) => {
    await fetch(`/api/workspaces/${workspaceId}/members`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, memberRole }) });
    loadMembers();
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/members`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    loadMembers();
  };

  const renameWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setRenaming(true);
    const res = await fetch(`/api/workspaces/${workspaceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
    if (res.ok) setWorkspace(w => w ? { ...w, name: newName.trim() } : w);
    setRenaming(false);
  };

  const nonMembers = allUsers.filter(u => !members.find(m => m.id === u.id));

  const createInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.includes('@')) { setInviteError('Email invalide'); return; }
    setInviting(true); setInviteError(''); setInviteLink(null);
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, workspaceId, workspaceRole: inviteRole }),
    });
    const data = await res.json();
    if (res.ok) { setInviteLink(data.inviteUrl); setInviteEmail(''); }
    else { setInviteError(data.error || 'Erreur lors de la création'); }
    setInviting(false);
  };

  if (loading) return <div style={{ color: '#7a9e8e', fontSize: 14 }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{workspace?.name ?? 'Espace client'}</h1>
          <p style={{ color: '#7a9e8e', fontSize: 14 }}>{members.length} membre{members.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/workspaces" style={{ backgroundColor: 'transparent', border: `1px solid ${G3}`, borderRadius: 8, padding: '8px 16px', color: CREAM, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          ← Espaces clients
        </Link>
      </div>

      {canManage && (
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 16, border: `1px solid ${G3}` }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>Renommer l&apos;espace</h2>
          <form onSubmit={renameWorkspace} style={{ display: 'flex', gap: 10 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }} />
            <button type="submit" disabled={renaming || !newName.trim()} style={{ backgroundColor: G4, border: 'none', borderRadius: 8, padding: '10px 20px', color: CREAM, fontSize: 14, fontWeight: 600, cursor: renaming ? 'not-allowed' : 'pointer', opacity: renaming ? 0.7 : 1 }}>
              {renaming ? '…' : 'Renommer'}
            </button>
          </form>
        </div>
      )}

      {canManage && (
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${G3}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e', margin: 0 }}>Ajouter un membre</h2>
            <div style={{ display: 'flex', backgroundColor: G3, borderRadius: 8, padding: 3, gap: 2 }}>
              {(['existing', 'invite'] as const).map(mode => (
                <button key={mode} onClick={() => { setAddMode(mode); setAddError(''); setInviteError(''); setInviteLink(null); }}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'background .15s',
                    backgroundColor: addMode === mode ? ORANGE : 'transparent',
                    color: addMode === mode ? 'white' : '#7a9e8e',
                  }}>
                  {mode === 'existing' ? 'Utilisateur existant' : 'Inviter par email'}
                </button>
              ))}
            </div>
          </div>

          {addMode === 'existing' ? (
            <form onSubmit={addMember} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <select value={addUserId} onChange={e => setAddUserId(e.target.value)} style={{ flex: 1, backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 12px', color: addUserId ? CREAM : '#5a7a6a', fontSize: 14, outline: 'none' }}>
                  <option value="">Sélectionner un utilisateur…</option>
                  {nonMembers.map(u => <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>)}
                </select>
                <select value={addRole} onChange={e => setAddRole(e.target.value as 'owner' | 'editor' | 'reader')} style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 12px', color: CREAM, fontSize: 14, outline: 'none' }}>
                  <option value="reader">Lecteur</option>
                  <option value="editor">Éditeur</option>
                  <option value="owner">Propriétaire</option>
                </select>
                <button type="submit" disabled={adding || !addUserId} style={{ backgroundColor: ORANGE, border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', fontSize: 14, fontWeight: 700, cursor: (adding || !addUserId) ? 'not-allowed' : 'pointer', opacity: (adding || !addUserId) ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {adding ? '…' : 'Ajouter'}
                </button>
              </div>
              {addError && <div style={{ color: '#e05050', fontSize: 13 }}>{addError}</div>}
            </form>
          ) : (
            <form onSubmit={createInvitation} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="email" placeholder="email@exemple.com" value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteLink(null); }}
                  style={{ flex: 1, backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none' }}
                />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'owner' | 'editor' | 'reader')} style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 12px', color: CREAM, fontSize: 14, outline: 'none' }}>
                  <option value="reader">Lecteur</option>
                  <option value="editor">Éditeur</option>
                  <option value="owner">Propriétaire</option>
                </select>
                <button type="submit" disabled={inviting || !inviteEmail} style={{ backgroundColor: ORANGE, border: 'none', borderRadius: 8, padding: '10px 20px', color: 'white', fontSize: 14, fontWeight: 700, cursor: (inviting || !inviteEmail) ? 'not-allowed' : 'pointer', opacity: (inviting || !inviteEmail) ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {inviting ? '…' : 'Générer le lien'}
                </button>
              </div>
              {inviteError && <div style={{ color: '#e05050', fontSize: 13 }}>{inviteError}</div>}
              {inviteLink && (
                <div style={{ backgroundColor: G3, borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#7a9e8e', fontSize: 12, flexShrink: 0 }}>Lien d&apos;invitation :</span>
                  <code style={{ flex: 1, color: ORANGE, fontSize: 12, wordBreak: 'break-all' }}>{inviteLink}</code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)}
                    style={{ backgroundColor: G4, border: 'none', borderRadius: 6, padding: '5px 10px', color: CREAM, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Copier
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>Membres — {members.length}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        {members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: G5, borderRadius: 10, padding: '14px 18px', border: `1px solid ${G3}` }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name || m.email}</div>
              {m.name && <div style={{ color: '#7a9e8e', fontSize: 12, marginTop: 2 }}>{m.email}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {canManage && m.id !== session?.user?.id ? (
                <select value={m.role} onChange={e => changeRole(m.id, e.target.value)} style={{ backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 6, padding: '4px 10px', color: CREAM, fontSize: 12, outline: 'none' }}>
                  <option value="reader">Lecteur</option>
                  <option value="editor">Éditeur</option>
                  <option value="owner">Propriétaire</option>
                </select>
              ) : (
                <span style={{ backgroundColor: m.role === 'owner' ? ORANGE + '22' : G3, color: m.role === 'owner' ? ORANGE : '#7a9e8e', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              )}
              {canManage && m.id !== session?.user?.id && (
                <button onClick={() => removeMember(m.id)} style={{ backgroundColor: 'transparent', border: '1px solid #e05050', borderRadius: 6, padding: '4px 10px', color: '#e05050', fontSize: 12, cursor: 'pointer' }}>Retirer</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a9e8e' }}>Rapports — {reports.length}</h2>
      {reports.length === 0 ? (
        <div style={{ backgroundColor: G5, borderRadius: 10, padding: '20px 18px', color: '#5a7a6a', fontSize: 13, fontStyle: 'italic', border: `1px solid ${G3}` }}>Aucun rapport rattaché à cet espace.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 60px', gap: 10, padding: '4px 16px', color: '#5a7a6a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Prospect</span><span>Site</span><span>Secteur</span><span>Date</span><span></span>
          </div>
          {reports.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 60px', gap: 10, alignItems: 'center', backgroundColor: G5, borderRadius: 8, padding: '11px 16px', border: `1px solid ${G3}` }}>
              <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prospect || <span style={{ color: '#5a7a6a', fontStyle: 'italic' }}>Sans nom</span>}</span>
              <span style={{ color: '#7a9e8e', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.siteUrl || '—'}</span>
              <span style={{ color: '#7a9e8e', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sector || '—'}</span>
              <span style={{ color: '#5a7a6a', fontSize: 11 }}>{fmtDate(r.createdAt)}</span>
              <a href={`/?report=${r.id}`} style={{ backgroundColor: G4, color: CREAM, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, textDecoration: 'none', textAlign: 'center', display: 'block' }}>Ouvrir</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/session';
import type { ReportSummary } from '@/lib/reports';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

type Report = ReportSummary;

function fmtDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '-';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${totalSeconds} s`;
}

/* Un compte du portail (ex-« espace client »). */
interface Account {
  id: string;
  name: string;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function RapportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reports, setReports]       = useState<Report[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading]       = useState(true);

  const [moving, setMoving]     = useState<Report | null>(null);
  const [targetAccount, setTargetAccount] = useState<string>('');
  const [moveReason, setMoveReason] = useState('');
  const [saving, setSaving]     = useState(false);
  const [moveError, setMoveError] = useState('');

  // Rattacher un rapport à un autre compte : admins de l'outil (move_report_account).
  const canMove = Boolean(session?.user?.isAdmin);
  // Supprimer : l'auteur ou un admin (RLS).
  const canDelete = (r: Report) => Boolean(session?.user?.isAdmin || (r.createdBy && r.createdBy === session?.user?.id));

  const [search, setSearch]     = useState('');
  const [filterWs, setFilterWs] = useState('__all__');
  const [sortKey, setSortKey]   = useState<'date_desc' | 'date_asc' | 'az' | 'za'>('date_desc');
  const isFiltered = search !== '' || filterWs !== '__all__' || sortKey !== 'date_desc';
  const resetFilters = () => { setSearch(''); setFilterWs('__all__'); setSortKey('date_desc'); };

  const visibleReports = [...reports]
    .filter(r => {
      if (search && !r.prospect.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterWs !== '__all__' && r.accountId !== filterWs) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'date_desc') return b.createdAt.localeCompare(a.createdAt);
      if (sortKey === 'date_asc')  return a.createdAt.localeCompare(b.createdAt);
      if (sortKey === 'az') return (a.prospect || '').localeCompare(b.prospect || '', 'fr');
      if (sortKey === 'za') return (b.prospect || '').localeCompare(a.prospect || '', 'fr');
      return 0;
    });

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/reports').then(r => r.json()),
        fetch('/api/accounts').then(r => r.json()),
      ]).then(([rep, acc]) => {
        setReports(Array.isArray(rep) ? rep : []);
        setAccounts(Array.isArray(acc) ? acc : []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [status, router]);

  const deleteReport = async (id: string, prospect: string) => {
    if (!confirm(`Supprimer le rapport "${prospect || 'Sans nom'}" ?`)) return;
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.ok) setReports(prev => prev.filter(r => r.id !== id));
    else alert((await res.json().catch(() => ({}))).error || 'Suppression impossible');
  };

  const openMoveModal = (report: Report) => {
    setMoving(report);
    setTargetAccount(report.accountId);
    setMoveReason('');
    setMoveError('');
  };

  const confirmMove = async () => {
    if (!moving) return;
    setSaving(true);
    setMoveError('');
    const res = await fetch(`/api/reports/${moving.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: targetAccount, reason: moveReason }),
    });
    const data = await res.json();
    if (res.ok) {
      const acc = accounts.find(a => a.id === targetAccount);
      setReports(prev => prev.map(r =>
        r.id === moving.id
          ? { ...r, accountId: targetAccount, accountName: acc?.name ?? null }
          : r
      ));
      setMoving(null);
    } else {
      setMoveError(data.error || 'Erreur');
    }
    setSaving(false);
  };

  const moveBlocked = saving || !moving || targetAccount === moving.accountId || moveReason.trim().length < 10;

  if (loading) {
    return <div style={{ color: '#7a9e8e', fontSize: 14 }}>Chargement…</div>;
  }

  const cols = canMove
    ? '1fr 1fr 140px 48px 90px 80px 130px 150px 80px 80px 80px'
    : '1fr 1fr 140px 48px 90px 80px 130px 150px 100px 80px';

  return (
    <div style={{ maxWidth: 1080 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Rapports enregistrés</h1>
        <p style={{ color: '#7a9e8e', fontSize: 14 }}>
          {reports.length} simulation{reports.length !== 1 ? 's' : ''} sauvegardée{reports.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      {reports.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un prospect…"
            style={{ flex: '1 1 180px', minWidth: 0, backgroundColor: G5, border: `1px solid ${G3}`, borderRadius: 7, padding: '8px 12px', color: CREAM, fontSize: 13, outline: 'none' }}
          />
          <select value={filterWs} onChange={e => setFilterWs(e.target.value)} style={{ flex: '0 1 180px', backgroundColor: G5, border: `1px solid ${filterWs !== '__all__' ? ORANGE : G3}`, borderRadius: 7, padding: '8px 10px', color: filterWs !== '__all__' ? CREAM : '#7a9e8e', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
            <option value="__all__">Tous les comptes</option>
            {accounts.filter(a => reports.some(r => r.accountId === a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)} style={{ flex: '0 1 180px', backgroundColor: G5, border: `1px solid ${sortKey !== 'date_desc' ? ORANGE : G3}`, borderRadius: 7, padding: '8px 10px', color: CREAM, fontSize: 13, outline: 'none', cursor: 'pointer' }}>
            <option value="date_desc">Plus récent d'abord</option>
            <option value="date_asc">Plus ancien d'abord</option>
            <option value="az">Nom A → Z</option>
            <option value="za">Nom Z → A</option>
          </select>
          {isFiltered && (
            <button onClick={resetFilters} style={{ backgroundColor: 'transparent', border: `1px solid ${G3}`, borderRadius: 7, padding: '8px 14px', color: '#7a9e8e', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {reports.length === 0 ? (
        <div style={{ backgroundColor: G5, borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: '#7a9e8e', fontSize: 15 }}>
          Aucun rapport enregistré.<br />
          Générez un lien depuis le simulateur pour sauvegarder une simulation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 16px', color: '#5a7a6a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Prospect</span><span>Site</span><span>Compte</span>
            <span title="Vues">Vues</span><span title="Temps passé total">Temps passé</span><span title="Nombre d'interactions (clics, saisies)">Interactions</span>
            <span>Dernière consult.</span><span>Création</span>
            {canMove && <span></span>}<span></span><span></span>
          </div>

          {visibleReports.length === 0 && (
            <div style={{ color: '#5a7a6a', fontSize: 13, padding: '24px 16px', textAlign: 'center' }}>
              Aucun rapport ne correspond aux filtres.
            </div>
          )}

          {visibleReports.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', backgroundColor: G5, borderRadius: 10, padding: '14px 16px' }}>
              <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.prospect || <span style={{ color: '#5a7a6a', fontStyle: 'italic' }}>Sans nom</span>}
              </span>
              <span style={{ color: '#7a9e8e', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.siteUrl || '-'}</span>
              <span style={{ fontSize: 12 }}>
                {r.accountName
                  ? <span style={{ backgroundColor: G3, color: '#7a9e8e', borderRadius: 5, padding: '2px 8px', fontSize: 11, border: `1px solid ${G4}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>{r.accountName}</span>
                  : <span style={{ color: '#3a5c4e', fontSize: 11, fontStyle: 'italic' }}>-</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: r.viewCount > 0 ? '#4caf7d' : '#3a5c4e' }} title={r.viewCount > 0 ? `${r.viewCount} consultation${r.viewCount > 1 ? 's' : ''}` : 'Jamais consulté'}>
                {r.viewCount > 0 ? r.viewCount : '-'}
              </span>
              <span style={{ fontSize: 11, color: r.totalTimeSeconds > 0 ? '#7a9e8e' : '#3a5c4e' }}>
                {fmtDuration(r.totalTimeSeconds)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', color: r.interactionCount > 0 ? '#7a9e8e' : '#3a5c4e' }}>
                {r.interactionCount > 0 ? r.interactionCount : '-'}
              </span>
              <span style={{ fontSize: 11 }}>
                {r.lastViewedAt ? (
                  <span title={r.lastViewerEmail || ''}>
                    <span style={{ color: '#7a9e8e', display: 'block' }}>{fmtDate(r.lastViewedAt)}</span>
                    <span style={{ color: '#5a7a6a', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 120 }}>{r.lastViewerEmail || ''}</span>
                  </span>
                ) : <span style={{ color: '#3a5c4e', fontStyle: 'italic' }}>Jamais consulté</span>}
              </span>
              <span style={{ color: '#5a7a6a', fontSize: 11 }} title={r.authorEmail ? `par ${r.authorEmail}` : ''}>{fmtDate(r.createdAt)}</span>
              {canMove && (
                <button onClick={() => openMoveModal(r)} style={{ backgroundColor: 'transparent', border: `1px solid ${G4}`, borderRadius: 6, padding: '5px 10px', color: '#7a9e8e', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Déplacer
                </button>
              )}
              <Link href={`/?report=${r.id}`} style={{ backgroundColor: G4, color: CREAM, padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                Ouvrir
              </Link>
              {canDelete(r) ? (
                <button onClick={() => deleteReport(r.id, r.prospect)} style={{ backgroundColor: 'transparent', border: '1px solid #e05050', borderRadius: 6, padding: '6px 10px', color: '#e05050', fontSize: 12, cursor: 'pointer', width: '100%' }}>
                  Supprimer
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
      )}

      {/* Move modal */}
      {moving && (
        <div onClick={e => { if (e.target === e.currentTarget) setMoving(null); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: G5, borderRadius: 14, padding: '28px 28px 24px', width: '100%', maxWidth: 420, border: `1px solid ${G3}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: CREAM, marginBottom: 6 }}>Déplacer le rapport</h2>
            <p style={{ color: '#7a9e8e', fontSize: 13, marginBottom: 20 }}>
              <strong style={{ color: CREAM }}>{moving.prospect || 'Sans nom'}</strong>
              {moving.accountName && <> · actuellement sur <strong style={{ color: '#7a9e8e' }}>{moving.accountName}</strong></>}
            </p>
            <label style={{ display: 'block', color: '#7a9e8e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Compte cible</label>
            <select value={targetAccount} onChange={e => setTargetAccount(e.target.value)} style={{ width: '100%', backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', marginBottom: 14 }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label style={{ display: 'block', color: '#7a9e8e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Motif (10 caractères au moins)</label>
            <input value={moveReason} onChange={e => setMoveReason(e.target.value)} placeholder="Ex : le prospect a désormais son compte" style={{ width: '100%', boxSizing: 'border-box', backgroundColor: G3, border: `1px solid ${G4}`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', marginBottom: 20 }} />
            {moveError && <p style={{ color: '#e05050', fontSize: 13, marginBottom: 14 }}>{moveError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setMoving(null)} style={{ backgroundColor: 'transparent', border: `1px solid ${G4}`, borderRadius: 8, padding: '9px 20px', color: '#7a9e8e', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button onClick={confirmMove} disabled={moveBlocked} style={{ backgroundColor: ORANGE, border: 'none', borderRadius: 8, padding: '9px 20px', color: 'white', fontSize: 13, fontWeight: 700, cursor: moveBlocked ? 'not-allowed' : 'pointer', opacity: moveBlocked ? 0.6 : 1 }}>
                {saving ? 'Déplacement…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

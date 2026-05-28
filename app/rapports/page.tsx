'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Report {
  id: string;
  prospect: string;
  siteUrl: string;
  sector: string;
  createdAt: string;
  workspaceId: string | null;
  workspaceName: string | null;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function RapportsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch('/api/reports')
        .then(r => r.json())
        .then(data => { setReports(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#1a2e25', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5f0e8', fontFamily: 'Inter, sans-serif' }}>
        Chargement…
      </main>
    );
  }

  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#1a2e25',
      color: '#f5f0e8',
      fontFamily: "'Inter', sans-serif",
      padding: '40px 32px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Rapports enregistrés</h1>
            <p style={{ color: '#7a9e8e', fontSize: 14 }}>{reports.length} simulation{reports.length !== 1 ? 's' : ''} sauvegardée{reports.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/workspaces" style={{
              backgroundColor: 'transparent', border: '1px solid #2d4a3e',
              color: '#f5f0e8', padding: '9px 18px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              👥 Espaces
            </Link>
            <Link href="/" style={{
              backgroundColor: '#e8571a', color: '#fff',
              padding: '9px 18px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}>
              ← Nouveau simulateur
            </Link>
          </div>
        </div>

        {/* Table */}
        {reports.length === 0 ? (
          <div style={{
            backgroundColor: '#233d30', borderRadius: 12, padding: '48px 32px',
            textAlign: 'center', color: '#7a9e8e', fontSize: 15,
          }}>
            Aucun rapport enregistré.<br />
            Générez un lien depuis le simulateur pour sauvegarder une simulation.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr 160px 100px',
              gap: 12, padding: '8px 16px',
              color: '#5a7a6a', fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              <span>Prospect</span>
              <span>Site</span>
              <span>Secteur</span>
              <span>Espace</span>
              <span>Date</span>
              <span></span>
            </div>

            {reports.map(r => (
              <div key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr 160px 100px',
                gap: 12, alignItems: 'center',
                backgroundColor: '#233d30', borderRadius: 10, padding: '14px 16px',
              }}>
                <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.prospect || <span style={{ color: '#5a7a6a', fontStyle: 'italic' }}>Sans nom</span>}
                </span>
                <span style={{ color: '#7a9e8e', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.siteUrl || '—'}
                </span>
                <span style={{ color: '#7a9e8e', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.sector || '—'}
                </span>
                <span style={{ color: '#7a9e8e', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.workspaceName || <span style={{ color: '#3a5c4e' }}>—</span>}
                </span>
                <span style={{ color: '#5a7a6a', fontSize: 12 }}>
                  {fmtDate(r.createdAt)}
                </span>
                <Link
                  href={`/?report=${r.id}`}
                  style={{
                    backgroundColor: '#3a5c4e', color: '#f5f0e8',
                    padding: '6px 14px', borderRadius: 6, fontSize: 12,
                    fontWeight: 600, textDecoration: 'none',
                    textAlign: 'center', display: 'block',
                  }}
                >
                  Ouvrir
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

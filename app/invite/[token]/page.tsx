'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

const G    = '#1a2e25';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

interface InviteInfo {
  email: string;
  workspaceName?: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [info, setInfo]       = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [name, setName]       = useState('');
  const [password, setPassword]       = useState('');
  const [password2, setPassword2]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitErr, setSubmitErr]     = useState('');
  const [done, setDone]               = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) setLoadErr(data.error || 'Lien invalide');
        else setInfo({ email: data.email, workspaceName: data.workspaceName });
      })
      .catch(() => setLoadErr('Erreur réseau'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr('');
    if (password.length < 8) { setSubmitErr('Le mot de passe doit faire au moins 8 caractères.'); return; }
    if (password !== password2) { setSubmitErr('Les mots de passe ne correspondent pas.'); return; }

    setSubmitting(true);
    const res = await fetch(`/api/invitations/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitErr(data.error || 'Erreur');
      setSubmitting(false);
      return;
    }

    setDone(true);
    // Auto-login then redirect
    const result = await signIn('credentials', {
      email: info!.email,
      password,
      redirect: false,
    });
    if (result?.ok) router.push('/');
    else router.push('/login');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    backgroundColor: G3, border: `1px solid ${G4}`,
    borderRadius: 8, padding: '12px 14px',
    color: CREAM, fontSize: 14, outline: 'none',
  };

  return (
    <main style={{
      minHeight: '100vh', backgroundColor: G,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        backgroundColor: G5, borderRadius: 16,
        padding: '36px 32px', border: `1px solid ${G3}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: CREAM }}>Simulateur SEO</span>
        </div>

        {loading && (
          <p style={{ color: '#7a9e8e', textAlign: 'center' }}>Vérification du lien…</p>
        )}

        {!loading && loadErr && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#e05050', fontSize: 15, marginBottom: 20 }}>{loadErr}</p>
            <a href="/login" style={{ color: ORANGE, fontSize: 14 }}>Aller à la connexion →</a>
          </div>
        )}

        {!loading && !loadErr && !done && info && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: CREAM, marginBottom: 6, textAlign: 'center' }}>
              Activez votre compte
            </h1>
            <p style={{ color: '#7a9e8e', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
              {info.email}
            </p>
            {info.workspaceName && (
              <p style={{ color: '#5a7a6a', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
                Espace : <strong style={{ color: '#7a9e8e' }}>{info.workspaceName}</strong>
              </p>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Votre nom (optionnel)"
                style={inputStyle}
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Choisissez un mot de passe (8 min.)"
                required
                style={inputStyle}
              />
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                placeholder="Confirmez le mot de passe"
                required
                style={inputStyle}
              />
              {submitErr && (
                <p style={{ color: '#e05050', fontSize: 13, margin: 0 }}>{submitErr}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  backgroundColor: ORANGE, border: 'none', borderRadius: 8,
                  padding: '13px 0', color: 'white', fontSize: 15,
                  fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1, marginTop: 4,
                }}
              >
                {submitting ? 'Activation…' : 'Activer mon compte'}
              </button>
            </form>
          </>
        )}

        {done && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#7a9e8e', fontSize: 15 }}>Compte activé ! Connexion en cours…</p>
          </div>
        )}
      </div>
    </main>
  );
}

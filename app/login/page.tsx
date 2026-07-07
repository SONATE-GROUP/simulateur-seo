'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const G    = '#1a2e25';
const G2   = '#142218';
const G3   = '#2d4a3e';
const ORANGE = '#e8571a';
const CREAM  = '#f5f0e8';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Forgot password
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) { setError('Email ou mot de passe incorrect'); return; }
    router.push('/');
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(''); setForgotLoading(true);
    const res  = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || 'Erreur'); return; }
    setResetLink(data.resetUrl ?? null);
  };

  const copyLink = () => {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`,
    borderRadius: 8, padding: '10px 14px', color: CREAM,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>

      {/* Top-left logo */}
      <div style={{ padding: '20px 28px', flexShrink: 0 }}>
        <div style={{ position: 'relative', width: 200, height: 52 }}>
          <div style={{
            backgroundImage: 'url(/logo-sonate.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '215px auto',
            backgroundPosition: '-4px -10px',
            width: '100%', height: '100%',
          }} role="img" aria-label="Sonate" />
          <span style={{
            position: 'absolute', top: 1, right: 0,
            fontSize: 7, fontWeight: 800, letterSpacing: '0.15em',
            color: ORANGE, lineHeight: 1,
          }}>Accompagnement SEO/GEO</span>
        </div>
      </div>

      {/* Centered card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 380, backgroundColor: G2, borderRadius: 16, padding: '40px 36px', border: `1px solid ${G3}` }}>

          {!showForgot ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ color: ORANGE, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>Accompagnement SEO</div>
                <div style={{ color: CREAM, fontSize: 18, fontWeight: 700, marginTop: 4 }}>Connexion</div>
              </div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                    placeholder="vous@exemple.com" style={inputStyle} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ color: '#7a9e8e', fontSize: 12 }}>Mot de passe</label>
                    <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                      style={{ background: 'none', border: 'none', color: '#5a7a6a', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="••••••••" style={inputStyle} />
                </div>

                {error && <div style={{ color: '#e05050', fontSize: 13, textAlign: 'center' }}>{error}</div>}

                <button type="submit" disabled={loading}
                  style={{ backgroundColor: ORANGE, border: 'none', borderRadius: 8, padding: '11px', color: 'white', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
                  {loading ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: 20, color: '#5a7a6a', fontSize: 13 }}>
                Pas encore de compte ?{' '}
                <Link href="/register" style={{ color: ORANGE, textDecoration: 'none', fontWeight: 600 }}>Créer un compte</Link>
              </p>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ color: ORANGE, fontSize: 20, fontWeight: 800 }}>Accompagnement SEO</div>
                <div style={{ color: CREAM, fontSize: 17, fontWeight: 700, marginTop: 4 }}>Mot de passe oublié</div>
              </div>

              {!resetLink ? (
                <form onSubmit={submitForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Votre adresse email</label>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      required autoFocus placeholder="vous@exemple.com" style={inputStyle} />
                  </div>
                  {forgotError && <p style={{ color: '#e05050', fontSize: 13, margin: 0 }}>{forgotError}</p>}
                  <button type="submit" disabled={forgotLoading} style={{
                    backgroundColor: ORANGE, border: 'none', borderRadius: 8,
                    padding: '11px', color: 'white', fontSize: 14, fontWeight: 700,
                    cursor: forgotLoading ? 'not-allowed' : 'pointer', opacity: forgotLoading ? 0.7 : 1,
                  }}>
                    {forgotLoading ? 'Génération…' : 'Générer un lien de réinitialisation'}
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ color: '#7a9e8e', fontSize: 13, margin: 0, textAlign: 'center' }}>
                    Copiez ce lien et transmettez-le à l&apos;administrateur ou utilisez-le directement.
                    Il expire dans <strong style={{ color: CREAM }}>24 heures</strong>.
                  </p>
                  <div style={{ backgroundColor: G3, borderRadius: 8, padding: '10px 12px', wordBreak: 'break-all', fontSize: 11, color: CREAM, fontFamily: 'monospace' }}>
                    {resetLink}
                  </div>
                  <button onClick={copyLink} style={{
                    backgroundColor: resetCopied ? '#4caf7d' : ORANGE, border: 'none', borderRadius: 8,
                    padding: '11px', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {resetCopied ? '✓ Copié !' : 'Copier le lien'}
                  </button>
                </div>
              )}

              <button onClick={() => { setShowForgot(false); setResetLink(null); setForgotError(''); }}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#5a7a6a', fontSize: 12, cursor: 'pointer', marginTop: 18, textAlign: 'center', textDecoration: 'underline' }}>
                ← Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

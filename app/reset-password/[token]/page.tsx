'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

const G    = '#1a2e25';
const G2   = '#142218';
const G3   = '#2d4a3e';
const ORANGE = '#e8571a';
const CREAM  = '#f5f0e8';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [checking, setChecking]   = useState(true);
  const [tokenErr, setTokenErr]   = useState('');
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveErr, setSaveErr]     = useState('');
  const [done, setDone]           = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset/${token}`)
      .then(async r => {
        if (!r.ok) setTokenErr((await r.json()).error || 'Lien invalide');
      })
      .catch(() => setTokenErr('Erreur réseau'))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr('');
    if (password.length < 8) { setSaveErr('8 caractères minimum.'); return; }
    if (password !== password2) { setSaveErr('Les mots de passe ne correspondent pas.'); return; }
    setSaving(true);
    const res  = await fetch(`/api/auth/reset/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) { setSaveErr(data.error || 'Erreur'); setSaving(false); return; }
    setDone(true);
    // Try auto-login — if it fails, redirect to login page
    await signIn('credentials', { password, redirect: false }).catch(() => {});
    setTimeout(() => router.push('/login'), 1500);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    backgroundColor: G3, border: `1px solid #3a5c4e`,
    borderRadius: 8, padding: '10px 14px',
    color: CREAM, fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 380, backgroundColor: G2, borderRadius: 16, padding: '40px 36px', border: `1px solid ${G3}` }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: ORANGE, fontSize: 20, fontWeight: 800 }}>Accompagnement SEO</div>
          <div style={{ color: CREAM, fontSize: 17, fontWeight: 700, marginTop: 4 }}>Nouveau mot de passe</div>
        </div>

        {checking && <p style={{ color: '#7a9e8e', textAlign: 'center', fontSize: 13 }}>Vérification…</p>}

        {!checking && tokenErr && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#e05050', fontSize: 14, marginBottom: 20 }}>{tokenErr}</p>
            <a href="/login" style={{ color: ORANGE, fontSize: 13, textDecoration: 'none' }}>← Retour à la connexion</a>
          </div>
        )}

        {!checking && !tokenErr && !done && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Nouveau mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="8 caractères minimum" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Confirmer</label>
              <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required placeholder="••••••••" style={inputStyle} />
            </div>
            {saveErr && <p style={{ color: '#e05050', fontSize: 13, margin: 0 }}>{saveErr}</p>}
            <button type="submit" disabled={saving} style={{
              backgroundColor: ORANGE, border: 'none', borderRadius: 8,
              padding: '11px', color: 'white', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginTop: 4,
            }}>
              {saving ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        )}

        {done && (
          <p style={{ color: '#4caf7d', textAlign: 'center', fontSize: 14 }}>
            Mot de passe mis à jour. Redirection…
          </p>
        )}
      </div>
    </div>
  );
}

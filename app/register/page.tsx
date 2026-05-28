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

export default function RegisterPage() {
  const router = useRouter();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Erreur'); setLoading(false); return; }

    // Auto-login after registration
    await signIn('credentials', { email, password, redirect: false });
    router.push('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 380, backgroundColor: G2, borderRadius: 16, padding: '40px 36px', border: `1px solid ${G3}` }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ color: ORANGE, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>SEO</div>
          <div style={{ color: CREAM, fontSize: 18, fontWeight: 700, marginTop: 4 }}>Créer un compte</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Prénom / Nom</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="Marie Dupont"
              style={{ width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="vous@exemple.com"
              style={{ width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Mot de passe <span style={{ color: '#5a7a6a' }}>(8 car. min.)</span></label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              placeholder="••••••••"
              style={{ width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {error && <div style={{ color: '#e05050', fontSize: 13, textAlign: 'center' }}>{error}</div>}

          <button type="submit" disabled={loading}
            style={{ backgroundColor: ORANGE, border: 'none', borderRadius: 8, padding: '11px', color: 'white', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, color: '#5a7a6a', fontSize: 13 }}>
          Déjà un compte ?{' '}
          <Link href="/login" style={{ color: ORANGE, textDecoration: 'none', fontWeight: 600 }}>Se connecter</Link>
        </p>
      </div>
    </div>
  );
}

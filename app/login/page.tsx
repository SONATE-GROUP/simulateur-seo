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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) { setError('Email ou mot de passe incorrect'); return; }
    router.push('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 380, backgroundColor: G2, borderRadius: 16, padding: '40px 36px', border: `1px solid ${G3}` }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ color: ORANGE, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>SEO</div>
          <div style={{ color: CREAM, fontSize: 18, fontWeight: 700, marginTop: 4 }}>Connexion</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              placeholder="vous@exemple.com"
              style={{ width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#7a9e8e', fontSize: 12, display: 'block', marginBottom: 6 }}>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width: '100%', backgroundColor: G3, border: `1px solid #3a5c4e`, borderRadius: 8, padding: '10px 14px', color: CREAM, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
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
      </div>
    </div>
  );
}

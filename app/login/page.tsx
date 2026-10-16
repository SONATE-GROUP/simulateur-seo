'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const G    = '#1a2e25';
const G2   = '#142218';
const G3   = '#2d4a3e';
const ORANGE = '#e8571a';
const CREAM  = '#f5f0e8';
const MUTED  = '#7a9e8e';

/* Plus de mot de passe dans le simulateur : on entre par Ma Sonate, qui ouvre
   l'outil avec un ticket signé (route /sso). Cette page dit seulement où aller,
   et pourquoi une ouverture a échoué. */

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://ma.sonate.group';

const SSO_MESSAGES: Record<string, string> = {
  absent:       'Le lien d’ouverture est incomplet. Rouvrez le simulateur depuis Ma Sonate.',
  expire:       'Le lien d’ouverture a expiré (il vaut une minute). Rouvrez le simulateur depuis Ma Sonate.',
  invalide:     'Le lien d’ouverture n’est pas valide. Rouvrez le simulateur depuis Ma Sonate.',
  rejeu:        'Ce lien d’ouverture a déjà servi. Rouvrez le simulateur depuis Ma Sonate.',
  droit:        'Le Simulateur SEO commercial est réservé à l’équipe Sonate.',
  inconnu:      'Votre compte n’a pas été retrouvé. Contactez un administrateur de Ma Sonate.',
  indisponible: 'Le simulateur est momentanément indisponible. Réessayez dans quelques instants.',
};

function SsoMessage() {
  const motif = useSearchParams().get('sso');
  const message = motif ? SSO_MESSAGES[motif] ?? SSO_MESSAGES.invalide : null;
  if (!message) return null;
  return (
    <div style={{
      backgroundColor: '#3a1a1a', border: '1px solid #e0505055', borderRadius: 8,
      padding: '10px 14px', color: '#f0b0b0', fontSize: 13, marginBottom: 20, lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

export default function LoginPage() {
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
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ color: ORANGE, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>Simulateur SEO commercial</div>
            <div style={{ color: CREAM, fontSize: 18, fontWeight: 700, marginTop: 4 }}>Connexion</div>
          </div>

          <Suspense fallback={null}>
            <SsoMessage />
          </Suspense>

          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginBottom: 24, textAlign: 'center' }}>
            Le simulateur s’ouvre depuis Ma Sonate, avec votre compte de l’équipe.
          </p>

          <a
            href={PORTAL_URL}
            style={{
              display: 'block', textAlign: 'center', backgroundColor: ORANGE,
              borderRadius: 8, padding: '12px', color: 'white',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}
          >
            Se connecter avec Ma Sonate
          </a>
        </div>
      </div>
    </div>
  );
}

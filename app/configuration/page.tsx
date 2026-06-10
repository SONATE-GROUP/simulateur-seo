'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const G    = '#1a2e25';
const G2   = '#1e3528';
const G3   = '#2d4a3e';
const G4   = '#3a5c4e';
const G5   = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';
const GREEN  = '#4caf7d';
const MUTED  = '#7a9e8e';

/* ─── Données des matrices (future: chargées depuis DB / API) ── */

const CTR_TABLE = [
  { position: 1,  ctr: 29.6 },
  { position: 2,  ctr: 16.8 },
  { position: 3,  ctr: 12.0 },
  { position: 4,  ctr: 9.4  },
  { position: 5,  ctr: 7.3  },
  { position: 6,  ctr: 5.9  },
  { position: 7,  ctr: 4.9  },
  { position: 8,  ctr: 4.3  },
  { position: 9,  ctr: 3.7  },
  { position: 10, ctr: 3.4  },
  { position: 11, ctr: 0    },
];

const PROX_FACTORS = [
  { value: 1, label: 'Exact',       factor: 1.0, description: 'Mot-clé correspond exactement à l\'intention de la page' },
  { value: 2, label: 'Très proche', factor: 1.5, description: 'Mot-clé très proche de l\'intention, légèrement décalé' },
  { value: 3, label: 'Thématique',  factor: 3.0, description: 'Mot-clé dans le même univers sémantique, plus difficile à ranker' },
];

const RAMP_UP_DATA = [
  { mois: 'M1',  pct: 2,  description: 'Crawl & indexation' },
  { mois: 'M2',  pct: 3,  description: 'Premiers signaux' },
  { mois: 'M3',  pct: 6,  description: 'Début d\'indexation' },
  { mois: 'M4',  pct: 20, description: 'Premiers résultats visibles' },
  { mois: 'M5',  pct: 34, description: 'Accélération' },
  { mois: 'M6',  pct: 50, description: 'Mi-parcours' },
  { mois: 'M7',  pct: 61, description: 'Consolidation' },
  { mois: 'M8',  pct: 70, description: 'Maturité progressive' },
  { mois: 'M9',  pct: 76, description: 'Plateau intermédiaire' },
  { mois: 'M10', pct: 82, description: 'Renforcement' },
  { mois: 'M11', pct: 87, description: 'Pré-maturité' },
  { mois: 'M12', pct: 92, description: 'Maturité année 1' },
];

const ROI_COEFFICIENTS = [
  { label: 'Année 1', moisEffectifs: 5.83, description: 'Mois de maturité effective sur 12 mois (rampe M1–M12)' },
  { label: 'Année 2', moisEffectifs: 18.5, description: 'Cumul sur 24 mois incluant la montée en puissance' },
];

const CPL_COEFFICIENTS = [
  { label: 'An 1',  moisEffectifs: 6.5  },
  { label: 'An 2',  moisEffectifs: 18.5 },
  { label: 'An 3',  moisEffectifs: 30.5 },
  { label: 'An 5',  moisEffectifs: 54.5 },
];

/* ─── Sous-composants ─────────────────────────────────────────── */

function SectionCard({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      backgroundColor: G2, border: `1px solid ${G3}`, borderRadius: 12,
      padding: '24px 28px', marginBottom: 24,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: CREAM, marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>{description}</p>
      {children}
    </div>
  );
}

function FormulaBlock({ formula, legend }: { formula: string; legend?: string }) {
  return (
    <div style={{ marginBottom: legend ? 8 : 0 }}>
      <div style={{
        backgroundColor: G5, border: `1px solid ${G4}`, borderRadius: 8,
        padding: '12px 16px', fontFamily: 'monospace', fontSize: 13,
        color: '#a8d5b5', whiteSpace: 'pre-wrap', lineHeight: 1.6,
      }}>
        {formula}
      </div>
      {legend && (
        <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>{legend}</p>
      )}
    </div>
  );
}

function ReadonlyBadge() {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: MUTED,
      border: `1px solid ${G3}`, borderRadius: 4,
      padding: '2px 8px', marginLeft: 10, verticalAlign: 'middle',
    }}>
      Lecture seule
    </span>
  );
}

/* ─── Page principale ─────────────────────────────────────────── */

export default function ConfigurationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && !session?.user?.isGlobalAdmin) {
      router.push('/rapports');
    }
  }, [status, session, router]);

  if (status === 'loading' || !session?.user?.isGlobalAdmin) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: G, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CREAM, fontFamily: 'Inter, sans-serif' }}>
        Chargement…
      </main>
    );
  }

  return (
    <main style={{ height: '100vh', overflowY: 'auto', backgroundColor: G, color: CREAM, fontFamily: "'Inter', sans-serif", padding: '40px 32px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Configuration</h1>
            <p style={{ color: MUTED, fontSize: 14 }}>
              Matrices et formules de calcul utilisées par le simulateur
              <ReadonlyBadge />
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/users" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              color: CREAM, padding: '9px 18px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              👤 Utilisateurs
            </Link>
            <Link href="/rapports" style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              color: CREAM, padding: '9px 18px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              📋 Rapports
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

        {/* Bandeau info */}
        <div style={{
          backgroundColor: '#1a3d2e', border: `1px solid ${GREEN}33`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 32,
          fontSize: 13, color: MUTED, lineHeight: 1.6,
        }}>
          <strong style={{ color: GREEN }}>Zone admin</strong> — Ces paramètres définissent le comportement du simulateur.
          Toute modification impacterait tous les nouveaux rapports générés. L'édition sera disponible dans une prochaine version.
        </div>

        {/* 1. Position par mot-clé */}
        <SectionCard
          title="Formule de position par mot-clé"
          description="Calcule la position estimée dans les résultats de recherche pour chaque mot-clé, en fonction du budget, de l'autorité de domaine et de la santé technique du site."
        >
          <FormulaBlock
            formula={`coeffSante   = max(0.01, healthScore / 80)
budgetParKw  = budgetCategorie / nombreMotsClésCatégorie
logBudget    = ln(1 + max(0, budgetParKw) / 20)
dénominateur = 225 × DA × (coeffSante / 70) × √(nbMotsClés) × logBudget
posRaw       = (difficulté^1.9 × facteurProximité) / dénominateur
position     = clamp(round(posRaw), 1, 11)`}
            legend="DA = Domain Authority (1–100). Position 11 = hors top 10 (trafic nul). Le coefficient de santé pénalise les sites avec un score Semrush faible."
          />
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Constantes de la formule :</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Multiplicateur de base', value: '225' },
                { label: 'Diviseur santé', value: '70' },
                { label: 'Exposant difficulté', value: '1.9' },
                { label: 'Diviseur log budget', value: '20' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  backgroundColor: G5, borderRadius: 8, padding: '10px 16px',
                  fontSize: 13, flex: '1 1 160px',
                }}>
                  <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 700, color: ORANGE, fontFamily: 'monospace', fontSize: 16 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* 2. Tableau CTR */}
        <SectionCard
          title="Tableau CTR par position (taux de clic organique)"
          description="Taux de clic moyen observé selon la position dans les résultats Google. Ces valeurs sont basées sur des études sectorielles et ajustées au ratio budgétaire saisi."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {CTR_TABLE.map(({ position, ctr }) => (
              <div key={position} style={{
                backgroundColor: G5, borderRadius: 8, padding: '12px 14px',
                textAlign: 'center', border: `1px solid ${position <= 3 ? GREEN + '44' : G3}`,
              }}>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Position {position}</div>
                <div style={{
                  fontSize: 20, fontWeight: 700,
                  color: position === 1 ? GREEN : position <= 3 ? '#a8d5b5' : CREAM,
                  fontFamily: 'monospace',
                }}>
                  {ctr > 0 ? `${ctr}%` : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: MUTED }}>
            Le trafic mensuel par mot-clé est calculé ainsi :
            <code style={{ backgroundColor: G5, padding: '2px 6px', borderRadius: 4, marginLeft: 6, fontFamily: 'monospace' }}>
              trafic = volume × (CTR tableau × ratioBudget / 100)
            </code>
          </div>
        </SectionCard>

        {/* 3. Facteurs de proximité */}
        <SectionCard
          title="Facteurs de proximité sémantique"
          description="Pénalité appliquée à la position estimée selon l'écart entre le mot-clé et l'intention principale de la page ciblée. Plus la proximité est faible, plus la position est difficile à atteindre."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROX_FACTORS.map(({ label, factor, description }) => (
              <div key={label} style={{
                backgroundColor: G5, borderRadius: 8, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{
                  minWidth: 48, height: 48, borderRadius: 8,
                  backgroundColor: G4, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: 18,
                  color: ORANGE, fontFamily: 'monospace',
                }}>
                  ×{factor}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{description}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 4. Taux de conversion par intention */}
        <SectionCard
          title="Taux de conversion par intention de recherche"
          description="Pourcentage du trafic organique converti en lead/contact selon le type d'intention. Ces valeurs sont modifiables dans chaque simulation via le panneau 'Paramètres avancés'."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { intention: 'Transactionnel', default: 4.0, description: 'Visiteur prêt à acheter / demander un devis (ex : "prix logiciel CRM")' },
              { intention: 'Pré-achat',      default: 2.0, description: 'Comparaison, sélection (ex : "meilleur logiciel CRM")' },
              { intention: 'Informationnel commercial', default: 1.0, description: 'Découverte de solutions (ex : "comment gérer sa prospection")' },
              { intention: 'Informationnel', default: 0.5, description: 'Contenu éducatif pur, peu de conversion directe' },
            ].map(({ intention, default: def, description }) => (
              <div key={intention} style={{
                backgroundColor: G5, borderRadius: 8, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{
                  minWidth: 64, fontWeight: 700, fontSize: 18,
                  color: GREEN, fontFamily: 'monospace',
                }}>
                  {def}%
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{intention}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{description}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
            Ces valeurs sont les <strong style={{ color: CREAM }}>défauts au démarrage</strong> d'une nouvelle simulation. L'utilisateur peut les ajuster librement.
          </p>
        </SectionCard>

        {/* 5. Courbe de montée en puissance */}
        <SectionCard
          title="Courbe de montée en puissance SEO (ramp-up)"
          description="Pourcentage du trafic/CA potentiel à pleine maturité atteint chaque mois. Reflète le délai naturel d'un référencement organique : les résultats s'accumulent progressivement."
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {RAMP_UP_DATA.map(({ mois, pct }) => (
              <div key={mois} style={{
                flex: '1 1 72px', minWidth: 60,
                backgroundColor: G5, borderRadius: 8, padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{mois}</div>
                <div style={{
                  fontWeight: 700, fontFamily: 'monospace',
                  fontSize: 15,
                  color: pct >= 80 ? GREEN : pct >= 40 ? '#a8d5b5' : CREAM,
                }}>
                  {pct}%
                </div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, backgroundColor: G3 }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, backgroundColor: pct >= 80 ? GREEN : ORANGE }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>
            À M12 le potentiel est à 92% — la pleine maturité est atteinte au cours de l'année 2.
          </div>
        </SectionCard>

        {/* 6. Formules ROI */}
        <SectionCard
          title="Formules de calcul du ROI"
          description="Le ROI est calculé sur la base du CA mensuel à pleine maturité, pondéré par les mois effectifs d'activité sur la période (intégration de la courbe de montée en puissance)."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ROI_COEFFICIENTS.map(({ label, moisEffectifs, description }) => (
              <div key={label}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: CREAM }}>{label}</div>
                <FormulaBlock
                  formula={`ROI (%)    = ((CA mensuel × ${moisEffectifs} − budget annuel) / budget annuel) × 100\nMultiplie  = (CA mensuel × ${moisEffectifs}) / budget annuel`}
                  legend={description}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Mois effectifs utilisés :</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ROI_COEFFICIENTS.map(({ label, moisEffectifs }) => (
                <div key={label} style={{ backgroundColor: G5, borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
                  <span style={{ color: MUTED }}>{label} : </span>
                  <span style={{ fontWeight: 700, color: ORANGE, fontFamily: 'monospace' }}>{moisEffectifs} mois</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* 7. CPL */}
        <SectionCard
          title="Coût par lead (CPL) par horizon"
          description="Coût moyen d'acquisition d'un lead calculé en rapportant le budget total au nombre de leads projetés sur la période cumulée."
        >
          <FormulaBlock
            formula={`CPL = budget annuel / (totalLeads × moisEffectifs)`}
            legend="totalLeads = nombre de leads mensuels à pleine maturité"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {CPL_COEFFICIENTS.map(({ label, moisEffectifs }) => (
              <div key={label} style={{ backgroundColor: G5, borderRadius: 8, padding: '10px 16px', fontSize: 13, flex: '1 1 100px', textAlign: 'center' }}>
                <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 700, color: ORANGE, fontFamily: 'monospace' }}>{moisEffectifs} mois</div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 8. Coefficient de santé */}
        <SectionCard
          title="Coefficient de santé technique (Semrush)"
          description="Transforme le score de santé du site (0–100, issu d'un audit Semrush) en un multiplicateur qui pénalise ou booste la position estimée. Un site sain positionne mieux."
        >
          <FormulaBlock
            formula={`coeffSante = max(0.01, healthScore / 80)`}
            legend="Exemples : score 80 → coefficient 1.0 (neutre) | score 40 → 0.5 (pénalité ×2 sur la position) | score 100 → 1.25 (bonus)"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {[
              { score: 100, coeff: '1.25', color: GREEN },
              { score: 80,  coeff: '1.00', color: '#a8d5b5' },
              { score: 60,  coeff: '0.75', color: CREAM },
              { score: 40,  coeff: '0.50', color: ORANGE },
              { score: 20,  coeff: '0.25', color: '#e8571a88' },
            ].map(({ score, coeff, color }) => (
              <div key={score} style={{ backgroundColor: G5, borderRadius: 8, padding: '10px 16px', fontSize: 13, flex: '1 1 80px', textAlign: 'center' }}>
                <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Score {score}</div>
                <div style={{ fontWeight: 700, color, fontFamily: 'monospace' }}>×{coeff}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 9. Multiplicateur de mots-clés */}
        <SectionCard
          title="Multiplicateur de mots-clés"
          description="Facteur appliqué à tous les résultats pour estimer l'impact d'une longue traîne non saisie. Permet de projeter le potentiel réel du contenu optimisé au-delà des seuls mots-clés déclarés."
        >
          <FormulaBlock
            formula={`traficTotal = traficMotsClésRenseignés × multiplicateur\nleadsTotal  = leadsMotsClésRenseignés × multiplicateur\n\nValeur par défaut : 3×`}
            legend="Modifiable dans chaque simulation. Représente le rapport entre la longue traîne totale et les mots-clés principaux saisis."
          />
        </SectionCard>

        <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', paddingBottom: 40 }}>
          Ces paramètres sont en lecture seule. Pour les modifier, contactez l'équipe technique ou attendez la prochaine version avec édition admin.
        </div>

      </div>
    </main>
  );
}

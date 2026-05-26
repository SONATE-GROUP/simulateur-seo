'use client';

import { useState, useMemo, useRef, useEffect, CSSProperties } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

/* ─── TYPES ──────────────────────────────────────────────────── */
type Proximity = 1 | 2 | 3;
type Intention = 1 | 2 | 3 | 4;

interface Keyword {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  proximity: Proximity;
  intention: Intention;
  topic: string;
}

interface SimState {
  prospectName: string;
  siteUrl: string;
  sector: string;
  da: number;
  healthScore: number;
  basketValue: number;
  keywords: Keyword[];
  crTransactionnel: number;
  crPreAchat: number;
  crIntermediaire: number;
  crInformationnel: number;
  costPerPage: number;
  budgetRatio: number;
  seasonalityEnabled: boolean;
  startMonth: number;            // 0 = Janvier
  highSeasonMonths: boolean[];   // [Jan, Fév, Mar, ..., Déc]
  highSeasonMultiplier: number;  // ex: 3 = haute saison = 3× la moyenne
}

/* ─── CONSTANTS ──────────────────────────────────────────────── */
const CTR_TABLE: Record<number, number> = {
  1: 0.158, 2: 0.110, 3: 0.084, 4: 0.063, 5: 0.049,
  6: 0.040, 7: 0.033, 8: 0.027, 9: 0.024, 10: 0.020, 11: 0,
};

const INTENT_LABEL: Record<number, string> = {
  1: 'Transactionnel', 2: 'Pré-achat', 3: 'Intermédiaire', 4: 'Informationnel',
};

const INTENT_COLOR: Record<number, string> = {
  1: '#e8571a', 2: '#f59e0b', 3: '#3b82f6', 4: '#6b7280',
};

const DEFAULT_KEYWORDS: Keyword[] = [
  { id: '1', keyword: 'acheter graines tomates', volume: 2400, difficulty: 35, proximity: 1, intention: 1, topic: 'Graines tomates' },
  { id: '2', keyword: 'meilleures graines potager', volume: 1800, difficulty: 42, proximity: 2, intention: 2, topic: 'Graines potager' },
  { id: '3', keyword: 'semences bio pas cher', volume: 3200, difficulty: 38, proximity: 1, intention: 1, topic: 'Semences bio' },
  { id: '4', keyword: 'comment semer des fleurs', volume: 5400, difficulty: 25, proximity: 3, intention: 4, topic: 'Guide semis' },
  { id: '5', keyword: 'graines de courge', volume: 2100, difficulty: 30, proximity: 2, intention: 2, topic: 'Graines courge' },
  { id: '6', keyword: 'jardinerie en ligne', volume: 8900, difficulty: 65, proximity: 3, intention: 1, topic: 'Jardinerie' },
];

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

const SEASON_PRESETS = {
  uniforme:  Array(12).fill(false),
  hivernal:  [true, true, true, true, false, false, false, false, false, false, false, true],  // Oct-Avr
  estival:   [false, false, false, true, true, true, true, true, true, false, false, false],   // Avr-Sep
};

const INITIAL: SimState = {
  prospectName: 'Votre Prospect',
  siteUrl: 'www.exemple.com',
  sector: 'E-commerce Jardin',
  da: 20,
  healthScore: 60,
  basketValue: 100,
  keywords: DEFAULT_KEYWORDS,
  crTransactionnel: 10,
  crPreAchat: 5,
  crIntermediaire: 1,
  crInformationnel: 0.5,
  costPerPage: 700,
  budgetRatio: 100,
  seasonalityEnabled: false,
  startMonth: 0,
  highSeasonMonths: Array(12).fill(false),
  highSeasonMultiplier: 3,
};

/* ─── PALETTE ────────────────────────────────────────────────── */
const G  = '#1a2e25';
const G2 = '#142218';
const G3 = '#2d4a3e';
const G4 = '#3a5c4e';
const G5 = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';

/* ─── FORMATTERS ─────────────────────────────────────────────── */
const fmtN = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtC = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n));
const fmtP = (n: number, d = 1) => `${n.toFixed(d)}%`;

function encodeState(s: SimState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
function decodeState(b64: string): SimState {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function uid() { return Math.random().toString(36).slice(2, 10); }

/* ─── SHARED STYLES ──────────────────────────────────────────── */
const card: CSSProperties = {
  backgroundColor: G5,
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
  border: `1px solid ${G3}`,
};

/* Light panel (left sidebar) */
const CREAM2 = '#f5f0e8';     // panel background
const L_CARD  = 'rgba(255,255,255,0.65)'; // card bg on light
const L_BORD  = '#ddd5c8';    // border
const L_DARK  = '#1e3328';    // main text
const L_MED   = '#4a6a5a';    // secondary text
const L_SOFT  = '#8a9e98';    // muted text
const L_INPUT = '#ffffff';    // input bg
const L_TRACK = '#d5cfc6';    // slider track

const cardLight: CSSProperties = {
  backgroundColor: L_CARD,
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
  border: `1px solid ${L_BORD}`,
};

const secTitle: CSSProperties = {
  color: CREAM,
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const secTitleLight: CSSProperties = {
  color: L_DARK,
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const inputBase: CSSProperties = {
  backgroundColor: G3,
  border: `1px solid ${G4}`,
  borderRadius: 6,
  padding: '7px 11px',
  color: CREAM,
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

const inputLight: CSSProperties = {
  backgroundColor: L_INPUT,
  border: `1px solid ${L_BORD}`,
  borderRadius: 6,
  padding: '7px 11px',
  color: L_DARK,
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

/* ─── SLIDER ─────────────────────────────────────────────────── */
function Slider({
  label, value, min, max, step = 1, unit = '', onChange, hint, light = false,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void; hint?: string; light?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ color: light ? L_MED : '#a8c5b5', fontSize: 12 }}>{label}</span>
        <span style={{ color: ORANGE, fontWeight: 700, fontSize: 15 }}>{value}{unit}</span>
      </div>
      {hint && <div style={{ color: light ? L_MED : '#7a9e8e', fontSize: 11, marginBottom: 4 }}>{hint}</div>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={light ? 'slider-light' : undefined}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ color: light ? L_SOFT : '#4a6a5a', fontSize: 10 }}>{min}{unit}</span>
        <span style={{ color: light ? L_SOFT : '#4a6a5a', fontSize: 10 }}>{max}{unit}</span>
      </div>
    </div>
  );
}

/* ─── KPI CARD ───────────────────────────────────────────────── */
function KPICard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{ backgroundColor: G5, borderRadius: 10, padding: '14px 16px', border: `1px solid ${G3}`, flex: 1 }}>
      <div style={{ color: '#7a9e8e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ color: accent ? ORANGE : CREAM, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: '#5a7a6a', fontSize: 11, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

/* ─── FUNNEL ─────────────────────────────────────────────────── */
function ConversionFunnel({ impressions, traffic, leads, caMonthly, basketValue }: {
  impressions: number; traffic: number; leads: number; caMonthly: number; basketValue: number;
}) {
  // SVG triangle dimensions
  const W = 400;        // triangle base width
  const H = 400;        // triangle height
  const TIP = 60;       // bottom width (not a true point, for readability)
  const BAND = H / 4;   // 100 per section
  const SVG_W = 520;    // total SVG width (extra space for rates on right)

  // Left/right edge at a given y
  const xl = (y: number) => (W - TIP) * y / (2 * H);
  const xr = (y: number) => W - xl(y);

  const COLORS = ['#e8571a', '#d04c15', '#a63c0f', '#7a2c09'];

  const stages = [
    { label: 'Impressions',  value: impressions, fmt: fmtN },
    { label: 'Clics',        value: traffic,     fmt: fmtN },
    { label: 'Leads',        value: leads,        fmt: (v: number) => v.toFixed(1) },
    { label: 'CA / mois',   value: caMonthly,   fmt: fmtC },
  ];

  // Conversion rates shown between bands (on the right)
  const rates = [
    impressions > 0 ? `↓ ${fmtP((traffic  / impressions) * 100)}` : '—',
    traffic     > 0 ? `↓ ${fmtP((leads    / traffic)     * 100)}` : '—',
    leads       > 0 ? `↓ ${fmtP((caMonthly / (leads * basketValue)) * 100)}` : `× ${basketValue}€`,
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${H + 4}`}
        style={{ width: '100%', maxWidth: 560 }}
        aria-label="Entonnoir de conversion"
      >
        {stages.map((stage, i) => {
          const y1 = i * BAND;
          const y2 = (i + 1) * BAND;
          const cy = (y1 + y2) / 2;
          // Trapezoid polygon for this band
          const pts = `${xl(y1)},${y1} ${xr(y1)},${y1} ${xr(y2)},${y2} ${xl(y2)},${y2}`;

          return (
            <g key={i}>
              {/* Band fill */}
              <polygon points={pts} fill={COLORS[i]} />

              {/* Thin separator between bands */}
              {i > 0 && (
                <line
                  x1={xl(y1)} y1={y1} x2={xr(y1)} y2={y1}
                  stroke="rgba(0,0,0,0.18)" strokeWidth={1}
                />
              )}

              {/* Label (small, above value) */}
              <text
                x={W / 2} y={cy - 12}
                fill="rgba(255,255,255,0.80)"
                fontSize={13}
                textAnchor="middle"
                fontFamily="Inter, -apple-system, sans-serif"
              >
                {stage.label}
              </text>

              {/* Value (large, bold) */}
              <text
                x={W / 2} y={cy + 15}
                fill="white"
                fontSize={22}
                fontWeight="800"
                textAnchor="middle"
                fontFamily="Inter, -apple-system, sans-serif"
              >
                {stage.fmt(stage.value)}
              </text>

              {/* Conversion rate label on the right, at the band transition */}
              {i < 3 && (
                <text
                  x={xr(y2) + 14}
                  y={y2 + 5}
                  fill={ORANGE}
                  fontSize={12}
                  fontWeight="600"
                  textAnchor="start"
                  fontFamily="Inter, -apple-system, sans-serif"
                >
                  {rates[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── CUSTOM TOOLTIP ─────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: G2, border: `1px solid ${G3}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: CREAM }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span style={{ color: p.color }}>{p.name === 'budget' ? 'Budget mensuel' : 'CA mensuel'}</span>
          <span style={{ fontWeight: 600 }}>{fmtC(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */
export default function SimulateurSEO() {
  const [state, setState] = useState<SimState>(INITIAL);
  const [linkCopied, setLinkCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const {
    prospectName, siteUrl, sector, da, healthScore, basketValue, keywords,
    crTransactionnel, crPreAchat, crIntermediaire, crInformationnel,
    costPerPage, budgetRatio,
    seasonalityEnabled, startMonth, highSeasonMonths, highSeasonMultiplier,
  } = state;

  const cr: Record<Intention, number> = {
    1: crTransactionnel, 2: crPreAchat, 3: crIntermediaire, 4: crInformationnel,
  };

  /* Load from URL */
  useEffect(() => {
    try {
      const data = new URLSearchParams(window.location.search).get('data');
      if (data) setState(decodeState(data));
    } catch { /* ignore */ }
  }, []);

  /* Per-keyword results */
  const kwResults = useMemo(() => keywords.map(kw => {
    const coeffSante = Math.max(0.01, healthScore / 80);
    const denom = da * coeffSante;
    const posRaw = denom > 0 ? (kw.difficulty * kw.proximity) / denom : 100;
    const pos = Math.min(Math.max(Math.ceil(posRaw), 1), 11);
    const baseCtr = CTR_TABLE[pos] ?? 0;
    const ctr = baseCtr * (budgetRatio / 100);
    const traffic = kw.volume * ctr;
    const leads = traffic * (cr[kw.intention as Intention] / 100);
    const ca = leads * basketValue;
    return { ...kw, pos, ctr, traffic, leads, ca };
  }), [keywords, da, healthScore, basketValue, crTransactionnel, crPreAchat, crIntermediaire, crInformationnel, budgetRatio]);

  /* Totals */
  const totals = useMemo(() => {
    const totalCA      = kwResults.reduce((s, k) => s + k.ca, 0);
    const totalLeads   = kwResults.reduce((s, k) => s + k.leads, 0);
    const totalTraffic = kwResults.reduce((s, k) => s + k.traffic, 0);
    const totalImpressions = keywords.reduce((s, k) => s + k.volume, 0);
    const topics    = new Set(keywords.map(k => k.topic).filter(Boolean));
    const nbPages   = topics.size || keywords.length;
    const budgetTotal  = nbPages * costPerPage * (budgetRatio / 100);
    const roi2ans      = budgetTotal > 0 ? ((totalCA * 18.5 - budgetTotal) / budgetTotal) * 100 : 0;
    const roiMult      = budgetTotal > 0 ? (totalCA * 18.5) / budgetTotal : 0;
    return { totalCA, totalLeads, totalTraffic, totalImpressions, nbPages, budgetTotal, roi2ans, roiMult };
  }, [kwResults, keywords, costPerPage, budgetRatio]);

  /* Monthly projection */
  const { monthlyData, breakEvenMonth } = useMemo(() => {
    const { totalCA, budgetTotal } = totals;
    const monthlyBudget = budgetTotal / 12;

    // Build seasonal weights (one per campaign month, mapped to calendar months)
    let weights: number[];
    if (seasonalityEnabled) {
      weights = Array.from({ length: 12 }, (_, i) => {
        const calMonth = (startMonth + i) % 12;
        return highSeasonMonths[calMonth] ? highSeasonMultiplier : 1;
      });
      // Normalize so the weighted sum of ramp-up × weights equals the base sum (totalCA × 6.5)
      // Base: Σ m/12 for m=1..12 = 6.5
      // Weighted raw: Σ (m/12) × weights[m-1]
      const rawWeightedSum = weights.reduce((s, w, i) => s + w * (i + 1) / 12, 0);
      const normFactor = rawWeightedSum > 0 ? 6.5 / rawWeightedSum : 1;
      weights = weights.map(w => w * normFactor);
    } else {
      weights = Array(12).fill(1);
    }

    let cumBudget = 0, cumCA = 0, bev = -1;
    const data = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const calMonth = (startMonth + i) % 12;
      const label = seasonalityEnabled ? MONTH_NAMES[calMonth] : `M${m}`;
      const ca = totalCA * (m / 12) * weights[i];
      cumBudget += monthlyBudget;
      cumCA     += ca;
      if (bev === -1 && cumCA >= cumBudget) bev = m;
      return { month: label, budget: Math.round(monthlyBudget), ca: Math.round(ca), isBev: bev === m };
    });
    const bevLabel = bev > 0
      ? (seasonalityEnabled ? MONTH_NAMES[(startMonth + bev - 1) % 12] : `M${bev}`)
      : null;
    return { monthlyData: data, breakEvenMonth: bevLabel };
  }, [totals, seasonalityEnabled, startMonth, highSeasonMonths, highSeasonMultiplier]);

  /* CPL */
  const cpl = useMemo(() => {
    const { totalLeads: tl, budgetTotal: bt } = totals;
    const safe = tl > 0.001 ? tl : 0.001;
    return {
      an1: bt / (safe * 6.5),
      an2: bt / (safe * 18.5),
      an3: bt / (safe * 30.5),
      an5: bt / (safe * 54.5),
    };
  }, [totals]);

  /* Helpers */
  const update = (patch: Partial<SimState>) => setState(s => ({ ...s, ...patch }));

  const addKw = () => setState(s => ({
    ...s,
    keywords: [...s.keywords, { id: uid(), keyword: '', volume: 1000, difficulty: 30, proximity: 1, intention: 1, topic: '' }],
  }));

  const removeKw = (id: string) => setState(s => ({ ...s, keywords: s.keywords.filter(k => k.id !== id) }));

  const updateKw = (id: string, field: keyof Keyword, value: unknown) =>
    setState(s => ({ ...s, keywords: s.keywords.map(k => k.id === id ? { ...k, [field]: value } : k) }));

  const genLink = () => {
    const url = `${location.origin}${location.pathname}?data=${encodeState(state)}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const exportPDF = async () => {
    if (!resultsRef.current) return;
    const el = resultsRef.current;

    // Expand the scrollable div to its full content height so html2canvas
    // captures everything, not just the visible viewport portion.
    const savedOverflow = el.style.overflowY;
    const savedHeight   = el.style.height;
    const savedMaxH     = el.style.maxHeight;
    el.style.overflowY = 'visible';
    el.style.height    = `${el.scrollHeight}px`;
    el.style.maxHeight = 'none';

    // Let the browser re-layout before capture
    await new Promise(r => setTimeout(r, 120));

    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF }   = await import('jspdf');

    const canvas = await html2canvas(el, {
      scale: 2, backgroundColor: G, useCORS: true, logging: false,
    });

    // Restore original styles
    el.style.overflowY = savedOverflow;
    el.style.height    = savedHeight;
    el.style.maxHeight = savedMaxH;

    const img   = canvas.toDataURL('image/png');
    const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const imgH  = (canvas.height * pageW) / canvas.width;

    let y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, -y, pageW, imgH);
      y += pageH;
    }
    pdf.save(`simulation-seo-${(prospectName || 'prospect').toLowerCase().replace(/\s+/g, '-')}.pdf`);
  };

  const coeffSante = (healthScore / 80).toFixed(2);

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <div style={{ backgroundColor: G, height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ── */}
      <header style={{
        backgroundColor: '#ffffff', borderBottom: '1px solid #e8e8e8',
        padding: '0 24px', height: 80, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 20, zIndex: 100,
      }}>
        {/* Logo — background-image crop: original 1762×990, Sonate text at y≈8–50% */}
        <div style={{ position: 'relative', width: 252, height: 65, flexShrink: 0 }}>
          <div style={{
            backgroundImage: 'url(/logo-sonate.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '270px auto',
            backgroundPosition: '-5px -12px',
            width: '100%',
            height: '100%',
          }} role="img" aria-label="Sonate" />
          <span style={{
            position: 'absolute', top: 2, right: 0,
            fontSize: 8, fontWeight: 800, letterSpacing: '0.15em',
            color: ORANGE, lineHeight: 1,
          }}>Accompagnement SEO/GEO</span>
        </div>

        <div style={{ width: 1, height: 40, backgroundColor: '#e0e0e0', flexShrink: 0 }} />

        {/* Prospect fields */}
        <div style={{ display: 'flex', gap: 8, flex: 1 }}>
          {([
            { key: 'prospectName', placeholder: 'Nom du prospect', value: prospectName },
            { key: 'siteUrl',      placeholder: 'URL du site',       value: siteUrl },
            { key: 'sector',       placeholder: "Secteur d'activité", value: sector },
          ] as { key: keyof SimState; placeholder: string; value: string }[]).map(({ key, placeholder, value }) => (
            <input
              key={key}
              value={value}
              placeholder={placeholder}
              onChange={e => update({ [key]: e.target.value })}
              style={{ ...inputBase, flex: 1, backgroundColor: '#f5f5f5', border: '1px solid #ddd', color: '#1a3a2a' }}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={genLink}
            style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 6, padding: '7px 14px', color: G2,
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'border-color .15s',
            }}
          >
            {linkCopied ? '✓ Copié !' : '🔗 Générer lien'}
          </button>
          <button
            onClick={exportPDF}
            style={{
              backgroundColor: ORANGE, border: 'none', borderRadius: 6,
              padding: '7px 16px', color: 'white', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            ↓ Exporter PDF
          </button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{
          width: 400, minWidth: 400, overflowY: 'auto',
          borderRight: `1px solid ${L_BORD}`,
          padding: '14px 14px 20px',
          backgroundColor: CREAM2,
        }}>

          {/* DONNÉES DU SITE */}
          <div style={cardLight}>
            <div style={secTitleLight}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Données du site
            </div>
            <Slider light label="Domain Authority (DA)" value={da} min={1} max={100}
              onChange={v => update({ da: v })} />
            <Slider light label="Score Santé Semrush" value={healthScore} min={0} max={100}
              hint={`Coefficient : ${coeffSante}`}
              onChange={v => update({ healthScore: v })} />
            <div>
              <div style={{ color: L_MED, fontSize: 12, marginBottom: 6 }}>
                Panier moyen / Valeur d'un lead
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" value={basketValue} min={1}
                  onChange={e => update({ basketValue: Math.max(1, Number(e.target.value)) })}
                  style={{ ...inputLight, fontWeight: 700, fontSize: 16, textAlign: 'center' }}
                />
                <span style={{ color: ORANGE, fontWeight: 700, fontSize: 16 }}>€</span>
              </div>
            </div>
          </div>

          {/* MOTS CLÉS */}
          <div style={{ ...cardLight, padding: '14px 12px' }}>
            <div style={{ ...secTitleLight, marginBottom: 10 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Mots clés
              <button
                onClick={addKw}
                style={{
                  marginLeft: 'auto', backgroundColor: ORANGE, border: 'none',
                  borderRadius: 4, padding: '3px 10px', color: 'white',
                  fontSize: 12, cursor: 'pointer', fontWeight: 700,
                }}
              >
                + Ajouter
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: L_MED }}>
                    <th style={{ padding: '3px 4px 6px 0', textAlign: 'left' }}>Mot clé</th>
                    <th style={{ padding: '3px 2px 6px', textAlign: 'center', minWidth: 52 }}>Volume mensuel</th>
                    <th style={{ padding: '3px 2px 6px', textAlign: 'center', minWidth: 36 }}>Difficulté</th>
                    <th style={{ padding: '3px 2px 6px', textAlign: 'center', minWidth: 88 }}>Proximité</th>
                    <th style={{ padding: '3px 2px 6px', textAlign: 'center', minWidth: 100 }}>Intention</th>
                    <th style={{ padding: '3px 0px 6px 2px', textAlign: 'left', minWidth: 72 }}>Sujet</th>
                    <th style={{ width: 18 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map(kw => (
                    <tr key={kw.id} style={{ borderTop: `1px solid ${L_BORD}` }}>
                      <td style={{ padding: '4px 4px 4px 0' }}>
                        <input
                          value={kw.keyword}
                          onChange={e => updateKw(kw.id, 'keyword', e.target.value)}
                          placeholder="mot clé…"
                          style={{ backgroundColor: 'transparent', border: 'none', color: L_DARK, fontSize: 11, outline: 'none', width: '100%', minWidth: 100 }}
                        />
                      </td>
                      <td style={{ padding: '4px 2px' }}>
                        <input
                          type="number" value={kw.volume}
                          onChange={e => updateKw(kw.id, 'volume', Math.max(0, Number(e.target.value)))}
                          style={{ width: 52, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', textAlign: 'center', outline: 'none' }}
                        />
                      </td>
                      <td style={{ padding: '4px 2px' }}>
                        <input
                          type="number" value={kw.difficulty} min={0} max={100}
                          onChange={e => updateKw(kw.id, 'difficulty', Math.min(100, Math.max(0, Number(e.target.value))))}
                          style={{ width: 36, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', textAlign: 'center', outline: 'none' }}
                        />
                      </td>
                      <td style={{ padding: '4px 2px' }}>
                        <select
                          value={kw.proximity}
                          onChange={e => updateKw(kw.id, 'proximity', Number(e.target.value) as Proximity)}
                          style={{ width: 88, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value={1}>Sujet exact</option>
                          <option value={2}>Très proche</option>
                          <option value={3}>Thématique</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 2px' }}>
                        <select
                          value={kw.intention}
                          onChange={e => updateKw(kw.id, 'intention', Number(e.target.value) as Intention)}
                          style={{ width: 100, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value={1}>Transactionnel</option>
                          <option value={2}>Pré-achat</option>
                          <option value={3}>Intermédiaire</option>
                          <option value={4}>Informationnel</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 2px 4px 4px' }}>
                        <input
                          value={kw.topic}
                          onChange={e => updateKw(kw.id, 'topic', e.target.value)}
                          placeholder="sujet…"
                          style={{ backgroundColor: 'transparent', border: 'none', color: L_MED, fontSize: 11, outline: 'none', width: '100%', minWidth: 66 }}
                        />
                      </td>
                      <td style={{ padding: '4px 0', textAlign: 'center' }}>
                        <button
                          onClick={() => removeKw(kw.id)}
                          style={{ background: 'none', border: 'none', color: '#c05050', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TAUX DE CONVERSION */}
          <div style={cardLight}>
            <div style={secTitleLight}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Taux de conversion par intention
            </div>
            <Slider light label="Transactionnel" value={crTransactionnel} min={0} max={30} step={0.5} unit="%" onChange={v => update({ crTransactionnel: v })} />
            <Slider light label="Pré-achat" value={crPreAchat} min={0} max={20} step={0.5} unit="%" onChange={v => update({ crPreAchat: v })} />
            <Slider light label="Intermédiaire" value={crIntermediaire} min={0} max={10} step={0.1} unit="%" onChange={v => update({ crIntermediaire: v })} />
            <Slider light label="Informationnel" value={crInformationnel} min={0} max={5} step={0.1} unit="%" onChange={v => update({ crInformationnel: v })} />
          </div>

          {/* BUDGET */}
          <div style={cardLight}>
            <div style={secTitleLight}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Budget
            </div>
            <Slider light label="Coût par page (création + optimisation)" value={costPerPage} min={300} max={2000} step={50} unit="€"
              onChange={v => update({ costPerPage: v })} />
            <Slider light label="Ratio budget alloué" value={budgetRatio} min={20} max={100} unit="%"
              hint={`Budget total : ${fmtC(totals.budgetTotal)}`}
              onChange={v => update({ budgetRatio: v })} />
            <div style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: L_MED, fontSize: 12 }}>{totals.nbPages} pages × {fmtC(costPerPage)} × {budgetRatio}%</span>
              <span style={{ color: ORANGE, fontWeight: 700, fontSize: 15 }}>{fmtC(totals.budgetTotal)}</span>
            </div>
          </div>

          {/* SAISONNALITÉ */}
          <div style={cardLight}>
            <div style={{ ...secTitleLight, marginBottom: seasonalityEnabled ? 14 : 0 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Saisonnalité
              <button
                onClick={() => update({ seasonalityEnabled: !seasonalityEnabled })}
                style={{
                  marginLeft: 'auto',
                  backgroundColor: seasonalityEnabled ? ORANGE : L_BORD,
                  border: 'none', borderRadius: 12,
                  width: 40, height: 22, cursor: 'pointer',
                  position: 'relative', transition: 'background .2s', flexShrink: 0,
                }}
                title={seasonalityEnabled ? 'Désactiver' : 'Activer'}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: seasonalityEnabled ? 20 : 4,
                  width: 16, height: 16,
                  backgroundColor: 'white', borderRadius: '50%',
                  transition: 'left .2s', display: 'block',
                }} />
              </button>
            </div>

            {seasonalityEnabled && (
              <>
                {/* Presets */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['uniforme', 'hivernal', 'estival'] as const).map(p => {
                    const active = JSON.stringify(highSeasonMonths) === JSON.stringify(SEASON_PRESETS[p]);
                    return (
                      <button
                        key={p}
                        onClick={() => update({ highSeasonMonths: [...SEASON_PRESETS[p]] })}
                        style={{
                          flex: 1, backgroundColor: active ? ORANGE : L_INPUT,
                          border: `1px solid ${active ? ORANGE : L_BORD}`,
                          borderRadius: 5, padding: '4px 6px',
                          color: active ? 'white' : L_MED,
                          fontSize: 11, fontWeight: active ? 700 : 400,
                          cursor: 'pointer', textTransform: 'capitalize',
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                {/* Month selector */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: L_MED, fontSize: 11, marginBottom: 6 }}>
                    Cliquer les mois de haute saison
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                    {MONTH_NAMES.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const next = [...highSeasonMonths];
                          next[i] = !next[i];
                          update({ highSeasonMonths: next });
                        }}
                        style={{
                          backgroundColor: highSeasonMonths[i] ? ORANGE : L_INPUT,
                          border: `1px solid ${highSeasonMonths[i] ? ORANGE : L_BORD}`,
                          borderRadius: 4, padding: '4px 2px',
                          color: highSeasonMonths[i] ? 'white' : L_MED,
                          fontSize: 10, fontWeight: highSeasonMonths[i] ? 700 : 400,
                          cursor: 'pointer', transition: 'all .15s',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Multiplier */}
                <Slider light
                  label="Multiplicateur haute saison"
                  value={highSeasonMultiplier}
                  min={1.5} max={6} step={0.5}
                  unit="×"
                  hint="Combien de fois plus de trafic en haute saison vs basse saison"
                  onChange={v => update({ highSeasonMultiplier: v })}
                />

                {/* Start month */}
                <div>
                  <div style={{ color: L_MED, fontSize: 12, marginBottom: 6 }}>Mois de démarrage de la campagne</div>
                  <select
                    value={startMonth}
                    onChange={e => update({ startMonth: Number(e.target.value) })}
                    style={{ ...inputLight, fontSize: 12 }}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

        </div>

        {/* ── RIGHT PANEL ── */}
        <div ref={resultsRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px' }}>

          {/* RAPPORT HEADER — apparaît dans le PDF */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: G2, borderRadius: 10, padding: '14px 20px',
            border: `1px solid ${G3}`, marginBottom: 14,
          }}>
            <div>
              <div style={{ color: '#5a7a6a', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                Simulation SEO · {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ color: CREAM, fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
                {prospectName || 'Prospect'}
              </div>
              {(siteUrl || sector) && (
                <div style={{ color: '#7a9e8e', fontSize: 12, marginTop: 4 }}>
                  {siteUrl}{siteUrl && sector ? ' · ' : ''}{sector}
                </div>
              )}
            </div>
            <div style={{ color: ORANGE, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
              SEO
            </div>
          </div>

          {/* BLOC 1 — MAIN KPIs */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{
              flex: 1, backgroundColor: G5, borderRadius: 12, padding: '24px 22px',
              border: `2px solid ${ORANGE}`,
            }}>
              <div style={{ color: '#7a9e8e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                CA Potentiel / An
              </div>
              <div style={{ color: ORANGE, fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtC(totals.totalCA * 12)}
              </div>
              <div style={{ color: '#5a7a6a', fontSize: 12, marginTop: 8 }}>
                à partir de 12 mois de prestation
              </div>
            </div>

            <div style={{
              flex: 1, backgroundColor: G5, borderRadius: 12, padding: '24px 22px',
              border: `1px solid ${G3}`,
            }}>
              <div style={{ color: '#7a9e8e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                ROI à 2 ans
              </div>
              <div style={{ color: CREAM, fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                ×{totals.roiMult.toFixed(1)}
              </div>
              <div style={{ color: '#5a7a6a', fontSize: 12, marginTop: 8 }}>
                +{fmtN(totals.roi2ans)}% sur investissement à 2 ans
              </div>
            </div>
          </div>

          {/* BLOC 2 — SECONDARY KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <KPICard label="Trafic organique / mois" value={fmtN(totals.totalTraffic)} />
            <KPICard label="Leads / mois (à 12 mois)" value={totals.totalLeads.toFixed(1)} />
            <KPICard label="Pages à créer" value={`${totals.nbPages}`} />
            <KPICard label="Budget total" value={fmtC(totals.budgetTotal)} accent />
          </div>

          {/* BLOC 3 — FUNNEL */}
          <div style={card}>
            <div style={secTitle}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Entonnoir de conversion
            </div>
            <ConversionFunnel
              impressions={totals.totalImpressions}
              traffic={totals.totalTraffic}
              leads={totals.totalLeads}
              caMonthly={totals.totalCA}
              basketValue={basketValue}
            />
          </div>

          {/* BLOC 4 — MONTHLY PROJECTION */}
          <div style={card}>
            <div style={{ ...secTitle, marginBottom: 16 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Projection mensuelle — 12 mois
              {seasonalityEnabled && (
                <span style={{ background: '#3b82f622', border: '1px solid #3b82f644', borderRadius: 4, padding: '2px 8px', fontSize: 10, color: '#3b82f6', fontWeight: 400 }}>
                  Saisonnalité active
                </span>
              )}
              {breakEvenMonth && (
                <span style={{ marginLeft: 'auto', color: ORANGE, fontSize: 12, fontWeight: 400, background: `${ORANGE}22`, borderRadius: 4, padding: '2px 8px' }}>
                  Break-even : {breakEvenMonth}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={monthlyData} margin={{ top: 8, right: 8, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={G3} />
                <XAxis dataKey="month" tick={{ fill: '#7a9e8e', fontSize: 11 }} axisLine={{ stroke: G3 }} tickLine={false} />
                <YAxis
                  tick={{ fill: '#7a9e8e', fontSize: 10 }}
                  axisLine={{ stroke: G3 }}
                  tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={v => <span style={{ color: '#a8c5b5', fontSize: 11 }}>{v === 'budget' ? 'Budget mensuel' : 'CA mensuel'}</span>}
                />
                <Bar dataKey="budget" fill={G4} name="budget" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Line dataKey="ca" stroke={ORANGE} strokeWidth={2.5} dot={false} name="ca" />
                {breakEvenMonth && (
                  <ReferenceLine
                    x={breakEvenMonth}
                    stroke={ORANGE}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Break-even', fill: ORANGE, fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* BLOC 5 — CPL */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...secTitle, marginBottom: 10 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Évolution du coût par lead (CPL)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {([
                { label: 'CPL à 1 an',  value: cpl.an1, mult: 6.5  },
                { label: 'CPL à 2 ans', value: cpl.an2, mult: 18.5 },
                { label: 'CPL à 3 ans', value: cpl.an3, mult: 30.5 },
                { label: 'CPL à 5 ans', value: cpl.an5, mult: 54.5 },
              ]).map(({ label, value, mult }) => (
                <div key={label} style={{ backgroundColor: G5, borderRadius: 10, padding: '14px 14px', border: `1px solid ${G3}` }}>
                  <div style={{ color: '#5a7a6a', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                  <div style={{ color: ORANGE, fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtC(value)}</div>
                  <div style={{ color: '#4a6a5a', fontSize: 10, marginTop: 5 }}>
                    {fmtN(totals.totalLeads * mult)} leads cumulés
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BLOC 6 — KEYWORD DETAIL */}
          <div style={card}>
            <div style={secTitle}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Détail par mot clé
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${G3}` }}>
                    {['Mot clé / Sujet', 'Position', 'CTR', 'Trafic / mois', 'Leads / mois', 'CA / mois', 'Intention'].map((h, i) => (
                      <th key={h} style={{
                        padding: '6px 8px',
                        textAlign: i === 0 ? 'left' : i >= 3 && i <= 5 ? 'right' : 'center',
                        color: '#5a7a6a',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: 10,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kwResults.map(kw => (
                    <tr key={kw.id} style={{ borderBottom: `1px solid ${G3}` }}>
                      <td style={{ padding: '8px 8px 8px 4px' }}>
                        <div style={{ color: CREAM, fontWeight: 500 }}>{kw.keyword || <em style={{ color: '#5a7a6a' }}>—</em>}</div>
                        {kw.topic && <div style={{ color: '#7a9e8e', fontSize: 10, marginTop: 2 }}>{kw.topic}</div>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          backgroundColor: kw.pos <= 3 ? ORANGE : kw.pos <= 6 ? '#2d7a5e' : G3,
                          borderRadius: 10, padding: '2px 9px',
                          fontSize: 11, fontWeight: 700, color: 'white',
                        }}>
                          {kw.pos === 11 ? '11+' : `#${kw.pos}`}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#a8c5b5' }}>
                        {fmtP(kw.ctr * 100)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: CREAM }}>{fmtN(kw.traffic)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: CREAM }}>{kw.leads.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: ORANGE, fontWeight: 600 }}>{fmtC(kw.ca)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          backgroundColor: `${INTENT_COLOR[kw.intention]}22`,
                          border: `1px solid ${INTENT_COLOR[kw.intention]}88`,
                          borderRadius: 10, padding: '2px 8px',
                          fontSize: 10, fontWeight: 600,
                          color: INTENT_COLOR[kw.intention],
                          whiteSpace: 'nowrap',
                        }}>
                          {INTENT_LABEL[kw.intention]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${G3}` }}>
                    <td style={{ padding: '10px 8px', color: CREAM, fontWeight: 700 }}>Total</td>
                    <td></td>
                    <td></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{fmtN(totals.totalTraffic)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{totals.totalLeads.toFixed(2)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: ORANGE, fontWeight: 800, fontSize: 14 }}>{fmtC(totals.totalCA)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* BLOC 7 — PARAMÈTRES (résumé pour le PDF) */}
          <div style={{ ...card, marginTop: 6 }}>
            <div style={secTitle}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Paramètres de simulation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px' }}>

              {/* Colonne gauche : données site + budget */}
              <div>
                <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Données du site &amp; Budget
                </div>
                {([
                  ['Domain Authority (DA)', `${da}`],
                  ['Score Santé Semrush', `${healthScore} → coeff. ${coeffSante}`],
                  ['Panier moyen / Lead', fmtC(basketValue)],
                  ['Coût par page', fmtC(costPerPage)],
                  ['Ratio budget alloué', `${budgetRatio}%`],
                  ['Budget total', fmtC(totals.budgetTotal)],
                  ['Nombre de pages', `${totals.nbPages}`],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${G3}` }}>
                    <span style={{ color: '#7a9e8e', fontSize: 12 }}>{label}</span>
                    <span style={{ color: CREAM, fontSize: 12, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
                {seasonalityEnabled && (
                  <div style={{ marginTop: 8, padding: '6px 10px', backgroundColor: `${ORANGE}22`, borderRadius: 5, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: ORANGE, fontSize: 11 }}>Saisonnalité</span>
                    <span style={{ color: ORANGE, fontSize: 11, fontWeight: 600 }}>
                      ×{highSeasonMultiplier} · démarrage {MONTH_NAMES[startMonth]}
                    </span>
                  </div>
                )}
              </div>

              {/* Colonne droite : taux de conversion */}
              <div>
                <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Taux de conversion par intention
                </div>
                {([
                  ['Transactionnel', `${crTransactionnel}%`, INTENT_COLOR[1]],
                  ['Pré-achat',      `${crPreAchat}%`,       INTENT_COLOR[2]],
                  ['Intermédiaire',  `${crIntermediaire}%`,  INTENT_COLOR[3]],
                  ['Informationnel', `${crInformationnel}%`, INTENT_COLOR[4]],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${G3}` }}>
                    <span style={{ color: '#7a9e8e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: color, borderRadius: 2 }} />
                      {label}
                    </span>
                    <span style={{ color: CREAM, fontSize: 12, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}

                {/* Récap hypothèses */}
                <div style={{ marginTop: 12, padding: '8px 10px', backgroundColor: G3, borderRadius: 5 }}>
                  <div style={{ color: '#5a7a6a', fontSize: 10, marginBottom: 4 }}>Hypothèses clés</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                    {([
                      ['DA', `${da}`],
                      ['Coeff. Semrush', coeffSante],
                      ['Panier', fmtC(basketValue)],
                      ['Budget', fmtC(totals.budgetTotal)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#7a9e8e', fontSize: 11 }}>{k}</span>
                        <span style={{ color: ORANGE, fontSize: 11, fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

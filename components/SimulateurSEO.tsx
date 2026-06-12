'use client';

import { useState, useMemo, useRef, useEffect, CSSProperties } from 'react';
import { useSession, signOut } from 'next-auth/react';
import * as XLSX from 'xlsx';
import {
  ComposedChart, BarChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

/* ─── TYPES ──────────────────────────────────────────────────── */
type Proximity = 1 | 2 | 3;
type Intention = 1 | 2 | 3 | 4;

interface Category {
  id: string;
  name: string;
  budget: number; // monthly budget for this category (€/month)
  coeff?: 1 | 2 | 5 | 10 | 20;
}

interface Keyword {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  proximity: Proximity;
  intention: Intention;
  topic: string;
  categoryId: string;
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
  budgetRatio: number;
  seasonalityEnabled: boolean;
  startMonth: number;
  highSeasonMonths: boolean[];
  highSeasonMultiplier: number;
  kwMultiplier: 1 | 4;
  businessType: 'ecommerce' | 'lead';
  tauxRdv: number;
  tauxClosing: number;
  categories: Category[];
  budgetCatsHidden: boolean;
}

/* ─── CONSTANTS ──────────────────────────────────────────────── */
const CTR_TABLE: Record<number, number> = {
  1: 0.296, 2: 0.168, 3: 0.120, 4: 0.094, 5: 0.073,
  6: 0.059, 7: 0.049, 8: 0.043, 9: 0.037, 10: 0.034, 11: 0,
};

const INTENT_LABEL: Record<number, string> = {
  1: 'Transactionnel', 2: 'Pré-achat', 3: 'Commerciale', 4: 'Informationnel',
};

const INTENT_COLOR: Record<number, string> = {
  1: '#e8571a', 2: '#f59e0b', 3: '#3b82f6', 4: '#6b7280',
};

const DEFAULT_KEYWORDS: Keyword[] = [
  { id: '1', keyword: 'acheter graines tomates',   volume: 2400, difficulty: 35, proximity: 1, intention: 1, topic: 'Graines tomates', categoryId: 'cat1' },
  { id: '2', keyword: 'meilleures graines potager', volume: 1800, difficulty: 42, proximity: 2, intention: 2, topic: 'Graines potager', categoryId: 'cat1' },
  { id: '3', keyword: 'semences bio pas cher',      volume: 3200, difficulty: 38, proximity: 1, intention: 1, topic: 'Semences bio',    categoryId: 'cat1' },
  { id: '4', keyword: 'comment semer des fleurs',   volume: 5400, difficulty: 25, proximity: 3, intention: 4, topic: 'Guide semis',     categoryId: 'cat2' },
  { id: '5', keyword: 'graines de courge',           volume: 2100, difficulty: 30, proximity: 2, intention: 2, topic: 'Graines courge',  categoryId: 'cat1' },
  { id: '6', keyword: 'jardinerie en ligne',         volume: 8900, difficulty: 65, proximity: 3, intention: 1, topic: 'Jardinerie',      categoryId: 'cat2' },
];

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];


const SEASON_PRESETS = {
  uniforme:  Array(12).fill(false),
  hivernal:  [true, true, true, true, false, false, false, false, false, false, false, true],  // Oct-Avr
  estival:   [false, false, false, true, true, true, true, true, true, false, false, false],   // Avr-Sep
};

const INITIAL: SimState = {
  prospectName: '',
  siteUrl: '',
  sector: '',
  da: 20,
  healthScore: 60,
  basketValue: 100,
  keywords: [],
  crTransactionnel: 5,
  crPreAchat: 2.5,
  crIntermediaire: 1,
  crInformationnel: 0.5,
  budgetRatio: 100,
  seasonalityEnabled: false,
  startMonth: 0,
  highSeasonMonths: Array(12).fill(false),
  highSeasonMultiplier: 3,
  kwMultiplier: 1,
  businessType: 'ecommerce',
  tauxRdv: 60,
  tauxClosing: 30,
  categories: [],
  budgetCatsHidden: false,
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
const fmtLeads = (n: number) => n >= 1 ? `${Math.round(n)}` : n > 0 ? n.toFixed(1) : '0';

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
  label, value, min, max, step = 1, unit = '', onChange, hint, light = false, bold = false,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void; hint?: string; light?: boolean; bold?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ color: light ? L_MED : '#a8c5b5', fontSize: bold ? 14 : 12, fontWeight: bold ? 700 : 400 }}>{label}</span>
        <span style={{ color: ORANGE, fontWeight: 700, fontSize: bold ? 18 : 15 }}>{value}{unit}</span>
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
function ConversionFunnel({ stages, rates }: {
  stages: { label: string; value: string; active: boolean }[];
  rates: string[];
}) {
  const N = stages.length;
  const W = 400;
  const BAND = 80;
  const H = N * BAND;
  const TIP = 60;
  const SVG_W = 520;

  const xl = (y: number) => (W - TIP) * y / (2 * H);
  const xr = (y: number) => W - xl(y);

  const COLORS_ON  = ['#e8571a', '#d04c15', '#b84412', '#a63c0f', '#8a300a', '#6e2407'];
  const COLORS_OFF = ['#3a5c4e', '#2d4a3e', '#243d33', '#1e3329', '#192d24', '#152520'];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
      <svg viewBox={`0 0 ${SVG_W} ${H + 4}`} style={{ width: '100%', maxWidth: 560 }} aria-label="Entonnoir de conversion">
        {stages.map((stage, i) => {
          const y1 = i * BAND, y2 = (i + 1) * BAND, cy = (y1 + y2) / 2;
          const pts = `${xl(y1)},${y1} ${xr(y1)},${y1} ${xr(y2)},${y2} ${xl(y2)},${y2}`;
          const color = stage.active ? COLORS_ON[i] : COLORS_OFF[i];
          const textAlpha = stage.active ? 1 : 0.35;
          return (
            <g key={i}>
              <polygon points={pts} fill={color} />
              {i > 0 && <line x1={xl(y1)} y1={y1} x2={xr(y1)} y2={y1} stroke="rgba(0,0,0,0.18)" strokeWidth={1} />}
              <text x={W / 2} y={cy - 12} fill={`rgba(255,255,255,${textAlpha * 0.8})`} fontSize={12} textAnchor="middle" fontFamily="Inter, sans-serif">{stage.label}</text>
              <text x={W / 2} y={cy + 14} fill={`rgba(255,255,255,${textAlpha})`} fontSize={20} fontWeight="800" textAnchor="middle" fontFamily="Inter, sans-serif">{stage.value}</text>
              {i < N - 1 && rates[i] && (
                <text x={xr(y2) + 12} y={y2 + 5} fill={stage.active ? ORANGE : '#3a5c4e'} fontSize={11} fontWeight="600" textAnchor="start" fontFamily="Inter, sans-serif">{rates[i]}</text>
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
const RAMP_UP_DATA = [
  { mois: 'M1',  pct: 2  },
  { mois: 'M2',  pct: 3  },
  { mois: 'M3',  pct: 6  },
  { mois: 'M4',  pct: 20 },
  { mois: 'M5',  pct: 34 },
  { mois: 'M6',  pct: 50 },
  { mois: 'M7',  pct: 61 },
  { mois: 'M8',  pct: 70 },
  { mois: 'M9',  pct: 76 },
  { mois: 'M10', pct: 82 },
  { mois: 'M11', pct: 87 },
  { mois: 'M12', pct: 92 },
];

/* ─── NUM INPUT ──────────────────────────────────────────────── */
function NumInput({ value, min = 0, max, onChange, style }: {
  value: number; min?: number; max?: number;
  onChange: (v: number) => void; style?: CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : String(value);

  const commit = () => {
    if (draft === null) return;
    const num = parseInt(draft, 10);
    const safe = isNaN(num) ? min : num;
    const clamped = Math.max(min, max !== undefined ? Math.min(max, safe) : safe);
    setDraft(null);
    onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={style}
    />
  );
}

export default function SimulateurSEO() {
  const { data: session } = useSession();
  const [state, setState] = useState<SimState>(INITIAL);
  const [saveState, setSaveState]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reportId, setReportId]       = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(['cat1', 'cat2']));
  const [workspaces, setWorkspaces]   = useState<{ id: string; name: string; role: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const resultsRef  = useRef<HTMLDivElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const toggleCat = (id: string) => setOpenCats(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const {
    prospectName, siteUrl, sector, da, healthScore, basketValue, keywords,
    crTransactionnel, crPreAchat, crIntermediaire, crInformationnel,
    budgetRatio,
    seasonalityEnabled, startMonth, highSeasonMonths, highSeasonMultiplier,
    kwMultiplier, businessType, tauxRdv, tauxClosing, categories, budgetCatsHidden,
  } = state;

  const cr: Record<Intention, number> = {
    1: crTransactionnel, 2: crPreAchat, 3: crIntermediaire, 4: crInformationnel,
  };

  /* Load from URL */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data   = params.get('data');
    const report = params.get('report');
    const migrate = (s: SimState): SimState => ({
      ...s,
      categories: (s.categories ?? []).map(c => ({ ...c, budget: c.budget ?? 700 })),
    });
    if (data) {
      try { setState(migrate(decodeState(data))); } catch { /* ignore */ }
    } else if (report) {
      setReportId(report);
      fetch(`/api/reports/${report}`)
        .then(r => r.json())
        .then(({ stateB64 }) => { if (stateB64) setState(migrate(decodeState(stateB64))); })
        .catch(() => { /* ignore */ });
    }
  }, []);

  /* Load workspaces — redirect readers to /rapports */
  useEffect(() => {
    if (!session) return;
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const editable = data.filter((w: { role: string }) => w.role === 'owner' || w.role === 'editor');
        const isReaderOnly = !session.user.isGlobalAdmin && editable.length === 0 && data.length > 0;
        if (isReaderOnly) { window.location.href = '/rapports'; return; }
        setWorkspaces(editable);
        if (editable.length > 0 && !workspaceId) setWorkspaceId(editable[0].id);
      })
      .catch(() => { /* ignore */ });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Per-keyword results */
  const kwResults = useMemo(() => {
    const coeffSante = Math.max(0.01, healthScore / 80);
    // Pre-compute per-category stats (budget + keyword count + coeff)
    const catStats: Record<string, { budget: number; nbKws: number; coeff: number }> = {};
    categories.forEach(cat => {
      catStats[cat.id] = { budget: cat.budget ?? 700, nbKws: 0, coeff: cat.coeff ?? 1 };
    });
    keywords.forEach(kw => {
      if (catStats[kw.categoryId]) catStats[kw.categoryId].nbKws++;
    });

    // proximity: 1=exact(×1.0), 2=très proche(×1.5), 3=thématique(×3.0)
    const PROX_FACTOR: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 3.0 };
    return keywords.map(kw => {
      const stats       = catStats[kw.categoryId] ?? { budget: 700, nbKws: 1, coeff: 1 };
      const nbKws       = Math.max(1, stats.nbKws);
      const budgetPerKw = stats.budget / nbKws;
      const logBudget   = Math.log(1 + Math.max(0, budgetPerKw) / 20);
      const denom       = 225 * da * (coeffSante / 70) * Math.sqrt(nbKws) * logBudget;
      const posRaw      = denom > 0 ? (Math.pow(kw.difficulty, 1.9) * (PROX_FACTOR[kw.proximity] ?? 1)) / denom : 100;
      const pos    = Math.min(Math.max(Math.round(posRaw), 1), 11);
      const baseCtr = CTR_TABLE[pos] ?? 0;
      const ctr    = baseCtr * (budgetRatio / 100);
      const traffic = kw.volume * ctr;
      const leads  = traffic * (cr[kw.intention as Intention] / 100);
      const leadConv = businessType === 'lead' ? (tauxRdv / 100) * (tauxClosing / 100) : 1;
      const ca     = leads * basketValue * leadConv;
      return { ...kw, pos, ctr, traffic, leads, ca };
    });
  }, [keywords, categories, da, healthScore, basketValue, crTransactionnel, crPreAchat, crIntermediaire, crInformationnel, budgetRatio, businessType, tauxRdv, tauxClosing]);

  /* Totals */
  const totals = useMemo(() => {
    const rawLeads   = kwResults.reduce((s, k) => s + k.leads, 0);
    // For lead mode, CA is gated by RDV + closing rates
    const leadConv   = businessType === 'lead' ? (tauxRdv / 100) * (tauxClosing / 100) : 1;
    const rawCA      = kwResults.reduce((s, k) => s + k.leads * basketValue * leadConv, 0);
    const totalLeads   = rawLeads   * kwMultiplier;
    const totalCA      = rawCA      * kwMultiplier;
    const totalTraffic = kwResults.reduce((s, k) => s + k.traffic, 0) * kwMultiplier;
    const totalImpressions = keywords.reduce((s, k) => s + k.volume, 0) * kwMultiplier;
    const topics    = new Set(keywords.map(k => k.topic).filter(Boolean));
    const nbPages   = (topics.size || keywords.length) * kwMultiplier;
    const nbKeywords = keywords.length * kwMultiplier;
    const budgetMensuel = categories.reduce((s, c) => s + (c.budget ?? 700), 0) * (budgetRatio / 100);
    const budgetTotal  = budgetMensuel * 12;
    const roi1an       = budgetTotal > 0 ? ((totalCA * 5.83 - budgetTotal) / budgetTotal) * 100 : 0;
    const roiMult1an   = budgetTotal > 0 ? (totalCA * 5.83) / budgetTotal : 0;
    const roi2ans      = budgetTotal > 0 ? ((totalCA * 18.5 - budgetTotal) / budgetTotal) * 100 : 0;
    const roiMult      = budgetTotal > 0 ? (totalCA * 18.5) / budgetTotal : 0;
    // Extra lead-mode values (unscaled, for funnel display)
    const baseLeads  = rawLeads;
    const baseRdv    = baseLeads * (tauxRdv / 100);
    const baseClosing = baseRdv * (tauxClosing / 100);
    return { totalCA, totalLeads, totalTraffic, totalImpressions, nbPages, nbKeywords, budgetMensuel, budgetTotal, roi1an, roiMult1an, roi2ans, roiMult, baseLeads, baseRdv, baseClosing };
  }, [kwResults, keywords, categories, budgetRatio, kwMultiplier, businessType, tauxRdv, tauxClosing, basketValue]);

  /* Monthly projection */
  const { monthlyData, breakEvenMonth } = useMemo(() => {
    const { totalCA, budgetMensuel, budgetTotal } = totals;
    const monthlyBudget = budgetMensuel;

    // Build seasonal weights (one per campaign month, mapped to calendar months)
    let weights: number[];
    if (seasonalityEnabled) {
      weights = Array.from({ length: 12 }, (_, i) => {
        const calMonth = (startMonth + i) % 12;
        return highSeasonMonths[calMonth] ? highSeasonMultiplier : 1;
      });
    } else {
      weights = Array(12).fill(1);
    }

    // Use the ramp-up curve (same as the histogram) to distribute monthly CA & leads
    const { totalLeads } = totals;
    // Closed clients per month at full maturity (fractional)
    const closedLeadsAtMaturity = basketValue > 0 ? totalCA / basketValue : 0;
    // Accumulate fractional clients to assign whole-client CA in the right months
    let cumulativeClients = 0;
    let intClientsSoFar = 0;
    let bev = -1;
    const data = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const calMonth = (startMonth + i) % 12;
      const label = seasonalityEnabled ? MONTH_NAMES[calMonth] : `M${m}`;
      const rampPct = RAMP_UP_DATA[i].pct / 100;
      const leads = totalLeads * rampPct * weights[i];
      cumulativeClients += closedLeadsAtMaturity * rampPct * weights[i];
      const newIntClients = Math.floor(cumulativeClients) - intClientsSoFar;
      intClientsSoFar = Math.floor(cumulativeClients);
      const ca = newIntClients * basketValue;
      // Break-even = first month where monthly CA covers monthly budget cost
      if (bev === -1 && ca >= monthlyBudget) bev = m;
      const cplMonth = leads > 0.5 ? Math.round(monthlyBudget / leads) : null;
      return { month: label, budget: Math.round(monthlyBudget), ca: Math.round(ca), leads: Math.round(leads), cplMonth, isBev: bev === m };
    });
    const bevLabel = bev > 0
      ? (seasonalityEnabled ? MONTH_NAMES[(startMonth + bev - 1) % 12] : `M${bev}`)
      : null;
    return { monthlyData: data, breakEvenMonth: bevLabel };
  }, [totals, basketValue, seasonalityEnabled, startMonth, highSeasonMonths, highSeasonMultiplier]);

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

  const addKw = (catId: string) => {
    setState(s => ({
      ...s,
      keywords: [...s.keywords, { id: uid(), keyword: '', volume: 1000, difficulty: 30, proximity: 1, intention: 1, topic: '', categoryId: catId }],
    }));
    setOpenCats(prev => { const n = new Set(prev); n.add(catId); return n; });
  };

  const removeKw = (id: string) => setState(s => ({ ...s, keywords: s.keywords.filter(k => k.id !== id) }));

  /* ── EXCEL IMPORT ─────────────────────────────────────────── */
  const INTENT_MAP: Record<string, Intention> = {
    transactionnel: 1, transactional: 1, achat: 1, '1': 1,
    'pré-achat': 2, 'pre-achat': 2, preachat: 2, consideration: 2, '2': 2,
    intermédiaire: 3, intermediaire: 3, commerciale: 3, commercial: 3, '3': 3,
    informationnel: 4, informational: 4, information: 4, info: 4, '4': 4,
  };
  const PROXIMITY_MAP: Record<string, Proximity> = {
    exact: 1, 'sujet exact': 1, 'mot cle exact': 1, '1': 1,
    proche: 2, 'tres proche': 2, 'très proche': 2, near: 2, '2': 2,
    thematique: 3, thématique: 3, thematic: 3, large: 3, '3': 3,
  };
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  const parseLocalizedNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    let raw = String(value ?? '').trim();
    if (!raw) return fallback;

    raw = raw.toLowerCase();
    const rangeParts = raw.split(/\s*[-–—]\s*/).filter(Boolean);
    if (rangeParts.length === 2) {
      const [minRange, maxRange] = rangeParts.map(part => parseLocalizedNumber(part, fallback));
      return (minRange + maxRange) / 2;
    }

    raw = raw
      .replace(/[  \s]/g, '')
      .replace(/€/g, '')
      .replace(/%/g, '');

    let multiplier = 1;
    if (raw.endsWith('k')) { multiplier = 1_000; raw = raw.slice(0, -1); }
    if (raw.endsWith('m')) { multiplier = 1_000_000; raw = raw.slice(0, -1); }

    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    if (comma !== -1 && dot !== -1) {
      raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
    } else if (comma !== -1) {
      const parts = raw.split(',');
      raw = parts.length > 1 && parts.at(-1)?.length === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
    } else if (dot !== -1) {
      const parts = raw.split('.');
      raw = parts.length > 1 && parts.slice(1).every(part => part.length === 3) ? raw.replace(/\./g, '') : raw;
    }

    const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed * multiplier : fallback;
  };

  const parseProximity = (value: unknown): Proximity => {
    const normalized = normalize(String(value ?? ''));
    const numeric = Math.round(parseLocalizedNumber(value, 1));
    return PROXIMITY_MAP[normalized] ?? (Math.min(3, Math.max(1, numeric)) as Proximity);
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target?.result, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!raw.length) return;

      // Map header keys → normalized, so imported files can use accents,
      // English labels, exports from SEO tools, or custom casing/spaces.
      const headerMap: Record<string, string> = {};
      Object.keys(raw[0]).forEach(h => { headerMap[normalize(h)] = h; });

      const col = (row: Record<string, unknown>, ...aliases: string[]) => {
        for (const a of aliases) {
          const key = headerMap[normalize(a)];
          if (key !== undefined) return row[key];
        }
        return '';
      };

      // Build category map: name → id (create new ids for new category names)
      const fallbackCatName = file.name.replace(/\.[^.]+$/, '');
      const catNameToId: Record<string, string> = {};

      const newKws: Keyword[] = raw.map(row => {
        const intentRaw = normalize(String(col(row, 'intention', 'intent', 'search intent') ?? ''));
        const catLabel = String(col(row, 'categorie', 'catégorie', 'category', 'cat', 'groupe', 'cluster') || fallbackCatName).trim();
        if (!catNameToId[catLabel]) catNameToId[catLabel] = uid();
        return {
          id:         uid(),
          keyword:    String(col(row, 'mot cle', 'mot-clé', 'mot-cle', 'keyword', 'kw', 'requete', 'requête', 'query', 'terme') ?? '').trim(),
          volume:     Math.max(0, Math.round(parseLocalizedNumber(col(row, 'volume', 'vol', 'volume mensuel', 'volume de recherche', 'search volume', 'monthly volume', 'avg. monthly searches', 'recherches mensuelles'), 0))),
          difficulty: Math.min(100, Math.max(0, Math.round(parseLocalizedNumber(col(row, 'difficulte', 'difficulté', 'difficulty', 'diff', 'kd', 'kd %', 'seo difficulty', 'keyword difficulty'), 30)))),
          proximity:  parseProximity(col(row, 'proximite', 'proximité', 'proximity', 'prox')),
          intention:  (INTENT_MAP[intentRaw] ?? 1) as Intention,
          topic:      String(col(row, 'sujet', 'topic', 'theme', 'thème', 'cluster', 'page') ?? '').trim(),
          categoryId: catNameToId[catLabel],
        };
      }).filter(k => k.keyword);

      if (!newKws.length) return;
      const newCats: Category[] = Object.entries(catNameToId).map(([name, id]) => {
        const nbInCat = newKws.filter(k => k.categoryId === id).length;
        return { id, name, budget: nbInCat * 700 };
      });
      const newCatIds = new Set(newCats.map(c => c.id));
      setState(s => ({
        ...s,
        categories: [...s.categories, ...newCats],
        keywords:   [...s.keywords, ...newKws],
      }));
      setOpenCats(prev => { const n = new Set(prev); newCatIds.forEach(id => n.add(id)); return n; });
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Catégorie', 'Mot clé', 'Volume', 'Difficulté', 'Proximité', 'Intention', 'Sujet'],
      ['Acquisition', 'acheter graines tomates', 2400, 35, 1, 1, 'Graines tomates'],
      ['Acquisition', 'semences bio pas cher', 3200, 38, 1, 1, 'Semences bio'],
      ['Notoriété', 'meilleures graines potager', 1800, 42, 2, 2, 'Graines potager'],
      ['Notoriété', 'comment semer des fleurs', 5400, 25, 3, 4, 'Guide semis'],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mots clés');
    XLSX.writeFile(wb, 'template-mots-cles.xlsx');
  };

  const addCategory = () => {
    const id = uid();
    setState(s => ({ ...s, categories: [...s.categories, { id, name: 'Nouvelle catégorie', budget: 2100 }] }));
    setOpenCats(prev => { const n = new Set(prev); n.add(id); return n; });
  };

  const updateCategoryBudget = (catId: string, budget: number) =>
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === catId ? { ...c, budget } : c) }));

  const updateCategoryCoeff = (catId: string, coeff: 1 | 2 | 5 | 10 | 20) =>
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === catId ? { ...c, coeff } : c) }));

  const removeCategory = (catId: string) => {
    setState(s => ({
      ...s,
      categories: s.categories.filter(c => c.id !== catId),
      keywords: s.keywords.filter(k => k.categoryId !== catId),
    }));
    setOpenCats(prev => { const n = new Set(prev); n.delete(catId); return n; });
  };

  const renameCategory = (catId: string, name: string) => setState(s => ({
    ...s, categories: s.categories.map(c => c.id === catId ? { ...c, name } : c),
  }));

  const updateKw = (id: string, field: keyof Keyword, value: unknown) =>
    setState(s => ({ ...s, keywords: s.keywords.map(k => k.id === id ? { ...k, [field]: value } : k) }));

  const [saveError, setSaveError] = useState('');
  const [funnelPeriod, setFunnelPeriod] = useState<'month' | 'year'>('month');
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [bulkBudget, setBulkBudget] = useState<string>('');
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string>('');
  const [creatingNewSpace, setCreatingNewSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceError, setNewSpaceError] = useState('');

  const doSave = async (wsId: string | null) => {
    setSaveState('saving');
    setSaveError('');
    const stateB64 = encodeState(state);

    try {
      if (reportId) {
        const res = await fetch(`/api/reports/${reportId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect: state.prospectName, siteUrl: state.siteUrl, sector: state.sector, stateB64 }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`${res.status} – ${body.error ?? 'Erreur serveur'}`);
        }
        navigator.clipboard.writeText(`${location.origin}${location.pathname}?report=${reportId}`);
      } else {
        const id = uid();
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, prospect: state.prospectName, siteUrl: state.siteUrl, sector: state.sector, stateB64, workspaceId: wsId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`${res.status} – ${body.error ?? 'Erreur serveur'}`);
        }
        setReportId(id);
        navigator.clipboard.writeText(`${location.origin}${location.pathname}?report=${id}`);
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[doSave] Sauvegarde DB échouée', msg);
      setSaveError(msg);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 6000);
    }
  };

  const genLink = () => {
    if (saveState === 'saving') return;
    if (reportId) {
      doSave(null);
    } else {
      setPendingWorkspaceId(workspaces.length > 0 ? workspaces[0].id : '');
      setShowWorkspaceModal(true);
    }
  };

  const exportPDF = async () => {
    if (!resultsRef.current) return;
    const el = resultsRef.current;

    // Expand every scrollable container (outer + all nested) before capture
    type Snapshot = { el: HTMLElement; overflowY: string; overflowX: string; height: string; maxHeight: string; width: string };
    const snapshots: Snapshot[] = [];

    [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))].forEach(node => {
      const cs = getComputedStyle(node);
      const needsY = ['auto', 'scroll'].includes(cs.overflowY);
      const needsX = ['auto', 'scroll'].includes(cs.overflowX);
      if (needsY || needsX) {
        snapshots.push({
          el: node,
          overflowY: node.style.overflowY,
          overflowX: node.style.overflowX,
          height:    node.style.height,
          maxHeight: node.style.maxHeight,
          width:     node.style.width,
        });
        node.style.overflowY = 'visible';
        node.style.overflowX = 'visible';
        if (needsY) { node.style.height = `${node.scrollHeight}px`; node.style.maxHeight = 'none'; }
        if (needsX) { node.style.width  = `${node.scrollWidth}px`; }
      }
    });

    await new Promise(r => setTimeout(r, 150));

    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF }   = await import('jspdf');

    const canvas = await html2canvas(el, {
      scale: 2, backgroundColor: G, useCORS: true, logging: false,
      width: el.scrollWidth, windowWidth: el.scrollWidth,
    });

    // Restore
    snapshots.forEach(s => {
      s.el.style.overflowY = s.overflowY;
      s.el.style.overflowX = s.overflowX;
      s.el.style.height    = s.height;
      s.el.style.maxHeight = s.maxHeight;
      s.el.style.width     = s.width;
    });

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

      {/* Workspace selection modal */}
      {showWorkspaceModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#1a2e25', borderRadius: 14, padding: 32,
            width: 440, border: '1px solid #2d4a3e', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f5f0e8', marginBottom: 6 }}>
              Enregistrer le rapport
            </h2>
            <p style={{ color: '#7a9e8e', fontSize: 14, marginBottom: 24 }}>
              Dans quel espace client souhaitez-vous enregistrer ce rapport ?
            </p>

            {/* Dropdown espaces existants */}
            {!creatingNewSpace && (
              <div style={{ marginBottom: 16 }}>
                <select
                  value={pendingWorkspaceId}
                  onChange={e => setPendingWorkspaceId(e.target.value)}
                  style={{
                    width: '100%', backgroundColor: '#233d30', border: '1px solid #2d4a3e',
                    borderRadius: 8, padding: '10px 12px', color: workspaces.length === 0 ? '#7a9e8e' : '#f5f0e8',
                    fontSize: 14, cursor: 'pointer', outline: 'none',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237a9e8e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                  }}
                  disabled={workspaces.length === 0}
                >
                  {workspaces.length === 0
                    ? <option value="">Aucun espace disponible</option>
                    : workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)
                  }
                </select>
              </div>
            )}

            {/* Créer un nouvel espace */}
            {creatingNewSpace ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#7a9e8e', marginBottom: 6 }}>Nom du nouvel espace</div>
                <input
                  autoFocus
                  value={newSpaceName}
                  onChange={e => { setNewSpaceName(e.target.value); setNewSpaceError(''); }}
                  placeholder="Ex : Agence Dupont, Client Martin…"
                  style={{
                    width: '100%', backgroundColor: '#233d30', border: `1px solid ${newSpaceError ? '#e05050' : '#2d4a3e'}`,
                    borderRadius: 8, padding: '10px 12px', color: '#f5f0e8',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {newSpaceError && <div style={{ color: '#e05050', fontSize: 12, marginTop: 4 }}>{newSpaceError}</div>}
                <button
                  onClick={() => { setCreatingNewSpace(false); setNewSpaceName(''); setNewSpaceError(''); }}
                  style={{
                    background: 'none', border: 'none', color: '#7a9e8e', fontSize: 13,
                    cursor: 'pointer', marginTop: 8, padding: 0,
                  }}
                >
                  ← Choisir un espace existant
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setCreatingNewSpace(true); setPendingWorkspaceId(''); }}
                style={{
                  background: 'none', border: '1px dashed #2d4a3e', borderRadius: 8,
                  color: '#7a9e8e', fontSize: 13, cursor: 'pointer',
                  padding: '8px 14px', marginBottom: 24, width: '100%', textAlign: 'left',
                }}
              >
                + Créer un nouvel espace
              </button>
            )}

            {creatingNewSpace && <div style={{ marginBottom: 24 }} />}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowWorkspaceModal(false);
                  setCreatingNewSpace(false);
                  setNewSpaceName('');
                  setNewSpaceError('');
                }}
                style={{
                  backgroundColor: 'transparent', border: '1px solid #2d4a3e',
                  borderRadius: 8, padding: '10px 20px', color: '#7a9e8e',
                  fontSize: 14, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                disabled={creatingNewSpace ? !newSpaceName.trim() : (!pendingWorkspaceId && workspaces.length > 0)}
                onClick={async () => {
                  if (creatingNewSpace) {
                    if (!newSpaceName.trim()) { setNewSpaceError('Veuillez saisir un nom'); return; }
                    const res = await fetch('/api/workspaces', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: newSpaceName.trim() }),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      setNewSpaceError(body.error ?? 'Erreur lors de la création');
                      return;
                    }
                    const ws = await res.json();
                    setWorkspaces(prev => [ws, ...prev]);
                    setShowWorkspaceModal(false);
                    setCreatingNewSpace(false);
                    setNewSpaceName('');
                    setWorkspaceId(ws.id);
                    doSave(ws.id);
                  } else {
                    setShowWorkspaceModal(false);
                    setWorkspaceId(pendingWorkspaceId);
                    doSave(pendingWorkspaceId || null);
                  }
                }}
                style={{
                  backgroundColor: '#e8571a', border: 'none',
                  borderRadius: 8, padding: '10px 24px', color: 'white',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: (creatingNewSpace ? !newSpaceName.trim() : (!pendingWorkspaceId && workspaces.length > 0)) ? 0.5 : 1,
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

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
            { key: 'prospectName', placeholder: "Nom de l'entreprise", value: prospectName },
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {saveError && saveState === 'error' && (
          <div style={{ color: '#e05050', fontSize: 11, textAlign: 'right' }}>{saveError}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={genLink}
            disabled={saveState === 'saving'}
            style={{
              backgroundColor: saveState === 'error' ? '#5c1a1a' : 'transparent',
              border: `1px solid ${saveState === 'saved' ? '#4caf50' : saveState === 'error' ? '#e05050' : G3}`,
              borderRadius: 6, padding: '7px 14px',
              color: saveState === 'saved' ? '#4caf50' : saveState === 'error' ? '#e05050' : G2,
              fontSize: 13, cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', transition: 'border-color .15s, color .15s',
              opacity: saveState === 'saving' ? 0.7 : 1,
            }}
          >
            {saveState === 'saving' ? '…' : saveState === 'saved' ? '✓ Enregistré !' : saveState === 'error' ? '✗ Erreur' : reportId ? '💾 Sauvegarder' : '💾 Enregistrer'}
          </button>
          {(session?.user?.isGlobalAdmin || workspaces.some(w => w.role === 'owner')) && (
            <a
              href="/admin/rapports"
              style={{
                backgroundColor: 'transparent', border: `1px solid ${G3}`,
                borderRadius: 6, padding: '7px 14px', color: G2,
                fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                textDecoration: 'none', display: 'flex', alignItems: 'center',
              }}
            >
              ⚙️ Back-office
            </a>
          )}
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
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title={session?.user?.name || session?.user?.email || 'Se déconnecter'}
            style={{
              backgroundColor: 'transparent', border: `1px solid ${G3}`,
              borderRadius: 6, padding: '7px 12px', color: '#8a9e98',
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span style={{ fontSize: 11 }}>{session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0]}</span>
          </button>
        </div>
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
                {businessType === 'ecommerce' ? 'Panier moyen' : 'Valeur d\'un lead'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NumInput
                  value={basketValue} min={1}
                  onChange={v => update({ basketValue: v })}
                  style={{ ...inputLight, fontWeight: 700, fontSize: 16, textAlign: 'center' }}
                />
                <span style={{ color: ORANGE, fontWeight: 700, fontSize: 16 }}>€</span>
              </div>
            </div>
          </div>

          {/* MOTS CLÉS par catégorie */}
          <div style={{ ...cardLight, padding: '14px 12px' }}>
            <div style={{ ...secTitleLight, marginBottom: 12 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Mots clés
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={downloadTemplate} style={{ backgroundColor: 'transparent', border: `1px solid ${L_BORD}`, borderRadius: 4, padding: '3px 10px', color: L_MED, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ↓ Modèle
                </button>
                <button onClick={() => xlsxInputRef.current?.click()} style={{ backgroundColor: 'transparent', border: `1px solid ${ORANGE}`, borderRadius: 4, padding: '3px 10px', color: ORANGE, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ↑ Importer Excel
                </button>
                <button onClick={addCategory} style={{ backgroundColor: 'transparent', border: `1px solid ${ORANGE}`, borderRadius: 4, padding: '3px 10px', color: ORANGE, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  + Catégorie
                </button>
              </div>
              <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} style={{ display: 'none' }} />
            </div>

            {categories.map((cat, catIdx) => {
              const catKws = keywords.filter(k => k.categoryId === cat.id);
              const isOpen = openCats.has(cat.id);
              return (
                <div key={cat.id} style={{ marginBottom: 8, border: `1px solid ${L_BORD}`, borderRadius: 8, overflow: 'hidden' }}>
                  {/* Category header */}
                  <div
                    onClick={() => toggleCat(cat.id)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '8px 10px', backgroundColor: isOpen ? '#f0ece4' : '#f7f5f0', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, width: '100%' }}>
                      <span style={{ fontSize: 10, color: L_MED, width: 12, flexShrink: 0, paddingTop: 3 }}>{isOpen ? '▼' : '▶'}</span>
                      <textarea
                        value={cat.name}
                        rows={Math.max(1, Math.ceil((cat.name || 'Nouvelle catégorie').length / 28))}
                        onClick={e => e.stopPropagation()}
                        onChange={e => renameCategory(cat.id, e.target.value.replace(/\n/g, ' '))}
                        style={{ width: '100%', minWidth: 0, border: 'none', background: 'transparent', color: L_DARK, fontWeight: 700, fontSize: 13, lineHeight: 1.25, outline: 'none', cursor: 'text', resize: 'none', overflow: 'hidden', padding: 0 }}
                      />
                    </div>
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', paddingLeft: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <NumInput
                          value={catKws.length} min={0}
                          onChange={target => {
                            const diff = target - catKws.length;
                            if (diff > 0) {
                              const newKws = Array.from({ length: diff }, () => ({ id: uid(), keyword: '', volume: 1000, difficulty: 30, proximity: 1 as Proximity, intention: 1 as Intention, topic: '', categoryId: cat.id }));
                              setState(s => ({ ...s, keywords: [...s.keywords, ...newKws] }));
                            } else if (diff < 0) {
                              const toRemove = new Set(catKws.slice(diff).map(k => k.id));
                              setState(s => ({ ...s, keywords: s.keywords.filter(k => !toRemove.has(k.id)) }));
                            }
                          }}
                          style={{ width: 38, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', textAlign: 'center', outline: 'none' }}
                        />
                        <span style={{ fontSize: 10, color: L_MED }}>mots-clés</span>
                      </div>
                      <select
                        value={cat.coeff ?? 1}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateCategoryCoeff(cat.id, Number(e.target.value) as 1 | 2 | 5 | 10 | 20)}
                        style={{ fontSize: 10, border: `1px solid ${L_BORD}`, borderRadius: 3, padding: '2px 4px', background: L_INPUT, color: (cat.coeff ?? 1) > 1 ? ORANGE : L_DARK, fontWeight: (cat.coeff ?? 1) > 1 ? 700 : 400, cursor: 'pointer', outline: 'none' }}
                        title="Coefficient multiplicateur de sortie"
                      >
                        {[1, 2, 5, 10, 20].map(v => <option key={v} value={v}>×{v}</option>)}
                      </select>
                      <button
                        onClick={e => { e.stopPropagation(); addKw(cat.id); }}
                        style={{ background: ORANGE, border: 'none', borderRadius: 3, padding: '2px 7px', color: 'white', fontSize: 10, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >+ Ajouter</button>
                      <button
                        onClick={e => { e.stopPropagation(); removeCategory(cat.id); }}
                        aria-label={`Supprimer la catégorie ${cat.name || 'sans nom'}`}
                        title="Supprimer la catégorie"
                        style={{ background: '#fff6f3', border: `1px solid ${ORANGE}`, borderRadius: 4, color: ORANGE, cursor: 'pointer', padding: '2px 6px', lineHeight: 1.1, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}
                      >Suppr.</button>
                    </div>
                  </div>

                  {/* Keywords table */}
                  {isOpen && (
                    <div style={{ overflowX: 'auto', padding: '4px 10px 8px' }}>
                      {catKws.length === 0 ? (
                        <div style={{ color: L_MED, fontSize: 11, padding: '8px 0', textAlign: 'center' }}>
                          Aucun mot-clé — cliquez sur "+ Ajouter" ou{' '}
                          <button
                            onClick={() => addKw(cat.id)}
                            style={{ background: 'none', border: 'none', color: ORANGE, cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0, textDecoration: 'underline' }}
                          >ajoutez une ligne ici</button>
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ color: L_MED }}>
                              <th style={{ padding: '3px 4px 5px 0', textAlign: 'left' }}>Mot clé</th>
                              <th style={{ padding: '3px 2px 5px', textAlign: 'center', minWidth: 52 }}>Volume mensuel</th>
                              <th style={{ padding: '3px 2px 5px', textAlign: 'center', minWidth: 36 }}>Diff.</th>
                              <th style={{ padding: '3px 2px 5px', textAlign: 'center', minWidth: 88 }}>Proximité</th>
                              <th style={{ padding: '3px 2px 5px', textAlign: 'center', minWidth: 100 }}>Intention</th>
                              <th style={{ padding: '3px 0 5px 2px', textAlign: 'left', minWidth: 66 }}>Sujet</th>
                              <th style={{ width: 18 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {catKws.map(kw => (
                              <tr key={kw.id} style={{ borderTop: `1px solid ${L_BORD}` }}>
                                <td style={{ padding: '4px 4px 4px 0' }}>
                                  <input value={kw.keyword} onChange={e => updateKw(kw.id, 'keyword', e.target.value)} placeholder="mot clé…"
                                    style={{ backgroundColor: 'transparent', border: 'none', color: L_DARK, fontSize: 11, outline: 'none', width: '100%', minWidth: 100 }} />
                                </td>
                                <td style={{ padding: '4px 2px' }}>
                                  <NumInput value={kw.volume} min={0}
                                    onChange={v => updateKw(kw.id, 'volume', v)}
                                    style={{ width: 52, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', textAlign: 'center', outline: 'none' }} />
                                </td>
                                <td style={{ padding: '4px 2px' }}>
                                  <NumInput value={kw.difficulty} min={0} max={100}
                                    onChange={v => updateKw(kw.id, 'difficulty', v)}
                                    style={{ width: 36, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', textAlign: 'center', outline: 'none' }} />
                                </td>
                                <td style={{ padding: '4px 2px' }}>
                                  <select value={kw.proximity} onChange={e => updateKw(kw.id, 'proximity', Number(e.target.value) as Proximity)}
                                    style={{ width: 88, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', outline: 'none', cursor: 'pointer' }}>
                                    <option value={1}>Sujet exact</option>
                                    <option value={2}>Très proche</option>
                                    <option value={3}>Thématique</option>
                                  </select>
                                </td>
                                <td style={{ padding: '4px 2px' }}>
                                  <select value={kw.intention} onChange={e => updateKw(kw.id, 'intention', Number(e.target.value) as Intention)}
                                    style={{ width: 100, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', outline: 'none', cursor: 'pointer' }}>
                                    <option value={1}>Transactionnel</option>
                                    <option value={2}>Pré-achat</option>
                                    <option value={3}>Commerciale</option>
                                    <option value={4}>Informationnel</option>
                                  </select>
                                </td>
                                <td style={{ padding: '4px 2px 4px 4px' }}>
                                  <input value={kw.topic} onChange={e => updateKw(kw.id, 'topic', e.target.value)} placeholder="sujet…"
                                    style={{ backgroundColor: 'transparent', border: 'none', color: L_MED, fontSize: 11, outline: 'none', width: '100%', minWidth: 66 }} />
                                </td>
                                <td style={{ padding: '4px 0', textAlign: 'center' }}>
                                  <button onClick={() => removeKw(kw.id)} style={{ background: 'none', border: 'none', color: '#c05050', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* TAUX DE CONVERSION */}
          <div style={cardLight}>
            <div style={secTitleLight}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Taux de conversion par intention
            </div>
            <Slider light label="Transactionnel" value={crTransactionnel} min={0} max={30} step={0.5} unit="%" onChange={v => update({ crTransactionnel: v })} />
            <Slider light label="Pré-achat" value={crPreAchat} min={0} max={20} step={0.5} unit="%" onChange={v => update({ crPreAchat: v })} />
            <Slider light label="Commerciale" value={crIntermediaire} min={0} max={10} step={0.1} unit="%" onChange={v => update({ crIntermediaire: v })} />
            <Slider light label="Informationnel" value={crInformationnel} min={0} max={5} step={0.1} unit="%" onChange={v => update({ crInformationnel: v })} />
            {businessType === 'lead' && (
              <>
                <div style={{ borderTop: `1px solid ${G3}`, margin: '10px 0 8px', opacity: 0.4 }} />
                <Slider light label="Taux prise de RDV" value={tauxRdv} min={10} max={100} step={5} unit="%" onChange={v => update({ tauxRdv: v })} />
                <Slider light label="Taux closing" value={tauxClosing} min={5} max={100} step={5} unit="%" onChange={v => update({ tauxClosing: v })} />
              </>
            )}
          </div>

          {/* BUDGET */}
          <div style={cardLight}>
            <div style={{ ...secTitleLight, marginBottom: 10 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Accompagnement SEO/GEO
              <button
                onClick={() => update({ budgetCatsHidden: !state.budgetCatsHidden })}
                title={state.budgetCatsHidden ? 'Afficher les thématiques' : 'Masquer les thématiques'}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: L_MED, fontSize: 11, padding: '2px 4px' }}
              >
                {state.budgetCatsHidden ? '▶ détail' : '▲ masquer'}
              </button>
            </div>
            {categories.length === 0 ? (
              <div style={{ color: L_SOFT, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                Ajoutez des catégories pour renseigner les budgets
              </div>
            ) : (
              <>
                {/* Barre de sélection / application en masse */}
                {!budgetCatsHidden && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    id="select-all-cats"
                    checked={selectedCatIds.size === categories.length && categories.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedCatIds.size > 0 && selectedCatIds.size < categories.length; }}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedCatIds(new Set(categories.map(c => c.id)));
                        const avg = Math.round(categories.reduce((s, c) => s + (c.budget ?? 700), 0) / categories.length / 100) * 100;
                        setBulkBudget(String(avg));
                      } else {
                        setSelectedCatIds(new Set());
                        setBulkBudget('');
                      }
                    }}
                    style={{ cursor: 'pointer', accentColor: ORANGE }}
                  />
                  <label htmlFor="select-all-cats" style={{ fontSize: 11, color: L_MED, cursor: 'pointer', userSelect: 'none' }}>
                    {selectedCatIds.size === 0 ? 'Tout sélectionner' : `${selectedCatIds.size} sélectionné${selectedCatIds.size > 1 ? 's' : ''}`}
                  </label>
                  {selectedCatIds.size > 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                      <input
                        type="range"
                        min={0} max={5000} step={100}
                        value={bulkBudget === '' ? 0 : Number(bulkBudget)}
                        onChange={e => {
                          const v = Number(e.target.value);
                          setBulkBudget(String(v));
                          selectedCatIds.forEach(id => updateCategoryBudget(id, v));
                        }}
                        style={{ flex: 1, accentColor: ORANGE, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12, color: ORANGE, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>
                        {bulkBudget === '' ? '–' : `${Number(bulkBudget).toLocaleString('fr-FR')} €`}
                      </span>
                    </div>
                  )}
                </div>

                {categories.map(cat => {
                  const nb  = keywords.filter(k => k.categoryId === cat.id).length;
                  const bpk = nb > 0 ? (cat.budget ?? 700) / nb : (cat.budget ?? 700);
                  const coeff = (bpk / 500) ** 2;
                  const isSelected = selectedCatIds.has(cat.id);
                  return (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          setSelectedCatIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(cat.id);
                              if (prev.size === 0) setBulkBudget(String(cat.budget ?? 700));
                            } else {
                              next.delete(cat.id);
                              if (next.size === 0) setBulkBudget('');
                            }
                            return next;
                          });
                        }}
                        style={{ cursor: 'pointer', accentColor: ORANGE, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <Slider
                          light
                          label={cat.name}
                          value={cat.budget ?? 700}
                          min={0} max={5000} step={100} unit="€"
                          hint={`${nb} kw → ${fmtC(Math.round(bpk))}/kw · coeff ×${coeff.toFixed(2)} ${coeff >= 1 ? '↑' : '↓'}`}
                          onChange={v => updateCategoryBudget(cat.id, v)}
                        />
                      </div>
                    </div>
                  );
                })}
                </>)}
                <div style={{ borderTop: budgetCatsHidden ? 'none' : `1px solid ${L_BORD}`, marginTop: budgetCatsHidden ? 0 : 4, paddingTop: budgetCatsHidden ? 0 : 8 }}>
                  <Slider
                    light
                    label="Total mensuel"
                    value={Math.round(categories.reduce((s, c) => s + (c.budget ?? 700), 0) * (budgetRatio / 100))}
                    min={0}
                    max={Math.max(20000, Math.round(categories.reduce((s, c) => s + (c.budget ?? 700), 0) * (budgetRatio / 100) * 2 / 1000) * 1000)}
                    step={100}
                    unit="€"
                    hint="Répartition proportionnelle entre les thématiques"
                    bold
                    onChange={targetTotal => {
                      if (categories.length === 0) return;
                      const rawSum = categories.reduce((s, c) => s + (c.budget ?? 700), 0);
                      const targetRawSum = budgetRatio > 0 ? targetTotal / (budgetRatio / 100) : 0;
                      if (rawSum === 0) {
                        const equal = Math.round(targetRawSum / categories.length / 100) * 100;
                        setState(s => ({ ...s, categories: s.categories.map(c => ({ ...c, budget: equal })) }));
                      } else {
                        setState(s => ({ ...s, categories: s.categories.map(c => ({
                          ...c,
                          budget: Math.round((c.budget ?? 700) / rawSum * targetRawSum / 100) * 100,
                        })) }));
                      }
                    }}
                  />
                </div>
              </>
            )}
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
                {prospectName || "Nom de l'entreprise"}
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
                CA Prévisionnel / An
              </div>
              <div style={{ color: ORANGE, fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtC(totals.totalCA * 12)}
              </div>
              <div style={{ color: '#5a7a6a', fontSize: 12, marginTop: 8 }}>
                à partir de 12 mois de prestation
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', gap: 10 }}>
              <div style={{
                flex: 1, backgroundColor: G5, borderRadius: 12, padding: '24px 22px',
                border: `1px solid ${G3}`,
              }}>
                <div style={{ color: '#7a9e8e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  ROI à 1 an
                </div>
                <div style={{ color: CREAM, fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  ×{totals.roiMult1an.toFixed(1)}
                </div>
                <div style={{ color: '#5a7a6a', fontSize: 12, marginTop: 8 }}>
                  +{fmtN(totals.roi1an)}% sur investissement à 1 an
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
          </div>

          {/* BLOC 2 — SECONDARY KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <KPICard label="Trafic organique / mois" value={fmtN(totals.totalTraffic)} />
            <KPICard label={businessType === 'ecommerce' ? 'CPA' : 'Leads / mois (à 12 mois)'} value={businessType === 'ecommerce' && totals.budgetMensuel > 0 && totals.totalLeads > 0 ? fmtC(Math.round(totals.budgetMensuel / totals.totalLeads)) : fmtLeads(totals.totalLeads)} />
            <KPICard label="Sujets clés à traiter" value={`${totals.nbPages}`} />
            <KPICard label="Budget mensuel" value={fmtC(totals.budgetMensuel)} accent />
          </div>

          {/* BLOC 3 — FUNNEL */}
          <div style={card}>
            <div style={{ ...secTitle, marginBottom: 6 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Entonnoir de conversion
              {/* Business type toggle */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {(['ecommerce', 'lead'] as const).map(t => (
                  <button key={t} onClick={() => update({ businessType: t })} style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${businessType === t ? ORANGE : G3}`,
                    backgroundColor: businessType === t ? `${ORANGE}22` : 'transparent',
                    color: businessType === t ? ORANGE : '#5a7a6a',
                  }}>{t === 'ecommerce' ? 'E-commerce' : 'Lead'}</button>
                ))}
              </div>
            </div>
            {/* Period toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['month', 'year'] as const).map(p => (
                <button key={p} onClick={() => setFunnelPeriod(p)} style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 14px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${funnelPeriod === p ? '#3b82f6' : G3}`,
                  backgroundColor: funnelPeriod === p ? '#3b82f622' : 'transparent',
                  color: funnelPeriod === p ? '#3b82f6' : '#5a7a6a',
                }}>{p === 'month' ? '/ Mois' : '/ An'}</button>
              ))}
            </div>
            {(() => {
              const { totalImpressions: imp, totalTraffic: traf, baseLeads, baseRdv, baseClosing, totalCA } = totals;
              const mult = funnelPeriod === 'year' ? 12 : 1;
              const caLabel = funnelPeriod === 'year' ? 'CA / an' : 'CA / mois';
              if (businessType === 'lead') {
                return (
                  <ConversionFunnel
                    stages={[
                      { label: 'Impressions',   value: fmtN(imp * mult),               active: true },
                      { label: 'Clics',          value: fmtN(traf * mult),              active: true },
                      { label: 'Leads',          value: fmtLeads(baseLeads * mult),   active: true },
                      { label: 'Prise de RDV',   value: fmtLeads(baseRdv * mult),     active: true },
                      { label: 'Closing',        value: fmtLeads(baseClosing * mult), active: true },
                      { label: caLabel,          value: fmtC(totalCA * mult),           active: true },
                    ]}
                    rates={[
                      imp   > 0 ? `↓ ${fmtP(traf / imp * 100)}`         : '—',
                      traf  > 0 ? `↓ ${fmtP(baseLeads / traf * 100)}`   : '—',
                      `↓ ${tauxRdv}%`,
                      `↓ ${tauxClosing}%`,
                      `× ${basketValue}€`,
                    ]}
                  />
                );
              }
              return (
                <ConversionFunnel
                  stages={[
                    { label: 'Impressions',  value: fmtN(imp * mult),            active: true },
                    { label: 'Clics',        value: fmtN(traf * mult),           active: true },
                    { label: 'Transactions', value: fmtLeads(baseLeads * mult), active: true },
                    { label: caLabel,        value: fmtC(totalCA * mult),        active: true },
                  ]}
                  rates={[
                    imp  > 0 ? `↓ ${fmtP(traf / imp * 100)}`        : '—',
                    traf > 0 ? `↓ ${fmtP(baseLeads / traf * 100)}`  : '—',
                    `× ${basketValue}€`,
                  ]}
                />
              );
            })()}
            {/* CPL summary */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {([
                { label: `${businessType === 'ecommerce' ? 'CPA' : 'CPL'} an 1`, value: cpl.an1 },
                { label: `${businessType === 'ecommerce' ? 'CPA' : 'CPL'} an 2`, value: cpl.an2 },
                { label: `${businessType === 'ecommerce' ? 'CPA' : 'CPL'} an 3`, value: cpl.an3 },
              ] as { label: string; value: number }[]).map(({ label, value }) => (
                <div key={label} style={{ flex: 1, minWidth: 80, background: G5, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ color: '#5a7a6a', fontSize: 10, marginBottom: 2 }}>{label}</div>
                  <div style={{ color: ORANGE, fontWeight: 700, fontSize: 16 }}>{fmtC(value)}</div>
                </div>
              ))}
            </div>
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

          {/* BLOC 4b — LEADS PAR MOIS */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...secTitle, marginBottom: 10 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> {businessType === 'ecommerce' ? 'Évolution du CPA (coût d\'acquisition)' : 'Leads captés par mois'} — 12 mois
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyData} margin={{ top: 8, right: 48, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={G3} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#7a9e8e', fontSize: 11 }} axisLine={{ stroke: G3 }} tickLine={false} />
                <YAxis yAxisId="leads" tick={{ fill: '#7a9e8e', fontSize: 10 }} axisLine={{ stroke: G3 }} tickLine={false} width={30} allowDecimals={false} tickFormatter={v => Math.round(v).toString()} />
                <YAxis yAxisId="cpl" orientation="right" tick={{ fill: '#7a9e8e', fontSize: 10 }} axisLine={false} tickLine={false} width={46}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: G2, border: `1px solid ${G3}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: CREAM, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      {payload.map((p, idx) => p.dataKey === 'leads'
                        ? <div key={idx} style={{ color: ORANGE }}>{p.value} {businessType === 'ecommerce' ? `vente${Number(p.value) > 1 ? 's' : ''}` : `lead${Number(p.value) > 1 ? 's' : ''}`}</div>
                        : p.value != null ? <div key={idx} style={{ color: '#a8c5b5' }}>{businessType === 'ecommerce' ? 'CPA' : 'CPL'} : {p.value} €</div> : null
                      )}
                    </div>
                  ) : null}
                />
                <Bar yAxisId="leads" dataKey="leads" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={36} name={businessType === 'ecommerce' ? 'Ventes' : 'Leads'} />
                <Line yAxisId="cpl" dataKey="cplMonth" stroke="#a8c5b5" strokeWidth={2} dot={false} name={businessType === 'ecommerce' ? 'CPA' : 'CPL'} connectNulls={false} />
                {breakEvenMonth && (
                  <ReferenceLine yAxisId="leads" x={breakEvenMonth} stroke={ORANGE} strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: 'Break-even', fill: ORANGE, fontSize: 10, position: 'insideTopRight' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* BLOC 4c — MONTÉE EN PUISSANCE */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...secTitle, marginBottom: 4 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Montée en puissance SEO/GEO — 1ère année
            </div>
            <div style={{ color: '#5a7a6a', fontSize: 11, marginBottom: 12 }}>
              Les premiers résultats apparaissent à partir du 4ème mois (indexation + premières positions), avec une accélération à 6 mois.
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={RAMP_UP_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={G3} vertical={false} />
                <XAxis dataKey="mois" tick={{ fill: '#7a9e8e', fontSize: 11 }} axisLine={{ stroke: G3 }} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: G2, border: `1px solid ${G3}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: CREAM, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: ORANGE }}>{payload[0].value}% du potentiel</div>
                    </div>
                  ) : null}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {RAMP_UP_DATA.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i < 3 ? G4 : i < 6 ? `${ORANGE}bb` : ORANGE}
                    />
                  ))}
                </Bar>
                <ReferenceLine x="M4" stroke={ORANGE} strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: 'Premiers résultats', fill: ORANGE, fontSize: 9, position: 'insideTopRight' }} />
                <ReferenceLine x="M6" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: 'Accélération', fill: '#3b82f6', fontSize: 9, position: 'insideTopRight' }} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: '#5a7a6a' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: G4, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />M1–M3 : Production & indexation</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: `${ORANGE}bb`, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />M4–M6 : Premiers résultats</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: ORANGE, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />M7–M12 : Consolidation</span>
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
                    {[
                      { label: 'Mot clé / Sujet', align: 'left'   },
                      { label: 'Volume',           align: 'right'  },
                      { label: 'Diff.',            align: 'center' },
                      { label: 'Position',         align: 'center' },
                      { label: 'CTR',              align: 'center' },
                      { label: 'Trafic / mois',    align: 'right'  },
                      { label: businessType === 'ecommerce' ? 'Ventes / mois' : 'Leads / mois', align: 'right' },
                      { label: 'CA / mois',        align: 'right'  },
                      { label: 'Intention',        align: 'center' },
                    ].map(({ label, align }) => (
                      <th key={label} style={{
                        padding: '6px 8px',
                        textAlign: align as 'left' | 'right' | 'center',
                        color: '#5a7a6a', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10,
                      }}>{label}</th>
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
                      <td style={{ padding: '8px', textAlign: 'right', color: '#a8c5b5' }}>{fmtN(kw.volume)}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#a8c5b5' }}>{kw.difficulty}</td>
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
                    <td></td>
                    <td></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{fmtN(totals.totalTraffic)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{fmtLeads(totals.totalLeads)}</td>
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

              {/* Colonne gauche : données site + budget + mots-clés + saisonnalité */}
              <div>

                {/* Site & scores */}
                <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Données du site
                </div>
                {([
                  ['Autorité du domaine (DA)', `${da} / 100`],
                  ['Score de vitalité Semrush', `${healthScore} / 100 → coeff. ${coeffSante}`],
                  [businessType === 'ecommerce' ? 'Panier moyen' : 'Valeur d\'un lead', fmtC(basketValue)],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${G3}` }}>
                    <span style={{ color: '#7a9e8e', fontSize: 11 }}>{label}</span>
                    <span style={{ color: CREAM, fontSize: 11, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}

                {/* Budget par thématique */}
                <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 12, marginBottom: 6 }}>
                  Budget mensuel ({budgetRatio}% alloué)
                </div>
                {categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${G3}` }}>
                    <span style={{ color: '#7a9e8e', fontSize: 11 }}>{cat.name}</span>
                    <span style={{ color: CREAM, fontSize: 11, fontWeight: 600 }}>{fmtC(Math.round((cat.budget ?? 700) * (budgetRatio / 100)))}<span style={{ color: '#5a7a6a', fontWeight: 400 }}> /mois</span></span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', marginTop: 2 }}>
                  <span style={{ color: ORANGE, fontSize: 12, fontWeight: 700 }}>Total mensuel</span>
                  <span style={{ color: ORANGE, fontSize: 13, fontWeight: 700 }}>{fmtC(totals.budgetMensuel)}<span style={{ fontSize: 10, fontWeight: 400 }}> /mois</span></span>
                </div>

                {/* Mots-clés par thématique */}
                <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 12, marginBottom: 6 }}>
                  Mots-clés ({keywords.length} au total)
                </div>
                {categories.map(cat => {
                  const catKws = keywords.filter(k => k.categoryId === cat.id);
                  return (
                    <div key={cat.id} style={{ marginBottom: 8 }}>
                      <div style={{ color: ORANGE, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{cat.name} <span style={{ color: '#5a7a6a', fontWeight: 400 }}>({catKws.length})</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
                        {catKws.map(kw => (
                          <span key={kw.id} style={{ color: '#a8c5b5', fontSize: 10, backgroundColor: G3, borderRadius: 3, padding: '1px 5px' }}>{kw.keyword}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Saisonnalité */}
                {seasonalityEnabled && (
                  <div style={{ marginTop: 8, padding: '6px 10px', backgroundColor: `${ORANGE}22`, borderRadius: 5 }}>
                    <div style={{ color: '#5a7a6a', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Saisonnalité</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: ORANGE, fontSize: 11 }}>Multiplicateur haute saison</span>
                      <span style={{ color: ORANGE, fontSize: 11, fontWeight: 600 }}>×{highSeasonMultiplier}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ color: ORANGE, fontSize: 11 }}>Démarrage</span>
                      <span style={{ color: ORANGE, fontSize: 11, fontWeight: 600 }}>{MONTH_NAMES[startMonth]}</span>
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {MONTH_NAMES.map((m, i) => (
                        <span key={i} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, backgroundColor: highSeasonMonths[i] ? ORANGE : G3, color: highSeasonMonths[i] ? 'white' : '#5a7a6a' }}>{m.slice(0, 3)}</span>
                      ))}
                    </div>
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
                  ['Commerciale',    `${crIntermediaire}%`,  INTENT_COLOR[3]],
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
                      ['Budget/mois', fmtC(totals.budgetMensuel)],
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

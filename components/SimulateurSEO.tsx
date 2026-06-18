'use client';

import { useState, useMemo, useRef, useEffect, CSSProperties } from 'react';
import { useSession, signOut } from 'next-auth/react';
import * as XLSX from 'xlsx';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
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

type Zone = 'chalandise' | 'france';

interface Keyword {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  proximity: Proximity;
  intention: Intention;
  topic: string;
  categoryId: string;
  zone: Zone;
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
  chalandisePercent: number;
  breakEvenMode: 'mensuel' | 'cumule';
}

/* ─── CONSTANTS ──────────────────────────────────────────────── */
const CTR_TABLE: Record<number, number> = {
  1: 0.296, 2: 0.168, 3: 0.120, 4: 0.094, 5: 0.073,
  6: 0.059, 7: 0.049, 8: 0.043, 9: 0.037, 10: 0.034, 11: 0,
};

// Linear interpolation of CTR between two integer ranks, for a continuous
// (non-rounded) position. Used to detect small budget-driven ranking gains
// that a rounded position comparison would mask as zero.
function interpolateCTR(rawPos: number): number {
  const clamped = Math.min(Math.max(rawPos, 1), 11);
  const lower = Math.floor(clamped);
  const upper = Math.ceil(clamped);
  if (lower === upper) return CTR_TABLE[lower] ?? 0;
  const frac = clamped - lower;
  return (CTR_TABLE[lower] ?? 0) + ((CTR_TABLE[upper] ?? 0) - (CTR_TABLE[lower] ?? 0)) * frac;
}

const INTENT_LABEL: Record<number, string> = {
  1: 'Transactionnel', 2: 'Navigationnelle', 3: 'Commerciale', 4: 'Informationnel',
};

const INTENT_COLOR: Record<number, string> = {
  1: '#e8571a', 2: '#f59e0b', 3: '#3b82f6', 4: '#6b7280',
};

// Exact-match priority weight applied to keyword proximity (1 = exact match,
// 2 = very close, 3 = thematic). Harder-to-attribute keywords cost more budget.
const PROX_FACTOR: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 3.0 };

// Budget → position model (continuous position, 1 = best, 11 = off the top 10).
//
// Calibration — reference keyword: difficulty == site DA, proximity "exact",
// a single funded keyword in its category, neutral health score (60).
// The budget thresholds below are the base calibration (500 € → top 10, then
// 300 € halving steps) divided by BUDGET_IMPACT to make budget more impactful:
//   • each 0.5^step still halves the remaining distance to position 1:
//         pos(n+1) = (1 + pos(n)) / 2
//     → closed form  pos = 1 + 9 · 0.5^((budget − BUDGET_TOP10) / BUDGET_HALVING_STEP).
//
// Difficulty (relative to DA), proximity, site health and topical-cluster
// synergy only scale HOW MUCH budget is required to travel along that curve —
// they never change its shape, so budget always remains the visible driver.
const BUDGET_IMPACT       = 8;    // ×8 budget impact: divides the budget thresholds below
const BUDGET_TOP10        = 500 / BUDGET_IMPACT; // € — cumulative budget to enter the top 10
const BUDGET_HALVING_STEP = 300 / BUDGET_IMPACT; // € — extra budget that halves the distance to pos 1
const DIFFICULTY_EXP      = 1.9;  // sensitivity of budget needs to the difficulty / DA ratio
const ACCEL_PER_KW        = 0.5;  // cluster synergy: budget discount per extra funded keyword
const MAX_CLUSTER_SYNERGY = 2.5;  // cap on the topical-authority budget discount
const REF_HEALTH_SCORE    = 60;   // health score at which the calibration above holds exactly

function computePosRaw(
  cumBudget: number,
  difficulty: number,
  da: number,
  proximity: number,
  nbActiveInCat: number,
  coeffSante: number,
): number {
  if (cumBudget <= 0 || da <= 0) return 100;

  // Harder keywords (relative to the site authority) and broad-match keywords
  // need proportionally more budget to reach the same position.
  const difficultyFactor = Math.pow(difficulty / da, DIFFICULTY_EXP) * (PROX_FACTOR[proximity] ?? 1);

  // Favourable factors make ranking cheaper: a healthy site and a well-covered
  // topical cluster (several funded keywords in the category) both help.
  const healthFactor  = coeffSante / Math.max(0.01, computeHealthCoeff(REF_HEALTH_SCORE));
  const clusterFactor = Math.min(MAX_CLUSTER_SYNERGY, 1 + ACCEL_PER_KW * Math.max(0, nbActiveInCat - 1));

  // Budget thresholds for THIS keyword, scaled from the reference calibration.
  const scale = difficultyFactor / Math.max(0.01, healthFactor * clusterFactor);
  const top10 = BUDGET_TOP10 * scale;
  const step  = BUDGET_HALVING_STEP * scale;

  const n = (cumBudget - top10) / step;
  return 1 + 9 * Math.pow(0.5, n);
}

// Piecewise-linear coefficient from the Semrush Health Score:
// 0-50  → +0.014 per point
// 51-70 → +0.009 per point
// 71-100 → +0.004 per point
function computeHealthCoeff(score: number): number {
  const s = Math.min(Math.max(score, 0), 100);
  if (s <= 50) return s * 0.014;
  if (s <= 70) return 0.7 + (s - 50) * 0.009;
  return 0.88 + (s - 70) * 0.004;
}

const DEFAULT_KEYWORDS: Keyword[] = [
  { id: '1', keyword: 'acheter graines tomates',   volume: 2400, difficulty: 35, proximity: 1, intention: 1, topic: 'Graines tomates', categoryId: 'cat1', zone: 'chalandise' },
  { id: '2', keyword: 'meilleures graines potager', volume: 1800, difficulty: 42, proximity: 2, intention: 2, topic: 'Graines potager', categoryId: 'cat1', zone: 'chalandise' },
  { id: '3', keyword: 'semences bio pas cher',      volume: 3200, difficulty: 38, proximity: 1, intention: 1, topic: 'Semences bio',    categoryId: 'cat1', zone: 'chalandise' },
  { id: '4', keyword: 'comment semer des fleurs',   volume: 5400, difficulty: 25, proximity: 3, intention: 4, topic: 'Guide semis',     categoryId: 'cat2', zone: 'chalandise' },
  { id: '5', keyword: 'graines de courge',           volume: 2100, difficulty: 30, proximity: 2, intention: 2, topic: 'Graines courge',  categoryId: 'cat1', zone: 'chalandise' },
  { id: '6', keyword: 'jardinerie en ligne',         volume: 8900, difficulty: 65, proximity: 3, intention: 1, topic: 'Jardinerie',      categoryId: 'cat2', zone: 'chalandise' },
];

// Effective monthly volume after applying the catchment-area correction:
// "chalandise" keywords keep 100% of their volume, "france" keywords are
// scaled down to the share of the French population actually concerned.
function getEffectiveVolume(kw: Keyword, chalandisePercent: number): number {
  return kw.zone === 'france' ? kw.volume * (chalandisePercent / 100) : kw.volume;
}

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
  chalandisePercent: 100,
  breakEvenMode: 'mensuel',
};

/* ─── PALETTE ────────────────────────────────────────────────── */
const G  = '#1a2e25';
const G2 = '#142218';
const G3 = '#2d4a3e';
const G4 = '#3a5c4e';
const G5 = '#233d30';
const CREAM  = '#f5f0e8';
const ORANGE = '#e8571a';
const SEO_CLR = '#4fc3d6'; // bright teal for the SEO series — readable on the dark card

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
const CHART_SERIES_LABEL: Record<string, string> = {
  budget: 'Budget mensuel', ca: 'CA mensuel',
  budgetCumule: 'Budget cumulé', caCumule: 'CA cumulé',
};

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: G2, border: `1px solid ${G3}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: CREAM }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span style={{ color: p.color }}>{CHART_SERIES_LABEL[p.name] ?? p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmtC(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */

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
  const [expandedKws, setExpandedKws] = useState<Set<string>>(new Set());
  const [budgetTooltipKwId, setBudgetTooltipKwId] = useState<string | null>(null);
  const toggleKwExpand = (id: string) => setExpandedKws(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [workspaces, setWorkspaces]   = useState<{ id: string; name: string; role: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const resultsRef  = useRef<HTMLDivElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  /* Unsaved-changes tracking — skipDirtyRef ignores state changes caused by
     the initial load (URL/report fetch) so only real user edits count. */
  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    setIsDirty(true);
  }, [state]);

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
    chalandisePercent, breakEvenMode,
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
      keywords: (s.keywords ?? []).map(k => ({ ...k, zone: k.zone ?? 'chalandise' })),
      chalandisePercent: s.chalandisePercent ?? 100,
      breakEvenMode: s.breakEvenMode ?? 'mensuel',
    });
    if (data) {
      try { skipDirtyRef.current = true; setState(migrate(decodeState(data))); } catch { /* ignore */ }
    } else if (report) {
      setReportId(report);
      fetch(`/api/reports/${report}`)
        .then(r => r.json())
        .then(({ stateB64 }) => { if (stateB64) { skipDirtyRef.current = true; setState(migrate(decodeState(stateB64))); } })
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

  /* Keep a live ref to reportId so the engagement tracker below doesn't need to restart
     (and lose its pending counters) every time a report gets saved/loaded */
  const reportIdRef = useRef<string | null>(null);
  useEffect(() => { reportIdRef.current = reportId; }, [reportId]);

  /* Track time spent + interactions for the whole session (periodic heartbeat + flush on
     leave), as soon as the user is logged in — whether or not a report is open/saved.
     When a report is open, the same numbers are also added to that report's totals. */
  useEffect(() => {
    if (!session?.user?.id) return;
    let lastTick = Date.now();
    let pendingInteractions = 0;

    const onInteraction = () => { pendingInteractions++; };
    document.addEventListener('click', onInteraction);
    document.addEventListener('input', onInteraction);

    const post = (url: string, body: string, useBeacon: boolean) => {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => { /* ignore */ });
      }
    };

    const flush = (useBeacon: boolean) => {
      const now = Date.now();
      const seconds = document.visibilityState === 'visible' ? Math.round((now - lastTick) / 1000) : 0;
      lastTick = now;
      const interactions = pendingInteractions;
      pendingInteractions = 0;
      if (seconds <= 0 && interactions === 0) return;

      const body = JSON.stringify({ seconds, interactions });
      post('/api/users/me/engagement', body, useBeacon);
      if (reportIdRef.current) post(`/api/reports/${reportIdRef.current}/engagement`, body, useBeacon);
    };

    const interval = setInterval(() => flush(false), 30000);
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', () => flush(true));

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('input', onInteraction);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush(true);
    };
  }, [session?.user?.id]);

  /* Budget allocation per keyword over 12 months (sudoku-style) */
  const kwAllocations = useMemo(() => {
    const CHUNK = 100; // € per allocation step
    const MAX_CTR_PROPOSAL = 5000; // € — max extra monthly budget tested for next CTR step
    const coeffSante = Math.max(0.01, computeHealthCoeff(healthScore));

    // Per-category: budget (scaled by budgetRatio), keyword count, coeff
    const catBudget: Record<string, number> = {};
    const catNbKws:  Record<string, number> = {};
    const catCoeff:  Record<string, number> = {};
    categories.forEach(cat => {
      catBudget[cat.id] = (cat.budget ?? 700) * (budgetRatio / 100);
      catNbKws[cat.id]  = 0;
      catCoeff[cat.id]  = cat.coeff ?? 1;
    });
    keywords.forEach(kw => { if (catNbKws[kw.categoryId] !== undefined) catNbKws[kw.categoryId]++; });

    // Compute posRaw for a keyword given its individual cumulative budget and
    // how many keywords in its category currently have budget activated
    const getPosRaw = (kw: Keyword, cumBudget: number, nbActiveInCat: number): number =>
      computePosRaw(cumBudget, kw.difficulty, da, kw.proximity, nbActiveInCat, coeffSante);
    const getPos = (raw: number) => Math.min(Math.max(Math.round(raw), 1), 11);

    // Potential = Volume × cr[intention] × proximityWeight × ΔCTR / difficulty²
    // Proximity weight prioritizes exact-match keywords over thematic ones
    // (proximity 1=exact, 2=très proche, 3=thématique → weight 3, 2, 1)
    const POTENTIAL_PROX_WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
    // Gain réel obtenu en ajoutant CHUNK au budget cumulé : compare la position
    // actuelle à la position après ajout du chunk, plutôt qu'un gain théorique
    // vers la position-1 qui peut ne jamais être atteinte (budget gaspillé sans effet).
    const getPotential = (kw: Keyword, cumBudget: number, nbActiveInCat: number, budgetDelta = CHUNK): number => {
      const rawPos = getPosRaw(kw, cumBudget, nbActiveInCat);
      if (rawPos <= 1) return 0; // already at best position
      // Use continuous (non-rounded) positions for the gain so that a single
      // CHUNK of budget still registers a (small) improvement even when it
      // isn't enough to cross an integer rank boundary — otherwise the
      // allocation loop sees gain=0 for every keyword and stops allocating
      // budget entirely.
      const rawPosAfter = getPosRaw(kw, cumBudget + budgetDelta, nbActiveInCat);
      const gain = interpolateCTR(rawPosAfter) - interpolateCTR(rawPos);
      if (gain <= 0) return 0;
      const crVal = cr[kw.intention as Intention]; // already in %
      const diff2 = (kw.difficulty || 1) * (kw.difficulty || 1);
      const proxWeight = POTENTIAL_PROX_WEIGHT[kw.proximity] ?? 1;
      return getEffectiveVolume(kw, chalandisePercent) * crVal * proxWeight * gain / diff2;
    };

    // Initialize per-keyword tracking
    const kwBudgetPerMonth: Record<string, number[]> = {};
    const kwCumBudget:      Record<string, number>   = {};
    const kwFirstMonth:     Record<string, number | null> = {};
    const catActiveCount:   Record<string, number>   = {};
    const catActiveCountPerMonth: Record<string, number[]> = {};
    const catSpent:         Record<string, number>   = {};
    const catNextCtrIncrease: Record<string, number | null> = {};
    keywords.forEach(kw => {
      kwBudgetPerMonth[kw.id] = Array(12).fill(0);
      kwCumBudget[kw.id]      = 0;
      kwFirstMonth[kw.id]     = null;
    });
    categories.forEach(cat => {
      catActiveCount[cat.id]        = 0;
      catActiveCountPerMonth[cat.id] = Array(12).fill(0);
      catSpent[cat.id]              = 0;
      catNextCtrIncrease[cat.id]     = null;
    });

    // 12-month allocation loop
    for (let m = 0; m < 12; m++) {
      // Allocate each category's monthly budget in CHUNK-€ increments
      categories.forEach(cat => {
        const monthly = catBudget[cat.id] ?? 0;
        if (monthly <= 0) return;
        const catKws = keywords.filter(kw => kw.categoryId === cat.id);
        if (catKws.length === 0) return;

        let remaining = monthly;
        while (remaining > 0) {
          const baseChunk = Math.min(CHUNK, remaining);
          const nbActiveInCat = Math.max(1, catActiveCount[cat.id]);
          // Find keyword with highest potential. If 100€ has no CTR effect,
          // retry with 200€, 300€... up to the remaining monthly budget.
          let bestKw: Keyword | null = null;
          let bestPot = -Infinity;
          let bestChunk = baseChunk;
          for (let testedChunk = baseChunk; testedChunk <= remaining; testedChunk += CHUNK) {
            for (const kw of catKws) {
              const pot = getPotential(kw, kwCumBudget[kw.id], nbActiveInCat, testedChunk);
              if (pot > bestPot) { bestPot = pot; bestKw = kw; bestChunk = testedChunk; }
            }
            if (bestPot > 0) break;
          }

          if (!bestKw || bestPot <= 0) {
            // Budget limit reached without CTR movement: propose the smallest
            // discrete monthly increase that would trigger the next CTR step.
            for (let testedChunk = remaining + CHUNK; testedChunk <= remaining + MAX_CTR_PROPOSAL; testedChunk += CHUNK) {
              let hasCtrStep = false;
              for (const kw of catKws) {
                if (getPotential(kw, kwCumBudget[kw.id], nbActiveInCat, testedChunk) > 0) {
                  hasCtrStep = true;
                  break;
                }
              }
              if (hasCtrStep) {
                catNextCtrIncrease[cat.id] = testedChunk - remaining;
                break;
              }
            }
            break;
          }

          const wasInactive = kwCumBudget[bestKw.id] === 0;
          kwCumBudget[bestKw.id]          += bestChunk;
          kwBudgetPerMonth[bestKw.id][m]  += bestChunk;
          catSpent[cat.id]                += bestChunk;
          if (kwFirstMonth[bestKw.id] === null) kwFirstMonth[bestKw.id] = m;
          if (wasInactive) catActiveCount[cat.id]++;
          remaining -= bestChunk;
        }
      });
      // Snapshot active-keyword count per category at the end of month m
      categories.forEach(cat => { catActiveCountPerMonth[cat.id][m] = catActiveCount[cat.id]; });
    }

    // Build result map
    const result: Record<string, {
      budgetPerMonth: number[];
      cumulativePerMonth: number[];
      firstMonthIdx: number | null;
      totalBudget: number;
      catCoeff: number;
      nbKwsInCat: number;
      activeKwsPerMonth: number[];
      totalActiveKws: number;
      nextCtrMonthlyIncrease: number | null;
    }> = {};
    keywords.forEach(kw => {
      const bpm = kwBudgetPerMonth[kw.id];
      const cpm = bpm.reduce<number[]>((acc, b) => {
        acc.push((acc[acc.length - 1] ?? 0) + b);
        return acc;
      }, []);
      const activeKwsPerMonth = catActiveCountPerMonth[kw.categoryId] ?? Array(12).fill(1);
      result[kw.id] = {
        budgetPerMonth:     bpm,
        cumulativePerMonth: cpm,
        firstMonthIdx:      kwFirstMonth[kw.id],
        activeKwsPerMonth,
        totalActiveKws:     activeKwsPerMonth[11] ?? 1,
        totalBudget:        cpm[11] ?? 0,
        nextCtrMonthlyIncrease: catNextCtrIncrease[kw.categoryId] ?? null,
        catCoeff:           catCoeff[kw.categoryId] ?? 1,
        nbKwsInCat:         catNbKws[kw.categoryId] ?? 1,
      };
    });
    return result;
  }, [keywords, categories, da, healthScore, budgetRatio, crTransactionnel, crPreAchat, crIntermediaire, crInformationnel, chalandisePercent]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Per-keyword results */
  const kwResults = useMemo(() => {
    const coeffSante = Math.max(0.01, computeHealthCoeff(healthScore));

    return keywords.map(kw => {
      const alloc    = kwAllocations[kw.id];
      const coeff    = alloc?.catCoeff ?? 1;
      const totalBudget = alloc?.totalBudget ?? 0;

      // Position at M+12 (full year cumulative budget + active-keyword synergy)
      const totalActiveKws = alloc?.totalActiveKws ?? 1;
      const posRaw = computePosRaw(totalBudget, kw.difficulty, da, kw.proximity, totalActiveKws, coeffSante);
      const pos    = Math.min(Math.max(Math.round(posRaw), 1), 11);

      // Monthly positions based on actual cumulative budget + active-keyword count at each month
      const activeKwsPerMonth = alloc?.activeKwsPerMonth ?? Array(12).fill(1);
      const monthlyPos = (alloc?.cumulativePerMonth ?? Array(12).fill(0)).map((cumBudget, i) => {
        if (cumBudget === 0) return 11;
        const pr = computePosRaw(cumBudget, kw.difficulty, da, kw.proximity, activeKwsPerMonth[i] ?? 1, coeffSante);
        return Math.min(Math.max(Math.round(pr), 1), 11);
      });

      const baseCtr = CTR_TABLE[pos] ?? 0;
      const ctr     = baseCtr * (budgetRatio / 100);
      const traffic = getEffectiveVolume(kw, chalandisePercent) * ctr * coeff;
      const leads   = traffic * (cr[kw.intention as Intention] / 100);
      const leadConv = businessType === 'lead' ? (tauxRdv / 100) * (tauxClosing / 100) : 1;
      const ca      = leads * basketValue * leadConv;

      return {
        ...kw, pos, monthlyPos, ctr, traffic, leads, ca, coeff,
        allocatedBudget: totalBudget,
        firstMonth: alloc?.firstMonthIdx !== null && alloc?.firstMonthIdx !== undefined
          ? alloc.firstMonthIdx + 1 : null,
        budgetPerMonth: alloc?.budgetPerMonth ?? Array(12).fill(0),
        nextCtrMonthlyIncrease: alloc?.nextCtrMonthlyIncrease ?? null,
      };
    });
  }, [kwAllocations, keywords, da, healthScore, basketValue, crTransactionnel, crPreAchat, crIntermediaire, crInformationnel, budgetRatio, businessType, tauxRdv, tauxClosing, chalandisePercent]);

  /* Monthly projection — computed directly from per-keyword monthly positions */
  const { monthlyData, breakEvenMonth } = useMemo(() => {
    const monthlyBudget = categories.reduce((s, c) => s + (c.budget ?? 700), 0) * (budgetRatio / 100);
    const leadConv = businessType === 'lead' ? (tauxRdv / 100) * (tauxClosing / 100) : 1;

    let bev = -1;
    let cumBudget = 0;
    let cumCA = 0;
    const data = Array.from({ length: 12 }, (_, i) => {
      const calMonth = (startMonth + i) % 12;
      const label = seasonalityEnabled ? MONTH_NAMES[calMonth] : `M${i + 1}`;
      const seasonal = seasonalityEnabled && highSeasonMonths[calMonth] ? highSeasonMultiplier : 1;

      // Sum across all keywords using their actual position at month i
      let traffic = 0, leads = 0, ca = 0;
      kwResults.forEach(kw => {
        const pm   = kw.monthlyPos[i];
        const ctrM = (CTR_TABLE[pm] ?? 0) * (budgetRatio / 100);
        const t    = getEffectiveVolume(kw, chalandisePercent) * ctrM * kw.coeff * seasonal;
        const l    = t * (cr[kw.intention as Intention] / 100);
        traffic += t;
        leads   += l;
        ca      += l * basketValue * leadConv;
      });

      // kwMultiplier scales "mots clés avec budget activé" → equivalent to scaling all
      // since keywords without budget contribute 0 (pos 11, CTR 0)
      traffic *= kwMultiplier;
      leads   *= kwMultiplier;
      ca      *= kwMultiplier;

      cumBudget += monthlyBudget;
      cumCA     += ca;

      if (bev === -1) {
        const reached = breakEvenMode === 'cumule' ? cumCA >= cumBudget : ca >= monthlyBudget;
        if (reached) bev = i + 1;
      }
      const cplMonth = leads > 0.5 ? Math.round(monthlyBudget / leads) : null;
      return {
        month: label,
        budget: Math.round(monthlyBudget),
        ca: Math.round(ca),
        budgetCumule: Math.round(cumBudget),
        caCumule: Math.round(cumCA),
        leads: Math.round(leads),
        traffic: Math.round(traffic),
        cplMonth,
        isBev: false,
      };
    });
    if (bev > 0) data[bev - 1].isBev = true;
    const bevLabel = bev > 0
      ? (seasonalityEnabled ? MONTH_NAMES[(startMonth + bev - 1) % 12] : `M${bev}`)
      : null;
    return { monthlyData: data, breakEvenMonth: bevLabel };
  }, [kwResults, categories, budgetRatio, businessType, tauxRdv, tauxClosing, basketValue, kwMultiplier, seasonalityEnabled, startMonth, highSeasonMonths, highSeasonMultiplier, crTransactionnel, crPreAchat, crIntermediaire, crInformationnel, breakEvenMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Totals */
  const totals = useMemo(() => {
    // M+12 monthly rate per keyword (for table footer & funnel)
    const rawLeads_m12   = kwResults.reduce((s, k) => s + k.leads, 0);
    const rawCA_m12      = kwResults.reduce((s, k) => s + k.ca, 0);
    const totalLeads     = rawLeads_m12 * kwMultiplier;
    const totalCA_m12    = rawCA_m12    * kwMultiplier; // monthly rate at full maturity
    const totalTraffic   = kwResults.reduce((s, k) => s + k.traffic, 0) * kwMultiplier;

    // Annual sums from actual monthly projection (integrates gradual budget activation)
    const totalCA_annual   = monthlyData.reduce((s, m) => s + m.ca,      0);
    const totalLeads_annual = monthlyData.reduce((s, m) => s + m.leads,   0);

    // CA exposed to visitors = what they see in the table (M+12 monthly rate)
    const totalCA = totalCA_m12;

    const totalImpressions = keywords.reduce((s, k) => s + getEffectiveVolume(k, chalandisePercent), 0) * kwMultiplier;
    const topics    = new Set(keywords.map(k => k.topic).filter(Boolean));
    const nbPages   = (topics.size || keywords.length) * kwMultiplier;
    const nbKeywords = keywords.length * kwMultiplier;
    const budgetMensuel = categories.reduce((s, c) => s + (c.budget ?? 700), 0) * (budgetRatio / 100);
    const budgetTotal   = budgetMensuel * 12;

    // ROI year 1 = annual sum of graduated months; year 2 = year1 + full maturity × 12
    const totalCA_2ans  = totalCA_annual + 12 * totalCA_m12;
    const roi1an     = budgetTotal > 0 ? ((totalCA_annual - budgetTotal) / budgetTotal) * 100 : 0;
    const roiMult1an = budgetTotal > 0 ? totalCA_annual / budgetTotal : 0;
    const roi2ans    = budgetTotal > 0 ? ((totalCA_2ans  - budgetTotal) / budgetTotal) * 100 : 0;
    const roiMult    = budgetTotal > 0 ? totalCA_2ans  / budgetTotal : 0;

    // Funnel (unscaled M+12 monthly rate)
    const baseLeads   = rawLeads_m12;
    const baseRdv     = baseLeads * (tauxRdv / 100);
    const baseClosing = baseRdv   * (tauxClosing / 100);

    return {
      totalCA, totalLeads, totalTraffic, totalImpressions, nbPages, nbKeywords,
      budgetMensuel, budgetTotal, roi1an, roiMult1an, roi2ans, roiMult,
      baseLeads, baseRdv, baseClosing,
      totalCA_annual, totalLeads_annual, totalCA_m12,
    };
  }, [kwResults, monthlyData, keywords, categories, budgetRatio, kwMultiplier, businessType, tauxRdv, tauxClosing, basketValue]);

  /* Monthly estimated clicks split between classic SEO and generative engines.
     - Monthly total = real captured traffic of the month = sum over keywords of
       their traffic at that month's position (already accounts for each keyword's
       activation "1er mois" and the position ramp), then +2% organic growth/month.
     - The SEO → GEO mix shifts by +4 points of GEO share every month:
       M1 = 100% SEO / 0% GEO  →  M12 = 56% SEO / 44% GEO. */
  const seoGeoData = useMemo(() => {
    const MONTHLY_VOLUME_GROWTH = 0.02;        // +2% de volume total par mois
    const GEO_SHIFT_PER_MONTH   = 0.04;        // +4 pts de part GEO par mois
    return monthlyData.map((m, i) => {
      const total    = m.traffic * Math.pow(1 + MONTHLY_VOLUME_GROWTH, i);
      const geoShare = Math.min(1, GEO_SHIFT_PER_MONTH * i); // i=0 → 0%, i=11 → 44%
      const totalR   = Math.round(total);
      const geo      = Math.round(total * geoShare);
      const seo      = totalR - geo;
      return { month: m.month, seo, geo, total: totalR, geoPct: Math.round(geoShare * 100) };
    });
  }, [monthlyData]);

  const hasCatCoeffApplied = useMemo(() => categories.some(c => (c.coeff ?? 1) > 1), [categories]);

  /* CPL */
  const cpl = useMemo(() => {
    const { totalLeads_annual: tl, budgetTotal: bt } = totals;
    const safe = (tl ?? 0) > 0.001 ? (tl ?? 0) : 0.001;
    return {
      an1: bt / safe,
      an2: bt / (safe + 12 * (totals.totalLeads)),
      an3: bt / (safe + 24 * (totals.totalLeads)),
      an5: bt / (safe + 48 * (totals.totalLeads)),
    };
  }, [totals]);

  /* Helpers */
  const update = (patch: Partial<SimState>) => setState(s => ({ ...s, ...patch }));

  const addKw = (catId: string) => {
    setState(s => ({
      ...s,
      keywords: [...s.keywords, { id: uid(), keyword: '', volume: 1000, difficulty: 30, proximity: 1, intention: 1, topic: '', categoryId: catId, zone: 'chalandise' }],
    }));
    setOpenCats(prev => { const n = new Set(prev); n.add(catId); return n; });
  };

  const removeKw = (id: string) => setState(s => ({ ...s, keywords: s.keywords.filter(k => k.id !== id) }));

  /* ── EXCEL IMPORT ─────────────────────────────────────────── */
  const INTENT_MAP: Record<string, Intention> = {
    transactionnel: 1, transactional: 1, achat: 1, '1': 1,
    'pré-achat': 2, 'pre-achat': 2, preachat: 2, consideration: 2, navigationnelle: 2, navigationnel: 2, '2': 2,
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
          zone:       'chalandise' as Zone,
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
      setIsDirty(false);
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

  const coeffSante = computeHealthCoeff(healthScore).toFixed(2);

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
              onClick={e => {
                if (isDirty && !window.confirm(
                  'Vous avez des modifications non enregistrées. Si vous quittez maintenant, elles seront perdues. Continuer sans enregistrer ?'
                )) {
                  e.preventDefault();
                }
              }}
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
                              const newKws = Array.from({ length: diff }, () => ({ id: uid(), keyword: '', volume: 1000, difficulty: 30, proximity: 1 as Proximity, intention: 1 as Intention, topic: '', categoryId: cat.id, zone: 'chalandise' as Zone }));
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
                          Aucun mot-clé : cliquez sur "+ Ajouter" ou{' '}
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
                              <th style={{ padding: '3px 2px 5px', textAlign: 'center', minWidth: 96 }}>Zone</th>
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
                                    <option value={2}>Navigationnelle</option>
                                    <option value={3}>Commerciale</option>
                                    <option value={4}>Informationnel</option>
                                  </select>
                                </td>
                                <td style={{ padding: '4px 2px' }}>
                                  <select value={kw.zone} onChange={e => updateKw(kw.id, 'zone', e.target.value as Zone)}
                                    style={{ width: 96, backgroundColor: L_INPUT, border: `1px solid ${L_BORD}`, borderRadius: 3, color: L_DARK, fontSize: 11, padding: '2px 4px', outline: 'none', cursor: 'pointer' }}>
                                    <option value="chalandise">Zone de chalandise</option>
                                    <option value="france">France</option>
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
            <Slider light label="Navigationnelle" value={crPreAchat} min={0} max={20} step={0.5} unit="%" onChange={v => update({ crPreAchat: v })} />
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
                    max={20000}
                    step={100}
                    unit="€"
                    hint="Répartition proportionnelle entre les thématiques"
                    bold
                    onChange={rawTargetTotal => {
                      if (categories.length === 0) return;
                      const targetTotal = Math.min(rawTargetTotal, 20000);
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

          {/* GESTION ZONE DE CHALANDISE */}
          <div style={cardLight}>
            <div style={secTitleLight}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Gestion zone de chalandise
            </div>
            <Slider light
              label="Population française concernée"
              value={chalandisePercent}
              min={0} max={100} step={0.5}
              unit="%"
              hint="Mots-clés 'France' : volume corrigé = volume × ce %. Mots-clés 'Zone de chalandise' : volume conservé à 100%."
              onChange={v => update({ chalandisePercent: v })}
            />
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
                {fmtC(totals.totalCA_annual)}
              </div>
              <div style={{ color: '#5a7a6a', fontSize: 12, marginTop: 8 }}>
                somme des 12 mois de montée en puissance
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
                      imp   > 0 ? `↓ ${fmtP(traf / imp * 100)}`         : '-',
                      traf  > 0 ? `↓ ${fmtP(baseLeads / traf * 100)}`   : '-',
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
                    imp  > 0 ? `↓ ${fmtP(traf / imp * 100)}`        : '-',
                    traf > 0 ? `↓ ${fmtP(baseLeads / traf * 100)}`  : '-',
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
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Projection mensuelle : 12 mois
              {seasonalityEnabled && (
                <span style={{ background: '#3b82f622', border: '1px solid #3b82f644', borderRadius: 4, padding: '2px 8px', fontSize: 10, color: '#3b82f6', fontWeight: 400 }}>
                  Saisonnalité active
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ color: '#7a9e8e', fontSize: 11 }}>Mensuel</span>
                <button
                  onClick={() => update({ breakEvenMode: breakEvenMode === 'cumule' ? 'mensuel' : 'cumule' })}
                  style={{
                    backgroundColor: breakEvenMode === 'cumule' ? ORANGE : G3,
                    border: 'none', borderRadius: 12,
                    width: 36, height: 20, cursor: 'pointer',
                    position: 'relative', transition: 'background .2s', flexShrink: 0,
                  }}
                  title="Basculer le calcul de break-even entre comparaison mensuelle et cumulée"
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: breakEvenMode === 'cumule' ? 18 : 2,
                    width: 16, height: 16,
                    backgroundColor: 'white', borderRadius: '50%',
                    transition: 'left .2s', display: 'block',
                  }} />
                </button>
                <span style={{ color: '#7a9e8e', fontSize: 11 }}>Cumulé</span>
              </div>
              {breakEvenMonth && (
                <span style={{ color: ORANGE, fontSize: 12, fontWeight: 400, background: `${ORANGE}22`, borderRadius: 4, padding: '2px 8px' }}>
                  Break-even ({breakEvenMode === 'cumule' ? 'cumulé' : 'mensuel'}) : {breakEvenMonth}
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
                {breakEvenMode === 'cumule' ? (
                  <>
                    <Bar dataKey="budgetCumule" fill={G4} name="budgetCumule" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    <Line dataKey="caCumule" stroke={ORANGE} strokeWidth={2.5} dot={false} name="caCumule" />
                  </>
                ) : (
                  <>
                    <Bar dataKey="budget" fill={G4} name="budget" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    <Line dataKey="ca" stroke={ORANGE} strokeWidth={2.5} dot={false} name="ca" />
                  </>
                )}
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
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: '#5a7a6a' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: G4, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />{breakEvenMode === 'cumule' ? 'Budget cumulé' : 'Budget mensuel'}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, backgroundColor: ORANGE, marginRight: 4, verticalAlign: 'middle' }} />{breakEvenMode === 'cumule' ? 'CA cumulé' : 'CA mensuel'}</span>
            </div>
          </div>

          {/* BLOC 4b — LEADS PAR MOIS */}
          <div style={card}>
            <div style={{ ...secTitle, marginBottom: 10 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Évolution du CPA (coût d'acquisition) : 12 mois
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
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: '#5a7a6a' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: ORANGE, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />{businessType === 'ecommerce' ? 'Ventes' : 'Leads'}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, backgroundColor: '#a8c5b5', marginRight: 4, verticalAlign: 'middle' }} />{businessType === 'ecommerce' ? 'CPA' : 'CPL'}</span>
            </div>
          </div>

          {/* BLOC 4c — CLICS SEO vs GEO */}
          <div style={card}>
            <div style={{ ...secTitle, marginBottom: 4 }}>
              <span style={{ color: ORANGE, fontSize: 10 }}>◆</span> Volume de clics estimé par mois : SEO → GEO
            </div>
            <div style={{ color: '#5a7a6a', fontSize: 11, marginBottom: 12 }}>
              Chaque barre représente le volume de clics estimé du mois (croissance de +2 %/mois), réparti entre référencement classique (SEO) et moteurs de réponse génératifs (GEO : ChatGPT, Perplexity, AI Overviews…). La part GEO progresse de +4 pts par mois : 0 % au 1er mois, 44 % au 12e — illustration du glissement des recherches vers l&apos;IA générative.
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seoGeoData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={G3} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#7a9e8e', fontSize: 11 }} axisLine={{ stroke: G3 }} tickLine={false} />
                <YAxis tick={{ fill: '#7a9e8e', fontSize: 10 }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={(v: number) => fmtN(v)} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: G2, border: `1px solid ${G3}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: CREAM, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: SEO_CLR }}>SEO : {fmtN(Number(payload.find(p => p.dataKey === 'seo')?.value ?? 0))} clics <span style={{ color: '#5a7a6a' }}>({100 - Number(payload[0]?.payload?.geoPct ?? 0)}%)</span></div>
                      <div style={{ color: ORANGE }}>GEO : {fmtN(Number(payload.find(p => p.dataKey === 'geo')?.value ?? 0))} clics <span style={{ color: '#5a7a6a' }}>({payload[0]?.payload?.geoPct}%)</span></div>
                      <div style={{ color: CREAM, marginTop: 4, borderTop: `1px solid ${G3}`, paddingTop: 4 }}>Total : {fmtN(Number(payload[0]?.payload?.total ?? 0))} clics</div>
                    </div>
                  ) : null}
                />
                <Bar dataKey="seo" stackId="clicks" fill={SEO_CLR} name="SEO" maxBarSize={40} />
                <Bar dataKey="geo" stackId="clicks" fill={ORANGE} name="GEO" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: '#5a7a6a' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: SEO_CLR, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />SEO — référencement classique</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: ORANGE, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />GEO — moteurs génératifs (0 % → 44 % des clics)</span>
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
                    <th style={{ padding: '6px 4px', width: 24 }}></th>
                    {[
                      { label: 'Mot clé / Sujet', align: 'left'   },
                      { label: 'Volume',           align: 'right'  },
                      { label: 'Diff.',            align: 'center' },
                      { label: 'Position M+12',    align: 'center' },
                      { label: 'CTR',              align: 'center' },
                      { label: 'Trafic / mois',    align: 'right', starred: hasCatCoeffApplied },
                      { label: businessType === 'ecommerce' ? 'Ventes / mois' : 'Leads / mois', align: 'right', starred: hasCatCoeffApplied },
                      { label: 'CA / mois',        align: 'right', starred: hasCatCoeffApplied },
                      { label: 'Intention',        align: 'center' },
                      { label: 'Budget / an',      align: 'right'  },
                      { label: '1er mois',         align: 'center' },
                    ].map(({ label, align, starred }) => (
                      <th key={label} style={{
                        padding: '6px 8px',
                        textAlign: align as 'left' | 'right' | 'center',
                        color: '#5a7a6a', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10,
                      }}>
                        {label}{starred && <span style={{ color: ORANGE, marginLeft: 3 }}>★</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kwResults.map(kw => {
                    const isExpanded = expandedKws.has(kw.id);
                    const showBudgetTip = budgetTooltipKwId === kw.id;
                    return (
                      <>
                        <tr key={kw.id} style={{ borderBottom: isExpanded ? 'none' : `1px solid ${G3}` }}>
                          <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleKwExpand(kw.id)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#5a7a6a', fontSize: 10, padding: '2px 4px',
                                lineHeight: 1, borderRadius: 4,
                              }}
                              title={isExpanded ? 'Masquer la progression' : 'Voir la progression M+1 à M+12'}
                            >
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          </td>
                          <td style={{ padding: '8px 8px 8px 4px' }}>
                            <div style={{ color: CREAM, fontWeight: 500 }}>{kw.keyword || <em style={{ color: '#5a7a6a' }}>-</em>}</div>
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
                          {/* Budget alloué / an avec tooltip hover */}
                          <td style={{ padding: '8px', textAlign: 'right', position: 'relative' }}>
                            <span
                              onMouseEnter={() => setBudgetTooltipKwId(kw.id)}
                              onMouseLeave={() => setBudgetTooltipKwId(null)}
                              style={{
                                color: kw.allocatedBudget > 0 ? '#a8c5b5' : '#5a7a6a',
                                cursor: 'default',
                                borderBottom: '1px dashed #3a5a4a',
                                paddingBottom: 1,
                              }}
                            >
                              {kw.allocatedBudget > 0 ? fmtC(kw.allocatedBudget) : '-'}
                            </span>
                            {showBudgetTip && kw.allocatedBudget > 0 && (
                              <div style={{
                                position: 'absolute', right: 0, top: '100%', zIndex: 50,
                                backgroundColor: '#0d1f18', border: `1px solid ${G3}`,
                                borderRadius: 8, padding: '10px 12px', minWidth: 220,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                              }}>
                                <div style={{ fontSize: 9, color: '#5a7a6a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                  Budget alloué par mois
                                </div>
                                {kw.budgetPerMonth.map((b, i) => b > 0 && (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontSize: 10, color: '#7a9e8e', minWidth: 36 }}>M+{i + 1}</span>
                                    <div style={{ flex: 1, margin: '0 8px', backgroundColor: G3, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                                      <div style={{
                                        height: '100%', borderRadius: 3,
                                        backgroundColor: ORANGE,
                                        width: `${Math.round((b / Math.max(...kw.budgetPerMonth)) * 100)}%`,
                                      }} />
                                    </div>
                                    <span style={{ fontSize: 10, color: CREAM, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>{fmtC(b)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          {/* 1er mois avec budget */}
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            {kw.firstMonth !== null ? (
                              <span style={{
                                backgroundColor: '#1a2e25', border: `1px solid ${G3}`,
                                borderRadius: 8, padding: '2px 8px',
                                fontSize: 10, fontWeight: 700, color: '#7a9e8e',
                              }}>
                                M+{kw.firstMonth}
                              </span>
                            ) : (
                              <span style={{ color: '#3a5a4a', fontSize: 10 }}>-</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${kw.id}-monthly`} style={{ borderBottom: `1px solid ${G3}`, backgroundColor: '#0d1f18' }}>
                            <td colSpan={12} style={{ padding: '8px 12px 12px 36px' }}>
                              <div style={{ fontSize: 9, color: '#5a7a6a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                Progression de position estimée
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {kw.monthlyPos.map((p, i) => (
                                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                    <span style={{ fontSize: 9, color: kw.budgetPerMonth[i] > 0 ? ORANGE : '#5a7a6a', fontWeight: 600 }}>M+{i + 1}</span>
                                    <span style={{
                                      backgroundColor: p <= 3 ? ORANGE : p <= 6 ? '#2d7a5e' : p <= 10 ? G3 : '#1a2e25',
                                      borderRadius: 8, padding: '3px 7px',
                                      fontSize: 11, fontWeight: 700, color: p === 11 ? '#5a7a6a' : 'white',
                                      border: p === 11 ? `1px solid ${G3}` : 'none',
                                      minWidth: 32, textAlign: 'center',
                                    }}>
                                      {p === 11 ? '11+' : `#${p}`}
                                    </span>
                                    {kw.budgetPerMonth[i] > 0 && (
                                      <span style={{ fontSize: 8, color: ORANGE }}>{fmtC(kw.budgetPerMonth[i])}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${G3}` }}>
                    <td></td>
                    <td style={{ padding: '10px 8px', color: CREAM, fontWeight: 700 }}>Total</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{fmtN(totals.totalTraffic)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: CREAM, fontWeight: 700 }}>{fmtLeads(totals.totalLeads)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: ORANGE, fontWeight: 800, fontSize: 14 }}>{fmtC(totals.totalCA)}</td>
                    <td></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#a8c5b5', fontWeight: 700 }}>{fmtC(kwResults.reduce((s, k) => s + k.allocatedBudget, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {(() => {
              const nextIncrease = Math.min(...kwResults.map(k => k.nextCtrMonthlyIncrease ?? Infinity));
              return Number.isFinite(nextIncrease) ? (
                <div style={{ marginTop: 8, fontSize: 10, color: '#7a9e8e' }}>
                  Proposition discrète : +{fmtC(nextIncrease)} / mois pour tenter le prochain palier de CTR.
                </div>
              ) : null;
            })()}
            {hasCatCoeffApplied && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#5a7a6a' }}>
                <span style={{ color: ORANGE }}>★</span> Ces chiffres prennent en compte l'extrapolation des mots clés associés
              </div>
            )}
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
                  <span style={{ color: ORANGE, fontSize: 12, fontWeight: 700 }}>Total budget mensuel</span>
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
                  ['Navigationnelle', `${crPreAchat}%`,       INTENT_COLOR[2]],
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

          {/* DISCLAIMER — shown on the web version and captured in the PDF export */}
          <div style={{
            marginTop: 16, padding: '12px 16px', backgroundColor: G2,
            border: `1px solid ${G3}`, borderRadius: 8,
            color: '#5a7a6a', fontSize: 10, lineHeight: 1.5,
          }}>
            Cette simulation est indicative et non contractuelle. Elle repose sur des hypothèses estimatives et ne prend pas en compte certains facteurs externes pouvant impacter les résultats réels, notamment les actions médias, la politique tarifaire, la pression concurrentielle et les conditions commerciales. En e-commerce, les frais de port, remises et promotions peuvent fortement influencer la performance. En génération de leads, la rapidité de traitement, la qualité du suivi et l'efficacité de l'équipe commerciale ont également un impact direct sur les résultats.
          </div>

        </div>
      </div>
    </div>
  );
}

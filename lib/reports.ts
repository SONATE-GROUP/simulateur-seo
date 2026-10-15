/* Ce que l'interface sait d'un rapport : la ligne, plus les noms qui vivent
   ailleurs (compte du portail, auteurs, consultations), lus par fonction. */

export const INTERNAL_ACCOUNT_ID = 'eeeeeeee-0000-0000-0000-000000000005';

export interface ReportSummary {
  id: string;
  prospect: string;
  siteUrl: string;
  sector: string;
  createdAt: string;
  updatedAt: string;
  accountId: string;
  accountName: string | null;
  createdBy: string | null;
  authorEmail: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  lastViewerEmail: string | null;
  totalTimeSeconds: number;
  interactionCount: number;
}

/* Consultations d'avant la bascule, figées sans nom ni adresse (D9 du plan). */
export interface LegacyStats {
  views?: number;
  last_viewed_at?: string | null;
}

export const REPORT_ID_RE = /^[a-z0-9]{6,40}$/;

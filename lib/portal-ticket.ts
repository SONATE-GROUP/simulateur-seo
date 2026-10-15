/**
 * Vérification du ticket SSO frappé par le portail Ma Sonate (`ma.sonate.group`).
 *
 * ⚠️ CE FICHIER EST UNE COPIE, PAS UNE RÉÉCRITURE. L'original est
 * `lib/tool-sso.ts` dans le dépôt du portail (masonate), qui reste l'autorité
 * sur le contrat de claims ; celle-ci est reprise de LeadFlow
 * (`src/lib/portal-ticket.ts`), autre application Next.js. Deux implémentations écrites séparément divergent
 * au premier détail (ordre des tests, tolérance d'horloge, `exp` non
 * numérique), et la divergence se voit le jour où un client ne peut plus
 * entrer. À toute évolution du contrat côté portail : reporter ici, à
 * l'identique.
 *
 * ⚠️ AUCUN IMPORT, ET ÇA DOIT LE RESTER : la recette l'importe tel quel depuis
 * Node nu (qui retire les types d'un `.ts` mais ne résout pas `@/…`).
 * `crypto`, `atob` et `TextEncoder` sont des globaux.
 *
 * CE QUE CE MODULE NE FAIT PAS, ET QUI EST OBLIGATOIRE : consommer le `jti`.
 * Le portail ne voit pas la requête entrante, l'usage unique ne s'impose
 * qu'ici. C'est le travail de `app/sso/route.ts`.
 */

/* -------------------------------------------------------------------------- */
/*  Contrat de claims v1, miroir du portail                                    */
/* -------------------------------------------------------------------------- */

/** On AJOUTE une claim, on n'en renomme ni n'en retire jamais. */
export const TICKET_VERSION = 1;

/** Émetteur attendu. Constant : c'est le portail, quel que soit son hébergement. */
export const TICKET_ISSUER = "ma.sonate.group";

/**
 * Audience attendue : le `core.tools.slug` du Simulateur SEO commercial dans
 * le portail (0059, figé à vie : D7 du plan).
 * Volontairement NON configurable : une audience réglable à l'exécution est
 * une audience qu'un déploiement mal configuré peut élargir sans bruit.
 */
export const TICKET_AUDIENCE = "simulateur-seo";

/** Tolérance d'horloge entre les deux hébergements, en secondes. */
export const TICKET_CLOCK_SKEW_SECONDS = 5;

/** Rôles d'un ticket de console staff, lus par le portail dans son écran Équipe. */
export const STAFF_TOOL_ROLES = ["admin", "member"] as const;
export type StaffToolRole = (typeof STAFF_TOOL_ROLES)[number];

export interface TicketClaims {
  ver: number;
  iss: string;
  aud: string;
  /** L'utilisateur RÉEL, id de l'Auth commune. En aperçu, c'est le staff. */
  sub: string;
  /** Le compte du portail (`core.accounts.id`). Vide pour un ticket staff. */
  tenant: string;
  role: string;
  account_status: string;
  entitlements: string[];
  iat: number;
  exp: number;
  jti: string;
  trace_id: string;
  /** Un membre du staff regarde l'espace d'un compte : à TRACER. */
  preview?: true;
  /** Ticket de console : un expert, sans compte. */
  kind?: "staff";
  tool_role?: StaffToolRole;
  email?: string;
}

export type TicketRejection =
  | "malformed"
  | "bad_algorithm"
  | "bad_signature"
  | "bad_version"
  | "bad_issuer"
  | "bad_audience"
  | "expired"
  | "not_yet_valid"
  | "no_tenant"
  | "bad_staff"
  | "no_jti"
  | "no_subject";

export type TicketVerdict =
  | { valid: true; claims: TicketClaims }
  | { valid: false; reason: TicketRejection };

/* -------------------------------------------------------------------------- */
/*  Encodage                                                                   */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/* -------------------------------------------------------------------------- */
/*  Vérification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Valide un ticket. L'ORDRE DES TESTS EST UN CHOIX : l'algorithme d'abord, la
 * signature ensuite, le contenu en dernier. Lire une claim avant d'avoir
 * validé la signature, c'est croire du texte fourni par l'appelant, et c'est
 * ainsi qu'on se fait avoir par un `alg: none`.
 */
export async function verifyTicket(
  token: string,
  secret: string,
  options: { audience: string; now?: number }
): Promise<TicketVerdict> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || !secret) return { valid: false, reason: "malformed" };

  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: unknown };
  let claims: TicketClaims;
  try {
    const decoder = new TextDecoder();
    header = JSON.parse(decoder.decode(fromBase64Url(rawHeader)));
    claims = JSON.parse(decoder.decode(fromBase64Url(rawPayload)));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") {
    return { valid: false, reason: "malformed" };
  }

  // Avant toute chose : refuser un algorithme imposé par le jeton lui-même.
  if (header.alg !== "HS256") return { valid: false, reason: "bad_algorithm" };

  let signatureOk = false;
  try {
    signatureOk = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(rawSignature),
      encoder.encode(`${rawHeader}.${rawPayload}`)
    );
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!signatureOk) return { valid: false, reason: "bad_signature" };

  // La signature tient : le contenu est authentique, on peut le lire.
  if (claims.ver !== TICKET_VERSION) return { valid: false, reason: "bad_version" };
  if (claims.iss !== TICKET_ISSUER) return { valid: false, reason: "bad_issuer" };
  if (claims.aud !== options.audience) return { valid: false, reason: "bad_audience" };
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    return { valid: false, reason: "expired" };
  }
  if (typeof claims.iat !== "number" || claims.iat > now + TICKET_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "not_yet_valid" };
  }
  // Ticket de console staff : aucun compte, mais un rôle et une adresse
  // obligatoires. Il ne se combine NI avec un compte NI avec l'aperçu.
  if (claims.kind !== undefined) {
    const staffOk =
      claims.kind === "staff" &&
      claims.tenant === "" &&
      claims.preview === undefined &&
      (STAFF_TOOL_ROLES as readonly string[]).includes(claims.tool_role as string) &&
      typeof claims.email === "string" &&
      claims.email.includes("@");
    if (!staffOk) return { valid: false, reason: "bad_staff" };
  } else if (typeof claims.tenant !== "string" || !claims.tenant) {
    return { valid: false, reason: "no_tenant" };
  }
  // Sans `jti`, rien à consommer, donc rien qui empêche le rejeu : refusé
  // plutôt que traité comme « rejouable à volonté ».
  if (typeof claims.jti !== "string" || !claims.jti) {
    return { valid: false, reason: "no_jti" };
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    return { valid: false, reason: "no_subject" };
  }

  return { valid: true, claims };
}

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { TICKET_AUDIENCE, verifyTicket, type TicketClaims } from '@/lib/portal-ticket';

/**
 * Point d'échange du ticket SSO du portail Ma Sonate :  GET /sso?ticket=…
 *
 * Le portail (console staff, `/api/tools/simulateur-seo/console`) frappe un
 * ticket signé de 60 secondes et redirige ici. Contrat du brief « nouvel
 * outil » du portail (§ 7), repris de LeadFlow, dans cet ordre :
 *   1. vérifier le ticket (`lib/portal-ticket.ts`) avec
 *      SIMULATEUR_SEO_SHARED_SECRET, propre à l'outil ET à l'environnement ;
 *   2. ticket de console seulement : l'outil est réservé à l'équipe (D3), un
 *      ticket client est refusé ;
 *   3. CONSOMMER LE `jti` (usage unique, que seul l'outil peut imposer) ;
 *   4. l'identité : `sub` EST l'id de l'Auth commune, rien à traduire ;
 *   5. poser la session, tracer, puis rediriger vers une URL PROPRE.
 *
 * LA SESSION SANS TABLE DE TRANSFERT : le serveur pose directement les cookies
 * (lien magique produit par l'API d'administration, aucun e-mail envoyé,
 * échangé aussitôt par `verifyOtp` sur le client à cookies), comme LeadFlow.
 *
 * CE QU'ON NE FAIT PAS : décider de ce que la personne voit. La RLS de
 * `simulateur_seo` le fait à chaque requête, d'après l'écran Équipe du portail.
 *
 * EN CAS D'ÉCHEC on redirige vers `/login?sso=<motif>` : un humain est au bout
 * du clic. Les motifs sont grossiers à dessein ; le détail va au journal.
 */

export const dynamic = 'force-dynamic';

type Motif = 'absent' | 'expire' | 'invalide' | 'rejeu' | 'droit' | 'inconnu' | 'indisponible';

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function GET(request: NextRequest) {
  const secret = process.env.SIMULATEUR_SEO_SHARED_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[sso] configuration incomplète (SIMULATEUR_SEO_SHARED_SECRET / clé service)');
    return refuse(request, 'indisponible');
  }

  const token = request.nextUrl.searchParams.get('ticket');
  if (!token) return refuse(request, 'absent');

  // --- 1. Signature, algorithme, contrat ---
  const verdict = await verifyTicket(token, secret, { audience: TICKET_AUDIENCE });
  if (!verdict.valid) {
    console.warn(`[sso] refus : ${verdict.reason}`);
    // `expired` est le seul motif distingué : le seul où réessayer a un sens.
    return refuse(request, verdict.reason === 'expired' ? 'expire' : 'invalide');
  }
  const c = verdict.claims;
  const admin = createServiceClient();

  // --- 2. L'équipe seule ---
  if (c.kind !== 'staff') {
    await trace(admin, c, null, 'refused', 'ticket_client');
    return refuse(request, 'droit');
  }

  // --- 3. Consommation du `jti` ---
  const neuf = await consumeJti(admin, c);
  if (neuf === null) return refuse(request, 'indisponible');
  if (!neuf) {
    await trace(admin, c, null, 'refused', 'rejeu');
    return refuse(request, 'rejeu');
  }

  // --- 4. L'identité : l'Auth est commune avec le portail ---
  const { data: found } = await admin.auth.admin.getUserById(c.sub);
  const email = found?.user?.email?.toLowerCase().trim();
  if (!email) {
    await trace(admin, c, null, 'refused', 'utilisateur_inconnu');
    return refuse(request, 'inconnu');
  }

  // --- 5. La session, puis une URL propre ---
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[sso] generateLink :', linkError?.message ?? 'sans hashed_token');
    return refuse(request, 'indisponible');
  }
  const supabase = createServerClient();
  const { error: otpError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (otpError) {
    console.error('[sso] verifyOtp :', otpError.message);
    return refuse(request, 'indisponible');
  }

  await trace(admin, c, email, 'ok', null);

  // La destination ne porte NI le ticket, NI aucun jeton.
  return redirect(request, '/');
}

/**
 * `true` : ticket neuf, consommé. `false` : déjà vu (rejeu). `null` : base
 * injoignable, et on REFUSE : une panne ne doit pas valoir « usage unique
 * désactivé ». `ignoreDuplicates` donne un `ON CONFLICT DO NOTHING` : c'est la
 * base qui arbitre entre deux requêtes simultanées.
 */
async function consumeJti(admin: ServiceClient, c: TicketClaims): Promise<boolean | null> {
  const { data, error } = await admin
    .from('portal_ticket_jti')
    .upsert(
      {
        jti: c.jti,
        portal_account_id: c.tenant || null,
        trace_id: c.trace_id || null,
        expires_at: new Date(c.exp * 1000).toISOString(),
      },
      { onConflict: 'jti', ignoreDuplicates: true }
    )
    .select('jti');
  if (error) {
    console.error('[sso] consommation du jti :', error.message);
    return null;
  }
  return (data ?? []).length === 1;
}

/**
 * Journal de bascule (`simulateur_seo.portal_sso_log`, purgé à 90 jours par
 * pg_cron). Ne fait JAMAIS échouer une bascule par ailleurs valide.
 */
async function trace(admin: ServiceClient, c: TicketClaims, email: string | null, outcome: string, reason: string | null) {
  try {
    const { error } = await admin.from('portal_sso_log').insert({
      trace_id: c.trace_id || null,
      jti: c.jti || null,
      portal_account_id: c.tenant || null,
      portal_user_id: c.sub || null,
      user_email: email ?? c.email ?? null,
      preview: c.preview === true,
      outcome,
      reason,
    });
    if (error) console.error('[sso] journal :', error.message);
  } catch (e) {
    console.error('[sso] journal indisponible :', (e as Error).message);
  }
}

function refuse(request: NextRequest, motif: Motif) {
  return redirect(request, `/login?sso=${motif}`);
}

/**
 * Une réponse qui pose une session ne se met jamais en cache, et ne transmet
 * pas l'URL d'arrivée (qui portait le ticket) à la page suivante.
 */
function redirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 302);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

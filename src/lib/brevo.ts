import "server-only";

/**
 * Client Brevo (plan §5) — `fetch` natif, AUCUNE dépendance ajoutée (contrat
 * `CLAUDE.md`). `BREVO_API_KEY` est l'interrupteur de la phase communication,
 * même traitement que `STRIPE_SECRET_KEY`/`stripeEnabled()` (`stripe.ts`) :
 * une valeur absente ou non reconnue n'est PAS une erreur de forme (`env.ts`
 * ne la valide donc pas), c'est un état de provisioning légitime — chaque
 * fonction de ce module DÉGRADE PROPREMENT dans ce cas (log serveur +
 * `{ ok: false }`, jamais un throw) plutôt que de planter l'appelant
 * (formulaire newsletter/contact, webhook de commande).
 *
 * Aucune fonction d'ici ne jette : le pire qui puisse arriver à un appelant
 * est un `{ ok: false, reason }` à traiter — jamais une exception qui
 * remonterait jusqu'à faire échouer une server action ou (pire) le webhook
 * Stripe qui a déjà écrit la commande en base (cf. `order-mail.ts`).
 */

const BREVO_API_BASE = "https://api.brevo.com/v3";

export interface BrevoResult {
  ok: boolean;
  /** Raison interne (log/diagnostic) — jamais affichée telle quelle à un visiteur : les formulaires répondent toujours en termes génériques (cf. `newsletter.ts`/`contact-form.ts`), pour ne pas transformer une erreur Brevo en oracle d'énumération d'emails. */
  reason?: string;
}

function apiKey(env: Record<string, string | undefined>): string | null {
  const key = env.BREVO_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

/** `true` ssi `BREVO_API_KEY` est posée (non vide) — à vérifier avant tout branchement qui suppose Brevo actif (sélection de `OrderMailer`, par exemple). */
export function brevoConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return apiKey(env) !== null;
}

function positiveIntFromEnv(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function postToBrevo(
  path: string,
  body: unknown,
  env: Record<string, string | undefined>,
): Promise<BrevoResult> {
  const key = apiKey(env);
  if (!key) {
    console.warn(`[brevo] BREVO_API_KEY absente — appel ${path} ignoré (dégradation propre).`);
    return { ok: false, reason: "not-configured" };
  }
  try {
    const res = await fetch(`${BREVO_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "api-key": key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[brevo] POST ${path} → HTTP ${res.status} ${detail.slice(0, 500)}`);
      return { ok: false, reason: `http-${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[brevo] POST ${path} → erreur réseau`, err);
    return { ok: false, reason: "network-error" };
  }
}

export interface DoiConfirmationInput {
  email: string;
  /** URL absolue de la page de confirmation (`NEXT_PUBLIC_SITE_URL` + `/newsletter/confirmation`). */
  redirectionUrl: string;
  /** Attribut contact `SOURCE` — traçabilité de l'origine de l'inscription. */
  source: string;
}

/**
 * `POST /v3/contacts/doubleOptinConfirmation` (doc vérifiée, plan §5 étape 6)
 * — déclenche l'email de double opt-in Brevo (gabarit `BREVO_DOI_TEMPLATE_ID`,
 * liste `BREVO_LIST_ID_SITE`, « Inscrits site (2026) »). Rien n'atteint la
 * liste sans clic du destinataire — c'est le DOI qui protège des abus, pas ce
 * module. Dégrade en `{ ok: false }` si `BREVO_API_KEY`, `BREVO_LIST_ID_SITE`
 * ou `BREVO_DOI_TEMPLATE_ID` est absente ou malformée.
 */
export async function sendDoiConfirmation(
  input: DoiConfirmationInput,
  env: Record<string, string | undefined> = process.env,
): Promise<BrevoResult> {
  const listId = positiveIntFromEnv(env.BREVO_LIST_ID_SITE);
  const templateId = positiveIntFromEnv(env.BREVO_DOI_TEMPLATE_ID);
  if (listId === null || templateId === null) {
    console.warn(
      "[brevo] BREVO_LIST_ID_SITE/BREVO_DOI_TEMPLATE_ID absente ou non numérique — DOI ignoré (dégradation propre).",
    );
    return { ok: false, reason: "not-configured" };
  }
  return postToBrevo(
    "/contacts/doubleOptinConfirmation",
    {
      email: input.email,
      includeListIds: [listId],
      templateId,
      redirectionUrl: input.redirectionUrl,
      attributes: { SOURCE: input.source },
    },
    env,
  );
}

export interface TransactionalEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  replyToName?: string;
}

/**
 * `POST /v3/smtp/email` — email transactionnel Brevo (formulaire de contact,
 * confirmation de commande). L'expéditeur est TOUJOURS l'adresse authentifiée
 * du domaine (`CONTACT_TO_EMAIL`), jamais celle du visiteur (DMARC — plan §5
 * étape 7) : `CONTACT_TO_EMAIL` sert ici de double rôle assumé (destinataire
 * du formulaire de contact ET expéditeur transactionnel) faute d'une adresse
 * d'envoi dédiée provisionnée par cette phase — aucune variable
 * `BREVO_SENDER_EMAIL` n'a été demandée ; un sous-domaine d'envoi dédié
 * (stack §4) reste une amélioration future, pas un blocage. Dégrade en
 * `{ ok: false }` si `BREVO_API_KEY` ou `CONTACT_TO_EMAIL` est absente.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
  env: Record<string, string | undefined> = process.env,
): Promise<BrevoResult> {
  const sender = env.CONTACT_TO_EMAIL?.trim();
  if (!sender) {
    console.warn(
      "[brevo] CONTACT_TO_EMAIL absente — expéditeur transactionnel indéterminé, envoi ignoré (dégradation propre).",
    );
    return { ok: false, reason: "not-configured" };
  }
  return postToBrevo(
    "/smtp/email",
    {
      sender: { email: sender, name: "Les Éditions sociales × La Dispute" },
      to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
      ...(input.replyTo
        ? { replyTo: { email: input.replyTo, ...(input.replyToName ? { name: input.replyToName } : {}) } }
        : {}),
      subject: input.subject,
      htmlContent: input.html,
      ...(input.text ? { textContent: input.text } : {}),
    },
    env,
  );
}

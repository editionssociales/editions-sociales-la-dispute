"use server";

import { headers } from "next/headers";
import { sendDoiConfirmation } from "@/lib/brevo";
import { validateNewsletterSubmission } from "@/lib/newsletter";

/**
 * Server action de l'îlot `newsletter-form.tsx` (plan §5 étape 6) — décision
 * de surface serveur (étape 5 du plan) : server action plutôt que route
 * handler, même pattern que `souscription/actions.ts` (seule surface serveur
 * du dépôt à ce jour) — pas de duplication de client Brevo, `src/lib/brevo.ts`
 * est le seul point d'appel réseau.
 *
 * Réponse TOUJOURS générique côté succès du flux DOI (honeypot/délai/appel
 * Brevo réussi confondus) — contre l'énumération d'emails, cf. `brevo.ts`. Un
 * email syntaxiquement invalide obtient en revanche un message distinct : ce
 * n'est pas une fuite d'information sur un abonné existant, juste une
 * validation de forme utile à un visiteur qui s'est trompé de frappe.
 */

export interface NewsletterFormState {
  status: "idle" | "ok" | "error";
  message: string | null;
  /** Posé uniquement quand l'échec porte sur le champ email (adresse invalide) — jamais sur une panne d'envoi générique — pour `aria-invalid`/`aria-describedby` côté formulaire. */
  field?: "email";
}

export const NEWSLETTER_INITIAL_STATE: NewsletterFormState = { status: "idle", message: null };

/**
 * Liste blanche de hosts de confiance pour dériver `redirectionUrl` en
 * l'absence de `NEXT_PUBLIC_SITE_URL` — l'en-tête HTTP `Host` est fourni par
 * le client, donc spoofable ; sans validation, un visiteur malveillant
 * pourrait faire pointer le lien de confirmation DOI envoyé PAR EMAIL vers un
 * domaine arbitraire. Domaines couverts (+ sous-domaines, frontière `.`
 * stricte pour éviter le contournement `evil` + suffixe, ex.
 * `evileditionssociales.fr`) : le domaine canonique et son ex-jumeau
 * (`ladispute.fr` redirige entièrement dessus, cf. `next.config.ts`), plus
 * `vercel.app` (previews).
 */
const TRUSTED_HOST_DOMAINS = ["editionssociales.fr", "ladispute.fr", "vercel.app"];

function isTrustedHostname(hostname: string): boolean {
  return TRUSTED_HOST_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/** Domaine canonique de repli (cf. `.env.example`) quand le host de la requête n'est pas en liste blanche. */
const FALLBACK_ORIGIN = "https://editionssociales.fr";

/** Host de la requête → origine absolue de confiance, ou repli sur le domaine canonique si le host est hors liste blanche. */
function resolveOrigin(hostHeader: string | null): string {
  if (!hostHeader) return FALLBACK_ORIGIN;
  const hostname = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  if (hostname === "localhost" || isTrustedHostname(hostname)) {
    return `https://${hostHeader}`;
  }
  return FALLBACK_ORIGIN;
}

const GENERIC_OK_MESSAGE =
  "Merci ! Si votre adresse est valide, un email de confirmation vient de vous être envoyé — cliquez sur le lien qu'il contient pour valider votre inscription.";
const GENERIC_ERROR_MESSAGE =
  "L'inscription est momentanément indisponible. Réessayez dans quelques minutes.";

export async function subscribeToNewsletter(
  _prevState: NewsletterFormState,
  formData: FormData,
): Promise<NewsletterFormState> {
  const email = formData.get("email");
  const honeypot = formData.get("website");
  const renderedAtRaw = formData.get("renderedAt");

  const result = validateNewsletterSubmission({
    email: typeof email === "string" ? email : "",
    honeypot: typeof honeypot === "string" ? honeypot : undefined,
    renderedAt:
      typeof renderedAtRaw === "string" && renderedAtRaw !== "" ? Number(renderedAtRaw) : undefined,
  });

  if (!result.ok) {
    if (result.reason === "invalid-email") {
      return { status: "error", message: "Adresse email invalide.", field: "email" };
    }
    // honeypot / too-fast : même réponse que le succès, aucun appel Brevo — ne jamais renseigner un bot sur la détection.
    return { status: "ok", message: GENERIC_OK_MESSAGE };
  }

  // Origine absolue pour `redirectionUrl` : `NEXT_PUBLIC_SITE_URL` en
  // priorité — avant la bascule DNS, les liens DOI pointent vers `…vercel.app`
  // (acceptable, plan §5 « Dépendances »). À défaut, le host de la requête
  // N'EST PAS utilisé tel quel (contrairement à `souscription/actions.ts`,
  // où seul un retour de navigateur est en jeu) : ce lien part dans un EMAIL,
  // `resolveOrigin` le valide donc contre une liste blanche ci-dessus avant
  // de s'en servir, avec repli sur le domaine canonique sinon.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? resolveOrigin((await headers()).get("host"));

  const outcome = await sendDoiConfirmation({
    email: result.email,
    redirectionUrl: `${origin}/newsletter/confirmation`,
    source: "site-2026",
  });

  if (!outcome.ok) {
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  return { status: "ok", message: GENERIC_OK_MESSAGE };
}

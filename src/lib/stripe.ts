import "server-only";
import Stripe from "stripe";

/**
 * Socle Stripe (server-only) — l'interrupteur Stripe du site, dons ET
 * boutique.
 *
 * `stripeEnabled()` gouverne les DEUX parcours de paiement, pas seulement les
 * dons : `POST /api/checkout` (commerce natif), les pages `merci`/
 * `souscription/merci` et `src/lib/donations.ts` en dépendent tous. Tant que
 * `STRIPE_SECRET_KEY` est absente (ou un placeholder), `/souscription` reste
 * en iso-rendu (boutons inertes) ET `/api/checkout` répond 503 « Commerce
 * natif indisponible ». Retirer la clé pour couper les dons coupe donc AUSSI
 * la boutique — un rollback ciblé sur les dons seuls n'existe pas avec ce
 * seul interrupteur.
 */

let client: Stripe | null = null;

/** `true` ssi `STRIPE_SECRET_KEY` est une clé Stripe test ou live reconnaissable. */
export function stripeEnabled(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && (key.startsWith("sk_test_") || key.startsWith("sk_live_"));
}

/**
 * Client Stripe, instancié paresseusement (une seule fois par process).
 * Jette une erreur claire si la clé est absente ou n'est pas une clé Stripe
 * reconnaissable — à n'appeler que derrière `stripeEnabled()`.
 */
export function getStripe(): Stripe {
  if (client) return client;
  if (!stripeEnabled()) {
    throw new Error(
      "getStripe() appelé sans STRIPE_SECRET_KEY valide (sk_test_… ou sk_live_…) — vérifier stripeEnabled() avant tout appel.",
    );
  }
  // apiVersion volontairement non forcée : celle épinglée par le SDK installé.
  client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

import "server-only";
import Stripe from "stripe";

/**
 * Socle Stripe (server-only) — phase 1 « dons ».
 *
 * `donationsEnabled()` est l'interrupteur de la phase : tant que
 * `STRIPE_SECRET_KEY` est absente (ou un placeholder), la page `/souscription`
 * reste en iso-rendu (boutons inertes, comme aujourd'hui) — déploiement sans
 * risque avant provisioning, rollback = retirer la clé + redeploy.
 */

let client: Stripe | null = null;

/** `true` ssi `STRIPE_SECRET_KEY` est une clé Stripe test ou live reconnaissable. */
export function donationsEnabled(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && (key.startsWith("sk_test_") || key.startsWith("sk_live_"));
}

/**
 * Client Stripe, instancié paresseusement (une seule fois par process).
 * Jette une erreur claire si la clé est absente ou n'est pas une clé Stripe
 * reconnaissable — à n'appeler que derrière `donationsEnabled()`.
 */
export function getStripe(): Stripe {
  if (client) return client;
  if (!donationsEnabled()) {
    throw new Error(
      "getStripe() appelé sans STRIPE_SECRET_KEY valide (sk_test_… ou sk_live_…) — vérifier donationsEnabled() avant tout appel.",
    );
  }
  // apiVersion volontairement non forcée : celle épinglée par le SDK installé.
  client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

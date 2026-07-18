import * as Sentry from "@sentry/nextjs";
import { findLatestOrderUpdatedAt } from "@/lib/order-source";

/**
 * `GET /api/health` — moniteur #8 / risque R8 (`plan/06-operations.md`) :
 * expose l'âge du dernier événement Stripe **reçu**, sans jamais appeler
 * l'API Stripe (lecture purement locale/DB) et sans exposer aucun secret.
 *
 * Portée honnête du signal : le webhook (`api/stripe/webhook/route.ts`,
 * commentaire d'extension ~lignes 25-33) n'écrit en base QUE quand
 * `metadata.kind === "order"` (commerce natif — `order-handler.ts`
 * crée/met à jour la collection `orders`, idempotent par
 * `stripeSessionId`) ; le chemin dons (`kind` absent) est
 * INTENTIONNELLEMENT zéro-stockage (cf. tête de `webhook/route.ts` —
 * `donations.ts` recalcule la jauge depuis Stripe à la demande, jamais
 * depuis une table locale). Il n'existe donc, à ce jour, aucune trace
 * locale/DB d'un événement de don reçu : ce endpoint ne peut honnêtement
 * exposer que le signal COMMERCE (`orders`), jamais un signal dons — le
 * filet dons reste le moniteur #3 (keyword `/souscription`) + les
 * notifications natives d'échec Stripe (plan, § Dépendances, phase Dons).
 *
 * Dégrade proprement, jamais une erreur 5xx : lecture Payload/Postgres en
 * échec → capturé par Sentry, signal `null` (même contrat que
 * `getActiveHighlight`, `src/lib/highlight.ts`) — un endpoint de
 * surveillance ne doit jamais planter pour la panne qu'il a justement pour
 * rôle de signaler. `commerceNative: true` est conservé dans la réponse :
 * contrat JSON des moniteurs existants (OPERATIONS.md), littéral depuis la
 * coupure OVH (plus de flag).
 */
export async function GET(): Promise<Response> {
  const stripe = await lastStripeEventAge();
  return Response.json({ status: "ok", commerceNative: true, stripe });
}

interface StripeHealthSignal {
  lastEventAt: string | null;
  lastEventAgeSeconds: number | null;
}

/**
 * Commande la plus récemment TOUCHÉE (`orders`, `-updatedAt`) — création
 * (`checkout.session.completed`/`async_payment_succeeded`/`async_payment_
 * failed`) OU passage à `refunded` (`charge.refunded`) font toutes deux
 * avancer `updatedAt`, donc toutes deux comptent comme un événement Stripe
 * reçu au sens de ce signal. Jamais d'appel réseau Stripe.
 */
async function lastStripeEventAge(): Promise<StripeHealthSignal> {
  try {
    const lastUpdatedAt = await findLatestOrderUpdatedAt();
    if (!lastUpdatedAt) return { lastEventAt: null, lastEventAgeSeconds: null };

    const ageSeconds = Math.round((Date.now() - new Date(lastUpdatedAt).getTime()) / 1000);
    return { lastEventAt: lastUpdatedAt, lastEventAgeSeconds: Math.max(0, ageSeconds) };
  } catch (err) {
    Sentry.captureException(err);
    return { lastEventAt: null, lastEventAgeSeconds: null };
  }
}

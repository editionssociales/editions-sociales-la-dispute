import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { selectDonationMailer } from "@/lib/donation-mail";
import { getStripe } from "@/lib/stripe";
import { handleDonationSessionCompleted, handleOrderWebhookEvent, markOrderRefunded } from "./order-handler";

/**
 * Premier route handler du repo — POST, dynamique par nature (hors ISR).
 *
 * Côté DONS (`kind: "donation"` ou absent), deux chemins distincts sur
 * `metadata.donLines` (client 2026-08-21, contreparties) :
 * - **Sans** `donLines` (montant libre, ou palier antérieur à la feature) :
 *   chemin HISTORIQUE, N'ÉCRIT dans AUCUNE base de données (la jauge lit les
 *   charges Stripe directement, zéro stockage, cf. `donations.ts`) — rejouer
 *   un event n'a donc aucun effet secondaire PERSISTANT, et **aucune
 *   déduplication par `event.id` n'est nécessaire** pour l'invalidation de
 *   cache ci-dessous. Un effet non idempotent existe déjà malgré tout : le
 *   mail de remerciement (`donation-mail.ts`, best effort) peut repartir en
 *   double sur un rejeu Stripe (retry réseau, redélivrance manuelle) faute
 *   d'une ligne où marquer « déjà envoyé ».
 * - **Avec** `donLines` (don avec contrepartie) : délégué à
 *   `handleDonationSessionCompleted` (`order-handler.ts`), qui ÉCRIT (commande
 *   `orderType: "don"`, décrément de stock, mail enrichi) — idempotent par
 *   effet comme le commerce, `Orders.confirmationSent` y porte le marqueur
 *   que le chemin historique n'a pas. `charge.refunded` y fait transiter les
 *   commandes don liées (`markOrderRefunded`, réutilisée du commerce — même
 *   fonction, agnostique du type de commande) ; un don sans commande associée
 *   (montant libre, ou antérieur à la feature) reste un no-op silencieux.
 *
 * Rôle honnête de l'invalidation de cache ci-dessous, dans tous les cas côté
 * DONS : un **accélérateur best-effort**, pas le mécanisme de fraîcheur de la
 * jauge. La Search API Stripe indexe en ~1 min (documentée « à ne pas
 * utiliser en read-after-write ») et `revalidateTag(…, "max")` sert le périmé
 * puis re-fetch en arrière-plan à la visite suivante : un re-fetch parti
 * avant l'indexation re-cacherait l'ancien total. La fraîcheur réelle vient
 * de la fenêtre de 60 s du fetch taggé (`donations.ts`). `charge.refunded`
 * est écouté pour décompter vite un remboursement (dont le don de test de la
 * mise en réel).
 *
 * Étendu (plan §4 étape 9, lot 2 « commerce natif ») pour le commerce : un
 * event dont `metadata.kind === "order"` (posée par `POST /api/checkout`,
 * propagée par Stripe du PaymentIntent à la Charge — c'est pourquoi
 * `charge.refunded` la porte aussi) est délégué en ENTIER à
 * `order-handler.ts`, qui ÉCRIT (création de commande, décrément de stock) —
 * contrairement au chemin dons ci-dessus, ici la déduplication par
 * `stripeSessionId` est indispensable (un event rejoué ne doit ni recréer la
 * commande ni décrémenter le stock deux fois, cf. `order-handler.ts`).
 */
export async function POST(req: Request) {
  const body = await req.text(); // corps BRUT obligatoire pour la vérification de signature
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    // Un webhook qui répond 400 proprement est invisible pour `onRequestError`
    // (instrumentation.ts) : sans capture explicite, une signature invalide en
    // rafale (attaque, secret mal posé) passerait inaperçue.
    Sentry.captureMessage("Webhook Stripe : signature invalide", {
      level: "warning",
      extra: { error: err instanceof Error ? err.message : String(err) },
    });
    return new Response("invalid signature", { status: 400 });
  }

  try {
    // `event.data.object` couvre plusieurs types de ressources Stripe selon
    // `event.type` (Session, Charge…) — toutes portent `metadata` au même
    // endroit, d'où ce cast large plutôt qu'un type par branche.
    const kind = (event.data.object as { metadata?: Record<string, string> | null })?.metadata
      ?.kind;

    if (kind === "order") {
      const result = await handleOrderWebhookEvent(event);
      if (result.handled && result.orderFound === false) {
        // `charge.refunded` sans commande retrouvée (event orphelin, ordre
        // d'arrivée improbable) : signalé sans faire échouer le webhook (pas
        // de retry Stripe utile — rejouer ne fera pas apparaître la commande).
        Sentry.captureMessage("Webhook Stripe : remboursement sans commande associée", {
          level: "warning",
          extra: { eventId: event.id },
        });
      }
    } else if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "charge.refunded"
    ) {
      if (event.type === "charge.refunded") {
        // Fait transiter les commandes don liées (contrepartie, client
        // 2026-08-21) — même chemin que le commerce (`findOrdersByPaymentIntent`
        // via `markOrderRefunded`, réutilisée telle quelle, agnostique du type
        // de commande). Un don SANS commande (montant libre, ou antérieur à la
        // feature) est un no-op silencieux — pas de warning Sentry ici,
        // contrairement au commerce (`orderFound === false` n'est jamais une
        // anomalie côté dons : la majorité des remboursements de dons n'ont
        // toujours pas de commande associée).
        await markOrderRefunded(event.data.object as Stripe.Charge);
      } else {
        const session = event.data.object as Stripe.Checkout.Session;
        // Paiement réellement confirmé — jamais pour un moyen différé encore
        // en attente (`checkout.session.completed` peut se présenter en
        // `payment_status !== "paid"`, `async_payment_succeeded` relaiera
        // l'event le jour où il se confirme, même logique que côté commande).
        if (session.payment_status === "paid") {
          if (session.metadata?.donLines) {
            // Don AVEC contrepartie — commande `orderType: "don"` + décrément
            // + mail enrichi, idempotents par effet (`order-handler.ts`).
            // JAMAIS le mailer simple ci-dessous pour ce chemin.
            await handleDonationSessionCompleted(session);
          } else if (session.customer_details?.email) {
            // Don à montant libre (ou palier antérieur à la feature) — chemin
            // historique, `sendDonationThanks` ne jette jamais (contrat
            // `DonationMailer`) — best effort assumé, cf. docblock de fichier.
            await selectDonationMailer().sendDonationThanks({
              email: session.customer_details.email,
            });
          }
        }
      }
      revalidateTag("donations", "max"); // Next 16 : signature à 2 arguments
    }
    return Response.json({ received: true });
  } catch (err) {
    // Toute erreur gérée du handler doit remonter dans Sentry — un 400/500
    // propre ne déclenche pas `onRequestError`.
    Sentry.captureException(err);
    return new Response("webhook error", { status: 500 });
  }
}

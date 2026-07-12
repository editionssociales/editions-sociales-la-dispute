import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * Premier route handler du repo — POST, dynamique par nature (hors ISR).
 *
 * N'écrit rien (pas de base de données) : rejouer un événement n'a aucun
 * effet secondaire, donc **aucune déduplication par `event.id` n'est
 * nécessaire à ce stade** (à ajouter le jour où ce handler écrira — email
 * Brevo, ligne en base — phases ultérieures).
 *
 * Rôle honnête : un **accélérateur best-effort**, pas le mécanisme de
 * fraîcheur de la jauge. La Search API Stripe indexe en ~1 min (documentée
 * « à ne pas utiliser en read-after-write ») et `revalidateTag(…, "max")`
 * sert le périmé puis re-fetch en arrière-plan à la visite suivante : un
 * re-fetch parti avant l'indexation re-cacherait l'ancien total. La
 * fraîcheur réelle vient de la fenêtre de 60 s du fetch taggé (`donations.ts`).
 * `charge.refunded` est écouté pour décompter vite un remboursement (dont le
 * don de test de la mise en réel).
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
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "charge.refunded"
    ) {
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

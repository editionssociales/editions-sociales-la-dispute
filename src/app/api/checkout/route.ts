import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { getCommerceBookRecords, getPromoCodeRecord } from "@/lib/commerce-source";
import {
  encodeCheckoutLines,
  parseCheckoutRequest,
  splitValidatedLines,
  validateCheckoutLines,
} from "@/lib/checkout-core";
import { computeCartQuote } from "@/lib/cart-quote";
import { evaluatePromoCode } from "@/lib/promo-core";

/**
 * `POST /api/checkout` (plan §4 étape 8) — première écriture commerce de la
 * phase : re-valide TOUT côté serveur (prix, vendabilité, stock, code promo,
 * zone) depuis une relecture fraîche de Payload — le client n'envoie que des
 * `{id, qty}` + une zone + un code promo optionnel, jamais un prix ni un
 * total. Toute la logique de validation/calcul est pure et testée ailleurs
 * (`checkout-core.ts`, `promo-core.ts`, `cart-quote.ts` pour le devis
 * port/remise/total) — cette route ne fait que la composition + l'appel
 * Stripe, même découpage que `souscription/actions.ts` (E1/phase dons).
 *
 * SCISSION précommande (client 2026-08-20) : un panier mixte (articles parus
 * + articles à paraître en précommande) reste UN SEUL paiement Stripe, mais
 * pose DEUX groupes de lignes en `metadata` (`lines` pour la commande
 * normale, `preorderLines` pour la précommande — même encodage compact que
 * `lines` avant cette date, la clé porte la distinction) ainsi que la remise
 * DÉJÀ allouée par partie (`discountCents`/`preorderDiscountCents`,
 * `cart-quote.ts:computeCartQuote`) — le webhook (étape 9) ne fait plus
 * QU'UNE lecture fidèle de ces metadata pour reconstruire la scission,
 * JAMAIS un nouveau calcul qui pourrait diverger si une fiche change de
 * statut entre le paiement et l'arrivée de l'event.
 *
 * Garde Stripe en PREMIER, avant même de lire le corps de la requête :
 * sans clé (`stripeEnabled()`), aucun encaissement possible — 503 propre
 * plutôt qu'une erreur au fond de l'appel Stripe.
 */
export async function POST(req: Request): Promise<Response> {
  if (!stripeEnabled()) {
    return Response.json({ error: "Commerce natif indisponible." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide (JSON attendu)." }, { status: 400 });
  }

  const parsed = parseCheckoutRequest(rawBody);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const ids = parsed.lines.map((l) => l.id);
  const books = await getCommerceBookRecords(ids);

  const validation = validateCheckoutLines(parsed.lines, books);
  if (!validation.ok) {
    return Response.json(
      { error: "Panier invalide.", reason: "lines", refusals: validation.refusals },
      { status: 422 },
    );
  }

  const promo = parsed.promoCode ? await getPromoCodeRecord(parsed.promoCode) : null;
  const promoEval = parsed.promoCode ? evaluatePromoCode(promo, validation.subtotalCents) : null;
  if (promoEval && !promoEval.ok) {
    return Response.json(
      { error: promoEval.message, reason: "promo" },
      { status: 422 },
    );
  }

  // Scission pure (`checkout-core.ts:splitValidatedLines`) — regroupe les
  // lignes DÉJÀ validées par `isPreorder`, aucune règle de vendabilité
  // rejouée ici.
  const { normal, preorder } = splitValidatedLines(validation.lines);

  const quote = computeCartQuote({
    normalSubtotalCents: normal.subtotalCents,
    preorderSubtotalCents: preorder.subtotalCents,
    hasNormalLines: normal.lines.length > 0,
    hasPreorderLines: preorder.lines.length > 0,
    zone: parsed.zone,
    manifestOnly: validation.manifestOnly,
    promoEval,
  });
  if (!quote.shipping.ok) {
    return Response.json({ error: quote.shipping.message, reason: "shipping" }, { status: 422 });
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${(await headers()).get("host")}`;

  // `metadata` dupliquée sur la session ET `payment_intent_data` — même
  // raison que `souscription/actions.ts` : c'est la Charge (le PaymentIntent
  // y copie ses metadata) que le webhook (étape 9) lit pour `charge.refunded`.
  // `shippingCostCents` reste le tarif d'UN SEUL envoi (le webhook l'applique
  // tel quel à chaque commande créée, jamais divisé/multiplié une seconde
  // fois) ; `discountCents`/`preorderDiscountCents` sont la remise DÉJÀ
  // répartie par partie (jamais recalculée côté webhook).
  const metadata: Record<string, string> = {
    kind: "order",
    zone: parsed.zone,
    shippingMethod: quote.shippingMethod,
    shippingCostCents: String(quote.shipping.costCents),
    discountCents: String(quote.normal.discountCents),
    preorderDiscountCents: String(quote.preorder.discountCents),
    promoCodeId: promo ? String(promo.id) : "",
    lines: encodeCheckoutLines(normal.lines),
    preorderLines: encodeCheckoutLines(preorder.lines),
  };

  // Hissés hors du try : le catch doit pouvoir supprimer (best-effort) un
  // coupon créé avant l'échec de la session — sinon il resterait orphelin
  // dans le Dashboard Stripe.
  const stripe = getStripe();
  let couponId: string | undefined;
  try {
    // Remise = un coupon Stripe créé à la volée (montant fixe, jamais un %) —
    // seul mécanisme Checkout pour une remise en euros arbitraire sur le
    // total de la session (plan §4 étape 8, point ouvert « création du
    // discount Stripe » tranché ainsi). Un SEUL coupon pour le total combiné
    // (Stripe le répartit lui-même entre les lignes de la session ; la
    // répartition PAR PARTIE ci-dessus ne sert qu'à la ventilation
    // comptable des deux commandes, indépendante du mécanisme Stripe).
    // Absent si aucune remise (livraison offerte seule n'a pas besoin de
    // coupon : elle se lit déjà dans le prix de la/les ligne(s) de port, à 0).
    if (quote.totals.discountCents > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: quote.totals.discountCents,
        currency: "eur",
        duration: "once",
        name: `Code ${parsed.promoCode}`,
      });
      couponId = coupon.id;
    }

    // Libellé de port — « clair pour le payeur » (client 2026-08-20) : identique
    // au comportement historique tant qu'il n'y a qu'un seul envoi (`split`
    // faux, aucun suffixe) ; annonce l'envoi concerné dès qu'il y en a deux.
    const shippingLineName = (label?: string): string => {
      const suffix = label ? ` — ${label}` : "";
      return quote.shipping.ok && quote.shipping.costCents === 0
        ? `Livraison${suffix} (offerte)`
        : `Livraison${suffix}`;
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items: [
        ...normal.lines.map((line) => ({
          quantity: line.qty,
          price_data: {
            currency: "eur",
            unit_amount: line.unitPriceCents,
            product_data: { name: line.titleSnapshot },
          },
        })),
        ...preorder.lines.map((line) => ({
          quantity: line.qty,
          price_data: {
            currency: "eur",
            unit_amount: line.unitPriceCents,
            product_data: { name: `${line.titleSnapshot} (précommande)` },
          },
        })),
        ...(normal.lines.length > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: quote.shipping.costCents,
                  product_data: { name: shippingLineName(quote.split ? "commande" : undefined) },
                },
              },
            ]
          : []),
        ...(preorder.lines.length > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: quote.shipping.costCents,
                  product_data: { name: shippingLineName(quote.split ? "précommande" : undefined) },
                },
              },
            ]
          : []),
      ],
      ...(couponId && { discounts: [{ coupon: couponId }] }),
      // Achat en invité uniquement (plan §4, objectif point 7) : pas de
      // `customer` fourni, Stripe n'en crée un que si une fonctionnalité
      // ultérieure l'exige (`if_required`, même réglage que les dons).
      customer_creation: "if_required",
      shipping_address_collection: { allowed_countries: ["FR", "BE", "CH"] },
      // Téléphone (client 2026-08-24, demandé comme colonne de l'export des
      // commandes — et utile au transporteur). ATTENTION : activé, Stripe
      // rend le champ OBLIGATOIRE au paiement, il n'y a pas de mode
      // facultatif. Assumé côté boutique ; volontairement PAS activé sur le
      // parcours de don/souscription (`souscription/actions.ts`), où chaque
      // champ de plus se paie en conversion pendant la campagne.
      phone_number_collection: { enabled: true },
      // Pas de `receipt_email` explicite : l'email n'est connu qu'une fois
      // collecté PAR Stripe pendant le checkout (achat invité, jamais saisi
      // chez nous avant) — comme pour les dons, le reçu Stripe natif suit le
      // réglage de compte, sans paramètre par session.
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/merci?session_id={CHECKOUT_SESSION_ID}`,
      // `?paiement=annule` : sans lui, revenir de Stripe sans payer était
      // indiscernable d'une visite normale de `/panier` — le paramètre
      // déclenche le bandeau « panier intact » (`PaymentCancelledNotice`,
      // `cart-view.tsx`).
      cancel_url: `${origin}/panier?paiement=annule`,
    });

    if (!session.url) {
      throw new Error("Session Stripe créée sans URL.");
    }

    return Response.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(err);
    // Best-effort : ne jamais laisser un coupon orphelin (l'échec de la
    // suppression n'a pas à masquer l'erreur d'origine).
    if (couponId) await stripe.coupons.del(couponId).catch(() => {});
    return Response.json({ error: "Le paiement est momentanément indisponible. Réessayez dans un instant." }, { status: 502 });
  }
}

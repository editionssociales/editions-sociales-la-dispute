import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { isCommerceNative } from "@/lib/env";
import { donationsEnabled, getStripe } from "@/lib/stripe";
import { getCommerceBookRecords, getPromoCodeRecord } from "@/lib/commerce-source";
import {
  encodeCheckoutLines,
  parseCheckoutRequest,
  resolveShippingMethod,
  validateCheckoutLines,
} from "@/lib/checkout-core";
import { computeCartTotals } from "@/lib/cart-core";
import { computeShipping } from "@/lib/shipping-core";
import { evaluatePromoCode } from "@/payload/lib/promo-eval-core";

/**
 * `POST /api/checkout` (plan §4 étape 8) — première écriture commerce de la
 * phase : re-valide TOUT côté serveur (prix, vendabilité, stock, code promo,
 * zone) depuis une relecture fraîche de Payload — le client n'envoie que des
 * `{id, qty}` + une zone + un code promo optionnel, jamais un prix ni un
 * total. Toute la logique de validation/calcul est pure et testée ailleurs
 * (`checkout-core.ts`, `promo-eval-core.ts`, `shipping-core.ts`,
 * `cart-core.ts`) — cette route ne fait que la composition + l'appel Stripe,
 * même découpage que `souscription/actions.ts` (E1/phase dons).
 *
 * Garde `COMMERCE_NATIVE` en PREMIER, avant même de lire le corps de la
 * requête : défense en profondeur (plan §4 étape 2) — personne ne peut
 * commander en prod avant le jour J, même en forgeant la requête.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCommerceNative() || !donationsEnabled()) {
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

  const freeShippingCoupon = promoEval?.ok === true && promoEval.type === "free_shipping";
  const discountCents =
    promoEval?.ok === true && promoEval.type === "fixed_cart" ? promoEval.discountCents : 0;

  const shipping = computeShipping({
    cartTotalCents: validation.subtotalCents,
    zone: parsed.zone,
    manifestOnly: validation.manifestOnly,
    freeShippingCoupon,
  });
  if (!shipping.ok) {
    return Response.json({ error: shipping.message, reason: "shipping" }, { status: 422 });
  }

  const totals = computeCartTotals(validation.subtotalCents, discountCents, shipping.costCents);
  const shippingMethod = resolveShippingMethod({
    manifestOnly: validation.manifestOnly,
    freeShippingCoupon,
  });

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${(await headers()).get("host")}`;

  // `metadata` dupliquée sur la session ET `payment_intent_data` — même
  // raison que `souscription/actions.ts` : c'est la Charge (le PaymentIntent
  // y copie ses metadata) que le webhook (étape 9) lit pour `charge.refunded`.
  const metadata: Record<string, string> = {
    kind: "order",
    zone: parsed.zone,
    shippingMethod,
    shippingCostCents: String(shipping.costCents),
    discountCents: String(totals.discountCents),
    promoCodeId: promo ? String(promo.id) : "",
    lines: encodeCheckoutLines(validation.lines),
  };

  try {
    const stripe = getStripe();

    // Remise = un coupon Stripe créé à la volée (montant fixe, jamais un %) —
    // seul mécanisme Checkout pour une remise en euros arbitraire sur le
    // total de la session (plan §4 étape 8, point ouvert « création du
    // discount Stripe » tranché ainsi). Absent si aucune remise (livraison
    // offerte seule n'a pas besoin de coupon : elle se lit déjà dans le prix
    // de la ligne de port, à 0).
    let couponId: string | undefined;
    if (totals.discountCents > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: totals.discountCents,
        currency: "eur",
        duration: "once",
        name: `Code ${parsed.promoCode}`,
      });
      couponId = coupon.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items: [
        ...validation.lines.map((line) => ({
          quantity: line.qty,
          price_data: {
            currency: "eur",
            unit_amount: line.unitPriceCents,
            product_data: { name: line.titleSnapshot },
          },
        })),
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: shipping.costCents,
            product_data: { name: shipping.costCents === 0 ? "Livraison (offerte)" : "Livraison" },
          },
        },
      ],
      ...(couponId && { discounts: [{ coupon: couponId }] }),
      // Achat en invité uniquement (plan §4, objectif point 7) : pas de
      // `customer` fourni, Stripe n'en crée un que si une fonctionnalité
      // ultérieure l'exige (`if_required`, même réglage que les dons).
      customer_creation: "if_required",
      shipping_address_collection: { allowed_countries: ["FR", "BE", "CH"] },
      // Pas de `receipt_email` explicite : l'email n'est connu qu'une fois
      // collecté PAR Stripe pendant le checkout (achat invité, jamais saisi
      // chez nous avant) — comme pour les dons, le reçu Stripe natif suit le
      // réglage de compte, sans paramètre par session.
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/panier`,
    });

    if (!session.url) {
      throw new Error("Session Stripe créée sans URL.");
    }

    return Response.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(err);
    return Response.json({ error: "Le paiement est momentanément indisponible, réessayez." }, { status: 502 });
  }
}

/**
 * Devis du panier (sous-total → remise → port → total) — compose
 * `computeShipping` (`shipping-core.ts`) et `computeCartTotals`
 * (`cart-core.ts`) à partir d'un verdict `evaluatePromoCode` (`promo-core.ts`)
 * déjà résolu. Avant ce module, cette composition — dériver
 * `freeShippingCoupon`/`discountCents` du verdict promo, appeler
 * `computeShipping`, puis `computeCartTotals` — était RÉÉCRITE à l'identique
 * à deux endroits : l'affichage client (`panier/cart-view.tsx`, un devis
 * provisoire) et la re-validation serveur (`api/checkout/route.ts`, le même
 * devis mais sur des lignes fraîchement relues) — deux copies qui auraient pu
 * diverger silencieusement (l'ordre « coupon `free_shipping` prime toujours
 * sur la règle manifeste », par ex., n'est correct qu'une fois, dans
 * `computeShipping`). Un seul point compose désormais les trois modules
 * purs ; chaque appelant ne fournit plus que les sous-totaux/zone/
 * `manifestOnly` et le verdict promo déjà résolu — la lecture I/O du code
 * promo (`getPromoCodeRecord`) reste sa responsabilité.
 *
 * `shippingMethod` (l'étiquette snapshotée sur `Orders.ts:shippingMethod`)
 * suit désormais le COÛT réellement calculé par `computeShipping`, pas la
 * seule validité du coupon — corrige l'ancienne dérive de
 * `checkout-core.ts:resolveShippingMethod` (supprimé), qui étiquetait
 * « offert » dès qu'un coupon `free_shipping` était valide, y compris sous
 * `FREE_SHIPPING_MIN_CART_CENTS` : une commande sous 50 € avec un coupon
 * valide se voyait alors snapshoter « offert » alors que le port de grille
 * standard était réellement facturé.
 *
 * SCISSION précommande (client 2026-08-20, plan §règle 2/3) : un panier mixte
 * (articles parus + articles à paraître en précommande) se règle en UN SEUL
 * paiement mais devient DEUX commandes/DEUX envois. Le barème lui-même reste
 * calculé UNE fois sur le total COMBINÉ (règle 3 — paliers/manifeste évalués
 * sur le panier entier, exactement comme avant), mais le tarif obtenu
 * (`shipping.costCents`) est ensuite facturé UNE FOIS PAR envoi non vide
 * (`shipments` = 1 ou 2) : ce module reste le SEUL à faire cette
 * multiplication, jamais recalculée ailleurs. La remise (coupon `fixed_cart`)
 * est allouée entre les deux parties au PRORATA de leur sous-total (arrondi
 * par troncature sur la part « normale », le reliquat va à la précommande —
 * garantit une somme EXACTE des deux parts sans jamais dépasser le sous-total
 * d'une partie, cf. `cart-quote.test.ts`).
 *
 * Zéro I/O ici, comme les trois modules composés.
 */
import { computeCartTotals, type CartTotals } from "./cart-core";
import { computeShipping, type ShippingResult } from "./shipping-core";
import type { PromoEvalResult } from "./promo-core";

export type ShippingMethodLabel = "standard" | "reduit" | "offert";

export interface CartQuoteInput {
  /** Sous-total TTC des lignes « parues » (commande normale), en centimes — 0 si aucune. */
  normalSubtotalCents: number;
  /** Sous-total TTC des lignes précommande (parution future + flag ouvert), en centimes — 0 si aucune. */
  preorderSubtotalCents: number;
  /** `true` ssi le panier contient au moins une ligne « parue ». */
  hasNormalLines: boolean;
  /** `true` ssi le panier contient au moins une ligne précommande. */
  hasPreorderLines: boolean;
  /** Zone de livraison déclarée — `computeShipping` la valide, ce module ne la revérifie pas. */
  zone: string;
  /** Panier ENTIER (les deux parties confondues) composé UNIQUEMENT d'articles à port réduit — le barème lit toujours le panier combiné (règle client). */
  manifestOnly: boolean;
  /** Verdict déjà résolu par `evaluatePromoCode` (sur le sous-total COMBINÉ) — `null` = aucun code promo soumis/appliqué. */
  promoEval: PromoEvalResult | null;
}

/** Devis d'UNE partie (normale ou précommande) — futur `Orders` correspondant si `subtotalCents > 0` ou plus précisément si la partie a des lignes. */
export interface CartQuotePart {
  subtotalCents: number;
  /** Part de la remise combinée allouée à cette partie (prorata du sous-total) — 0 si la partie est vide. */
  discountCents: number;
  subtotalAfterDiscountCents: number;
  /** Frais d'expédition de CET envoi — le MÊME tarif que l'autre partie le cas échéant (règle « ×1 panier homogène, ×2 panier mixte ») ; `0` si la partie est vide (aucun envoi) ; `null` si le port est refusé pour le panier entier (`shipping.ok === false`). */
  shippingCents: number | null;
  totalCents: number | null;
}

export interface CartQuote {
  /** `true` ssi un code `free_shipping` valide est appliqué — dérivé du même verdict que la remise `fixed_cart` (cf. `totals.discountCents`, la remise réellement appliquée). */
  freeShippingCoupon: boolean;
  /** Résolution du barème sur le total COMBINÉ — le tarif d'UN SEUL envoi (règle 3), avant multiplication par `shipments`. */
  shipping: ShippingResult;
  /** Étiquette snapshotée sur `Orders.ts:shippingMethod` (les deux commandes en cas de scission) — dérivée du COÛT réellement calculé (cf. docstring du module). */
  shippingMethod: ShippingMethodLabel;
  /** `true` ssi le panier contient à la fois des lignes parues et des lignes précommande — scission en 2 commandes/2 envois. */
  split: boolean;
  /** Nombre d'envois facturés — 1 (panier homogène) ou 2 (panier mixte) ; 0 si les deux parties sont vides (défensif, ne devrait jamais arriver en aval d'un panier non vide). */
  shipments: number;
  /** Devis de la commande normale (lignes parues) — `subtotalCents === 0` si aucune. */
  normal: CartQuotePart;
  /** Devis de la précommande (lignes à paraître, flag ouvert) — `subtotalCents === 0` si aucune. */
  preorder: CartQuotePart;
  /** Totaux COMBINÉS (affichage global panier/vérification du montant Stripe) — somme exacte de `normal` + `preorder`. */
  totals: CartTotals;
}

/**
 * Compose le devis complet à partir des deux sous-totaux et d'un verdict
 * promo déjà résolu (évalué par l'appelant sur le sous-total COMBINÉ).
 *
 * Ordre des règles (fixe, identique aux appelants avant extraction, complété
 * 2026-08-20) :
 *  1. `freeShippingCoupon`/`discountCents` COMBINÉ dérivés du verdict promo.
 *  2. Port calculé UNE fois par `computeShipping` sur le total combiné (le
 *     coupon `free_shipping` y prime toujours sur la règle « manifeste »).
 *  3. `shipments` = nombre de parties non vides (0, 1 ou 2) ; `split` = les
 *     deux à la fois.
 *  4. Remise combinée allouée par partie au prorata du sous-total (troncature
 *     sur `normal`, reliquat sur `preorder` — cf. docstring du module).
 *  5. Chaque partie assemblée par `computeCartTotals`, avec pour port SOIT le
 *     tarif d'un envoi (partie non vide) SOIT 0 (partie vide) SOIT `null` (port
 *     refusé pour le panier entier).
 *  6. Totaux combinés = somme exacte des deux parties (`shippingCents`
 *     combiné = tarif × `shipments`, jamais recalculé autrement).
 *  7. `shippingMethod` dérivé EN DERNIER du coût réellement obtenu (même
 *     précédence qu'avant l'extraction, appliquée au coût, pas à la seule
 *     validité du coupon) : coupon `free_shipping` valide ET port
 *     effectivement à 0 → « offert » ; sinon panier « manifeste » →
 *     « réduit » ; sinon → « standard ». Étiquette PARTAGÉE par les deux
 *     commandes en cas de scission (même barème, même envoi unitaire).
 */
export function computeCartQuote(input: CartQuoteInput): CartQuote {
  const freeShippingCoupon = input.promoEval?.ok === true && input.promoEval.type === "free_shipping";
  const rawDiscountCents =
    input.promoEval?.ok === true && input.promoEval.type === "fixed_cart"
      ? input.promoEval.discountCents
      : 0;

  const combinedSubtotalCents = input.normalSubtotalCents + input.preorderSubtotalCents;

  const shipping = computeShipping({
    cartTotalCents: combinedSubtotalCents,
    zone: input.zone,
    manifestOnly: input.manifestOnly,
    freeShippingCoupon,
  });

  const shipments = (input.hasNormalLines ? 1 : 0) + (input.hasPreorderLines ? 1 : 0);
  const split = input.hasNormalLines && input.hasPreorderLines;

  // Plafonnée au sous-total combiné (même garde que `computeCartTotals`),
  // AVANT allocation — garantit que la somme des deux parts ne dépasse
  // jamais le sous-total combiné, quelle que soit la remise soumise.
  const safeDiscountCents = Math.max(0, Math.min(rawDiscountCents, combinedSubtotalCents));
  const normalDiscountCents =
    combinedSubtotalCents === 0
      ? 0
      : Math.floor((safeDiscountCents * input.normalSubtotalCents) / combinedSubtotalCents);
  const preorderDiscountCents = safeDiscountCents - normalDiscountCents;

  function buildPart(subtotalCents: number, hasLines: boolean, discountCents: number): CartQuotePart {
    if (!hasLines) {
      return { subtotalCents: 0, discountCents: 0, subtotalAfterDiscountCents: 0, shippingCents: 0, totalCents: 0 };
    }
    const partShippingCents = shipping.ok ? shipping.costCents : null;
    const totals = computeCartTotals(subtotalCents, discountCents, partShippingCents);
    return {
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      subtotalAfterDiscountCents: totals.subtotalAfterDiscountCents,
      shippingCents: totals.shippingCents,
      totalCents: totals.totalCents,
    };
  }

  const normal = buildPart(input.normalSubtotalCents, input.hasNormalLines, normalDiscountCents);
  const preorder = buildPart(input.preorderSubtotalCents, input.hasPreorderLines, preorderDiscountCents);

  const combinedShippingCents = shipping.ok ? shipping.costCents * shipments : null;
  const totals = computeCartTotals(combinedSubtotalCents, safeDiscountCents, combinedShippingCents);

  const shippingMethod: ShippingMethodLabel =
    freeShippingCoupon && shipping.ok && shipping.costCents === 0
      ? "offert"
      : input.manifestOnly
        ? "reduit"
        : "standard";

  return { freeShippingCoupon, shipping, shippingMethod, split, shipments, normal, preorder, totals };
}

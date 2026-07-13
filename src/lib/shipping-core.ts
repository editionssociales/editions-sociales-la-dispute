/**
 * Moteur pur des frais de port (plan phase 4 §4, étape 5 — commerce natif,
 * lot 2) — décalque de la grille R2 §2.7 (recopiée fidèlement, à la VALEUR du
 * panier, pas au poids). Zéro I/O, zéro import serveur (même style que
 * `campaign.ts`/`browse.ts` — cœur pur testé sans réseau, sans Payload).
 *
 * Montants toujours en CENTIMES entiers (jamais de flottant — un flottant sur
 * de l'argent est le bug qu'on ne voit qu'en prod).
 */

/** Zones vendues — toute autre zone est refusée (règle produit, pas encore de vente hors FR/BE/CH). */
export type ShippingZone = "FR" | "BE" | "CH";

const SHIPPING_ZONES: readonly ShippingZone[] = ["FR", "BE", "CH"];

function isShippingZone(zone: string): zone is ShippingZone {
  return (SHIPPING_ZONES as readonly string[]).includes(zone);
}

/** Tarif du port réduit « manifeste » (panier composé UNIQUEMENT d'articles `reducedShippingFlag`). */
export const MANIFEST_SHIPPING_COST_CENTS = 250; // 2,50 €

/** Plancher (inclus) du panier pour que le coupon `free_shipping` s'applique. */
export const FREE_SHIPPING_MIN_CART_CENTS = 5000; // 50,00 €

/**
 * Entrée d'un palier de la grille standard (bornes inclusives, en centimes).
 * `label` documente la borne en euros pour la lecture humaine du module —
 * n'entre dans aucun calcul.
 */
interface StandardTier {
  minCents: number;
  maxCents: number;
  costCents: number;
  label: string;
}

/**
 * La grille R2 §2.7 LISSÉE (décision client relayée le 13/07 : « combler les
 * trous ») : les bornes publiées 0–10 / 11–24 / 25–49 / 50–500 laissaient
 * trois plages orphelines (10,01–10,99 · 24,01–24,99 · 49,01–49,99), gérées
 * jusqu'ici par une table de décisions provisoire au défaut conservateur
 * « palier supérieur ». Le lissage entérine exactement ce défaut : chaque
 * palier s'étend désormais jusqu'au centime sous le palier suivant — la
 * grille couvre [0, 500 €] sans trou, à comportement STRICTEMENT identique
 * (aucun montant ne change de tarif). Au-delà de 500 € : refus assumé
 * (`CART_MAX_CENTS`), la commande sort du parcours automatisé.
 */
const STANDARD_TIERS: readonly StandardTier[] = [
  { minCents: 0, maxCents: 1000, costCents: 200, label: "0–10 €" },
  { minCents: 1001, maxCents: 2400, costCents: 450, label: "10,01–24 €" },
  { minCents: 2401, maxCents: 4900, costCents: 550, label: "24,01–49 €" },
  { minCents: 4901, maxCents: 50000, costCents: 650, label: "49,01–500 €" },
];

/** Plafond (inclus) du panier vendable en ligne — au-delà, refus explicite (plan §4 étape 5, « > 500 → refus avec message »). */
export const CART_MAX_CENTS = 50000; // 500,00 €

const CART_TOO_HIGH_MESSAGE =
  "Panier de plus de 500 € — hors grille de port automatisée, commande à traiter par email.";

/** Ce que le module a besoin de savoir sur le panier pour calculer le port — rien de plus (pas les lignes, pas les prix). */
export interface ShippingRequest {
  /** Total TTC du panier, en CENTIMES entiers. */
  cartTotalCents: number;
  /** Zone de livraison déclarée par le client (code pays). */
  zone: string;
  /**
   * `true` ssi le panier est composé UNIQUEMENT d'articles
   * `commerce.reducedShippingFlag` (règle « manifeste », calculée par
   * l'appelant à partir des lignes — ce module ne connaît pas les lignes).
   */
  manifestOnly: boolean;
  /**
   * `true` ssi un code promo de type `free_shipping`, valide et non expiré,
   * est appliqué au panier — la validité du code est vérifiée en amont
   * (`promoCodes`), ce module ne voit que le fait « port gratuit demandé ».
   */
  freeShippingCoupon: boolean;
}

export type ShippingRefusalReason = "zone" | "cart-too-high";

export type ShippingResult =
  | { ok: true; costCents: number }
  | { ok: false; reason: ShippingRefusalReason; message: string };

/**
 * Résout le palier standard applicable à un total de panier — ne connaît ni
 * le coupon ni la règle manifeste, appelée seulement après que
 * `computeShipping` a écarté ces deux cas prioritaires.
 */
function resolveStandardShipping(cartTotalCents: number): ShippingResult {
  if (cartTotalCents > CART_MAX_CENTS) {
    return { ok: false, reason: "cart-too-high", message: CART_TOO_HIGH_MESSAGE };
  }

  for (const tier of STANDARD_TIERS) {
    if (cartTotalCents >= tier.minCents && cartTotalCents <= tier.maxCents) {
      return { ok: true, costCents: tier.costCents };
    }
  }

  // Filet de sécurité : ne doit jamais se déclencher — la grille lissée
  // couvre [0, CART_MAX_CENTS] sans trou (propriété verrouillée par test).
  throw new Error(
    `shipping-core: aucun palier ne couvre ${cartTotalCents} centimes — grille incomplète.`,
  );
}

/**
 * Calcule le coût du port pour un panier, en centimes TTC — ou un refus
 * explicite (zone non vendue, panier au-delà de la grille).
 *
 * Ordre des règles (chacune peut court-circuiter la suivante) :
 * 1. Zone non vendue (hors FR/BE/CH) → refus immédiat, avant tout calcul.
 * 2. Coupon `free_shipping` ET panier ≥ 50 € → 0 (gratuit).
 * 3. Panier « manifeste » (uniquement des articles à port réduit) → 2,50 €
 *    forfaitaire, quel que soit le montant — règle au format, pas à la
 *    valeur, donc non soumise à la grille standard ni à son refus > 500 €.
 * 4. Sinon, grille standard lissée (refus explicite au-delà de `CART_MAX_CENTS`).
 */
export function computeShipping(request: ShippingRequest): ShippingResult {
  if (!Number.isInteger(request.cartTotalCents) || request.cartTotalCents < 0) {
    throw new TypeError(
      `computeShipping: cartTotalCents doit être un entier de centimes ≥ 0 (reçu ${request.cartTotalCents}) — jamais de flottant.`,
    );
  }

  const zone = request.zone.trim().toUpperCase();
  if (!isShippingZone(zone)) {
    return {
      ok: false,
      reason: "zone",
      message: `Livraison non vendue en zone « ${request.zone} » — seules FR/BE/CH sont desservies.`,
    };
  }

  if (request.freeShippingCoupon && request.cartTotalCents >= FREE_SHIPPING_MIN_CART_CENTS) {
    return { ok: true, costCents: 0 };
  }

  if (request.manifestOnly) {
    return { ok: true, costCents: MANIFEST_SHIPPING_COST_CENTS };
  }

  return resolveStandardShipping(request.cartTotalCents);
}

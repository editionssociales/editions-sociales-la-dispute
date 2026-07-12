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
 * La grille R2 §2.7, telle que publiée : 0–10 € → 2,00 · 11–24 € → 4,50 ·
 * 25–49 € → 5,50 · 50–500 € → 6,50. Les bornes ci-dessous sont EXACTEMENT
 * celles-là — les trous entre paliers (10–11 €, 24–25 €, 49–50 €) sont
 * volontairement absents d'ici : ils sont traités séparément par
 * `GRID_HOLE_DECISIONS` ci-dessous, seul endroit qui doit bouger le jour où
 * le client tranche (15/07).
 */
const STANDARD_TIERS: readonly StandardTier[] = [
  { minCents: 0, maxCents: 1000, costCents: 200, label: "0–10 €" },
  { minCents: 1100, maxCents: 2400, costCents: 450, label: "11–24 €" },
  { minCents: 2500, maxCents: 4900, costCents: 550, label: "25–49 €" },
  { minCents: 5000, maxCents: 50000, costCents: 650, label: "50–500 €" },
];

/** Comment un trou de la grille est tranché — soit rattaché au coût d'un palier existant, soit un refus pur et simple. */
type HoleDecision =
  | { kind: "attach-tier"; tierIndex: number }
  | { kind: "refuse"; message: string };

/**
 * Un trou de la grille — plage NON couverte par `STANDARD_TIERS` — et la
 * décision qui s'y applique.
 */
interface GridHole {
  id: string;
  /** Plage inclusive du trou, en centimes. `Infinity` autorisé en borne haute (trou `>500 €`). */
  rangeCents: readonly [number, number];
  decision: HoleDecision;
  /** Justification humaine — apparaît telle quelle dans les tests et la doc, jamais recopiée ailleurs. */
  note: string;
}

/**
 * TABLE DE DÉCISIONS — les QUATRE trous de la grille R2 §2.7, avec le
 * défaut CONSERVATEUR retenu en attendant l'arbitrage client :
 * **rattacher au palier SUPÉRIEUR** (le client ne paie jamais moins cher que
 * ce à quoi la grille publiée lui donne droit).
 *
 * TODO décision client 15/07 : chacune des trois premières entrées peut être
 * retranchée à `{ kind: "refuse", message: "…" }` ou basculée vers un autre
 * `tierIndex` sans toucher au reste du module — c'est le seul endroit à
 * modifier. La quatrième (`>500 €`) n'est PAS un choix de tarif : au-delà du
 * dernier palier vendu, la commande sort du parcours automatisé (grille non
 * prévue au-delà de 500 €) et doit être traitée par email — cf. plan §4
 * étape 5, « > 500 → refus avec message ».
 */
export const GRID_HOLE_DECISIONS: readonly GridHole[] = [
  {
    id: "10-11",
    rangeCents: [1001, 1099],
    decision: { kind: "attach-tier", tierIndex: 1 }, // 11–24 €, 4,50 €
    note:
      "TODO décision client 15/07 — défaut conservateur : rattaché au palier " +
      "supérieur (11–24 €, 4,50 €).",
  },
  {
    id: "24-25",
    rangeCents: [2401, 2499],
    decision: { kind: "attach-tier", tierIndex: 2 }, // 25–49 €, 5,50 €
    note:
      "TODO décision client 15/07 — défaut conservateur : rattaché au palier " +
      "supérieur (25–49 €, 5,50 €).",
  },
  {
    id: "49-50",
    rangeCents: [4901, 4999],
    decision: { kind: "attach-tier", tierIndex: 3 }, // 50–500 €, 6,50 €
    note:
      "TODO décision client 15/07 — défaut conservateur : rattaché au palier " +
      "supérieur (50–500 €, 6,50 €).",
  },
  {
    id: ">500",
    rangeCents: [50001, Infinity],
    decision: {
      kind: "refuse",
      message:
        "Panier de plus de 500 € — hors grille de port automatisée, commande à traiter par email.",
    },
    note:
      "Pas un trou de tarif : au-delà du dernier palier vendu (500 €), refus " +
      "assumé — cf. plan §4 étape 5.",
  },
];

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
 * Résout le palier standard (ou le trou) applicable à un total de panier —
 * ne connaît ni le coupon ni la règle manifeste, appelée seulement après que
 * `computeShipping` a écarté ces deux cas prioritaires.
 */
function resolveStandardShipping(cartTotalCents: number): ShippingResult {
  for (const tier of STANDARD_TIERS) {
    if (cartTotalCents >= tier.minCents && cartTotalCents <= tier.maxCents) {
      return { ok: true, costCents: tier.costCents };
    }
  }

  for (const hole of GRID_HOLE_DECISIONS) {
    const [min, max] = hole.rangeCents;
    if (cartTotalCents >= min && cartTotalCents <= max) {
      if (hole.decision.kind === "refuse") {
        return { ok: false, reason: "cart-too-high", message: hole.decision.message };
      }
      return { ok: true, costCents: STANDARD_TIERS[hole.decision.tierIndex].costCents };
    }
  }

  // Filet de sécurité : ne doit jamais se déclencher si STANDARD_TIERS et
  // GRID_HOLE_DECISIONS couvrent bien tout [0, +∞) — sinon la grille a un
  // trou non documenté, à corriger dans ce module plutôt que dans l'appelant.
  throw new Error(
    `shipping-core: aucun palier ni trou ne couvre ${cartTotalCents} centimes — grille incomplète.`,
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
 * 4. Sinon, grille standard (paliers + trous, cf. `GRID_HOLE_DECISIONS`).
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

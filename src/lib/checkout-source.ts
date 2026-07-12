import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import { normalizePromoCode } from "@/payload/lib/promo-code";
import type { PromoCodeLike } from "@/payload/lib/promo-eval-core";
import type { CheckoutBookLookup } from "./checkout-core";

/**
 * Lecture Payload dédiée du checkout (plan §4 étape 8) — SÉPARÉE du port
 * `CatalogueSource`/`catalogue-core.ts` et de `cart-source.ts`, même
 * raisonnement que ce dernier (cf. son docblock) : le checkout a besoin d'un
 * `CheckoutBookLookup` par livre — `stock` en NOMBRE exploitable (« stock
 * suffisant » compare à la quantité demandée, pas seulement `> 0`) — une
 * forme que ni `Book` (catalogue fusionné, `stock` disparaît derrière
 * `status`) ni `CommerceInfo` (booléen + stock collapsé côté client du
 * panier) ne portent. Même style que `cart-source.ts`/`catalogue-pg.ts` :
 * server-only, `getPayload({config})` mémoïsé par Payload, `overrideAccess:
 * false` (jamais un brouillon dépublié servi au checkout public), `depth: 0`
 * (les groupes `buy`/`commerce` sont toujours présents quelle que soit la
 * profondeur — seules les relations en dépendent, aucune ici).
 */
export async function getCheckoutBookRecords(
  ids: number[],
): Promise<Map<number, CheckoutBookLookup>> {
  if (ids.length === 0) return new Map();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { id: { in: ids } },
    draft: false,
    overrideAccess: false,
    depth: 0,
    limit: ids.length,
  });
  return new Map(
    docs.map((doc) => [
      doc.id,
      {
        title: doc.title,
        isbn: doc.isbn ?? null,
        priceEuros: doc.prix ?? null,
        publishedAt: doc.dateParution ? doc.dateParution.slice(0, 10) : null,
        sellable: Boolean(doc.commerce?.sellable),
        stock: doc.commerce?.stock ?? null,
        reducedShippingFlag: Boolean(doc.commerce?.reducedShippingFlag),
      } satisfies CheckoutBookLookup,
    ]),
  );
}

/**
 * Un code promo trouvé, avec son `id` Payload — nécessaire ici (contrairement
 * à `panier/actions.ts:validatePromoCode`, qui n'évalue que le code) pour
 * poser `Orders.promoCode` (relation) au webhook. Duplique volontairement la
 * petite requête `promo-codes` de `panier/actions.ts` plutôt que d'y coupler
 * ce module — même raisonnement que `cart-source.ts` vis-à-vis de
 * `catalogue-source.ts` : deux appelants avec des besoins de forme légèrement
 * différents (id en plus, ici), mieux servis par deux lectures minces que par
 * une abstraction partagée prématurée.
 */
export interface PromoCodeRecord extends PromoCodeLike {
  id: number;
}

export async function getPromoCodeRecord(code: string): Promise<PromoCodeRecord | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "promo-codes",
    where: { code: { equals: normalizePromoCode(code) } },
    // Pas de lecture publique sur cette collection (cf. `PromoCodes.ts`) — ce
    // endpoint serveur (le checkout) en est un lecteur légitime, jamais une
    // lecture REST publique.
    overrideAccess: true,
    limit: 1,
  });
  const doc = docs[0];
  if (!doc) return null;
  return {
    id: doc.id,
    code: doc.code,
    type: doc.type,
    amount: doc.amount ?? null,
    minCart: doc.minCart ?? null,
    expiresAt: doc.expiresAt ?? null,
    active: Boolean(doc.active),
  };
}

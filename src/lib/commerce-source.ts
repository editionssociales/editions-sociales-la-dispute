import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import { PUBLIC_BOOKS_READ } from "./catalogue-source";
import type { CheckoutBookLookup } from "./checkout-core";
import { normalizePromoCode, type PromoCodeLike } from "./promo-core";

/**
 * Lecture Payload dédiée du parcours d'achat — le SEUL module qui relit
 * fraîchement les faits de vente (`books`) et les codes promo (`promo-codes`)
 * pour le commerce natif. Une interface, trois appelants : le panier
 * (`panier/actions.ts` — drapeaux de port réduit, évaluation promo), le
 * checkout (`api/checkout/route.ts` — re-validation intégrale) et le webhook
 * (`api/stripe/webhook/order-handler.ts` — snapshot + décrément de stock).
 *
 * Fusionne `cart-source.ts`, `checkout-source.ts` et la requête promo inline
 * de `panier/actions.ts` — revient sur leur décision « deux lectures minces
 * plutôt qu'une abstraction partagée », datée d'une mission close dont la
 * contrainte (« les tests existants passent inchangés ») ne tient plus : les
 * projections s'emboîtaient (drapeaux ⊂ lookup), le mapping promo était écrit
 * deux fois, et le contrat anti-brouillon recopié à la main. Ici
 * `PUBLIC_BOOKS_READ` est importé, plus jamais réénoncé — verrouillé par
 * `commerce-source.test.ts`, même patron que `catalogue-pg.test.ts`.
 *
 * Reste HORS du port `CatalogueSource` : le catalogue fusionné collapse
 * `stock` en statut, le parcours d'achat a besoin du NOMBRE
 * (`CheckoutBookLookup`, forme possédée par `checkout-core.ts` — son lecteur
 * le plus riche ; le panier n'en projette que `reducedShippingFlag`). Même
 * style que `catalogue-pg.ts` : server-only, `getPayload({config})` mémoïsé
 * par Payload (singleton par process), pas de `cache()` React.
 */

/** Faits de vente frais des livres demandés (ceux du panier ou de la commande) — un id introuvable est simplement absent de la carte. */
export async function getCommerceBookRecords(
  ids: number[],
): Promise<Map<number, CheckoutBookLookup>> {
  if (ids.length === 0) return new Map();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { id: { in: ids } },
    // Jamais un brouillon dépublié servi au parcours d'achat public.
    ...PUBLIC_BOOKS_READ,
    // Les groupes `buy`/`commerce` sont toujours présents quelle que soit la
    // profondeur — seules les relations en dépendent, aucune ici.
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
        preorderEnabled: Boolean(doc.commerce?.preorder),
      } satisfies CheckoutBookLookup,
    ]),
  );
}

/** Un code promo trouvé, avec son `id` Payload — nécessaire au webhook pour poser `Orders.promoCode` (relation). */
export interface PromoCodeRecord extends PromoCodeLike {
  id: number;
}

export async function getPromoCodeRecord(code: string): Promise<PromoCodeRecord | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "promo-codes",
    where: { code: { equals: normalizePromoCode(code) } },
    // Pas de lecture publique sur cette collection (cf. `PromoCodes.ts`) — un
    // code promo listable serait énumérable ; les seuls lecteurs sont des
    // contextes serveur (panier, checkout), jamais une lecture REST publique.
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

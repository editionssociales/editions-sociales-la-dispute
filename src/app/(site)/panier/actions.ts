"use server";

import config from "@payload-config";
import { getPayload } from "payload";
import { getAllBooks } from "@/lib/catalogue";
import { pickBooksByIds } from "@/lib/cart-core";
import { getReducedShippingFlags } from "@/lib/cart-source";
import { normalizePromoCode } from "@/payload/lib/promo-code";
import { evaluatePromoCode, type PromoEvalResult } from "@/payload/lib/promo-eval-core";
import type { Book } from "@/lib/types";

/**
 * Server actions de `/panier` (plan §4 étape 6) — le panier lui-même (ids +
 * quantités) ne vit que côté client (`localStorage`, `cart-core.ts`) ; ces
 * deux façades minces sont tout ce que le client va chercher au serveur :
 *
 *  - `getCartSnapshot` relit le catalogue COURANT (prix, statut, mode
 *    d'achat — jamais depuis le panier lui-même) pour les seules lignes
 *    présentes, plus le drapeau de port réduit par ligne (lecture séparée,
 *    cf. `cart-source.ts`) ;
 *  - `validatePromoCode` valide un code contre la collection `promo-codes`
 *    (pas de lecture publique — `overrideAccess: true`, cf. `PromoCodes.ts`)
 *    et l'évalue contre le sous-total courant (`promo-eval-core.ts`, pur).
 */

export interface CartSnapshot {
  books: Book[];
  reducedShippingFlags: { id: number; flag: boolean }[];
}

/** Relecture serveur des lignes du panier — jamais de prix/statut lus depuis le client. */
export async function getCartSnapshot(ids: number[]): Promise<CartSnapshot> {
  if (ids.length === 0) return { books: [], reducedShippingFlags: [] };
  const [all, flags] = await Promise.all([getAllBooks(), getReducedShippingFlags(ids)]);
  return {
    books: pickBooksByIds(all, ids),
    reducedShippingFlags: [...flags].map(([id, flag]) => ({ id, flag })),
  };
}

/**
 * Valide un code promo contre le sous-total courant. `cartTotalCents` est le
 * sous-total BRUT (avant remise, cf. `promo-eval-core.ts`) — recalculé par
 * l'appelant à partir du dernier `getCartSnapshot`, jamais transmis tel quel
 * par un simple champ de formulaire non revérifié.
 */
export async function validatePromoCode(
  code: string,
  cartTotalCents: number,
): Promise<PromoEvalResult> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "promo-codes",
    where: { code: { equals: normalizePromoCode(code) } },
    // Pas de lecture publique sur cette collection (cf. `PromoCodes.ts`) : ce
    // endpoint serveur en est le seul lecteur côté parcours d'achat, jamais
    // une lecture REST publique — un code promo listable serait énumérable.
    overrideAccess: true,
    limit: 1,
  });
  const doc = docs[0];
  return evaluatePromoCode(
    doc
      ? {
          code: doc.code,
          type: doc.type,
          amount: doc.amount ?? null,
          minCart: doc.minCart ?? null,
          expiresAt: doc.expiresAt ?? null,
          active: Boolean(doc.active),
        }
      : null,
    cartTotalCents,
  );
}

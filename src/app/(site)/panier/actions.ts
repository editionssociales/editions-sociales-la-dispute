"use server";

import { getAllBooks } from "@/lib/catalogue";
import { pickBooksByIds } from "@/lib/cart-core";
import { getCommerceBookRecords, getPromoCodeRecord } from "@/lib/commerce-source";
import { evaluatePromoCode, type PromoEvalResult } from "@/lib/promo-core";
import type { CartSnapshot } from "./snapshot";

/**
 * Server actions de `/panier` (plan §4 étape 6) — le panier lui-même (ids +
 * quantités) ne vit que côté client (`localStorage`, `cart-core.ts`) ; ces
 * deux façades minces sont tout ce que le client va chercher au serveur, et
 * toute l'I/O Payload passe par le seam `commerce-source.ts` (plus aucune
 * requête inline ici) :
 *
 *  - `getCartSnapshot` relit le catalogue COURANT (prix, statut, mode
 *    d'achat — jamais depuis le panier lui-même) pour les seules lignes
 *    présentes, et projette le drapeau de port réduit par ligne depuis les
 *    faits de vente frais (`getCommerceBookRecords`) ;
 *  - `validatePromoCode` relit un code (`getPromoCodeRecord` — normalisation
 *    et accès collection assumés par le seam) et l'évalue contre le
 *    sous-total courant (`promo-core.ts`, pur).
 *
 * Types : `./snapshot` — un fichier `"use server"` ne peut exporter que des
 * async functions.
 */

/** Relecture serveur des lignes du panier — jamais de prix/statut lus depuis le client. */
export async function getCartSnapshot(ids: number[]): Promise<CartSnapshot> {
  if (ids.length === 0) return { books: [], reducedShippingFlags: [] };
  const [all, records] = await Promise.all([getAllBooks(), getCommerceBookRecords(ids)]);
  return {
    books: pickBooksByIds(all, ids),
    reducedShippingFlags: [...records].map(([id, record]) => ({
      id,
      flag: record.reducedShippingFlag,
    })),
  };
}

/**
 * Valide un code promo contre le sous-total courant. `cartTotalCents` est le
 * sous-total BRUT (avant remise, cf. `promo-core.ts`) — recalculé par
 * l'appelant à partir du dernier `getCartSnapshot`, jamais transmis tel quel
 * par un simple champ de formulaire non revérifié.
 */
export async function validatePromoCode(
  code: string,
  cartTotalCents: number,
): Promise<PromoEvalResult> {
  return evaluatePromoCode(await getPromoCodeRecord(code), cartTotalCents);
}

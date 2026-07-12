import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";

/**
 * Lecture Payload dédiée du panier (plan §4 étape 6) — SÉPARÉE du port
 * `CatalogueSource`/`catalogue-core.ts` à dessein : `commerce.reducedShippingFlag`
 * (règle de port « manifeste », `shipping-core.ts`) n'est ni fusionné ni testé
 * par `catalogue-pg-map.test.ts`/`catalogue-core.test.ts` aujourd'hui — l'y
 * ajouter aurait changé la forme de `CommerceInfo`/`resolveNativePurchase` et
 * cassé leurs assertions `toEqual` existantes (contrat de cette mission :
 * « les tests existants passent inchangés »). Ce module lit donc le champ
 * séparément, par lot d'ids (ceux du panier), comme `highlight.ts` lit une
 * collection back-office hors du port catalogue. Même style que
 * `catalogue-pg.ts` : server-only, `getPayload({config})` déjà mémoïsé par
 * Payload (singleton par process), `overrideAccess: false` (jamais un
 * brouillon dépublié servi au panier public).
 */
export async function getReducedShippingFlags(ids: number[]): Promise<Map<number, boolean>> {
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
  return new Map(docs.map((doc) => [doc.id, Boolean(doc.commerce?.reducedShippingFlag)]));
}

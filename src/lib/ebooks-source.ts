import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";

/**
 * Seam Payload dédié au drapeau « vendu uniquement en numérique »
 * (`Ebooks.ts:numeriqueSeul`, client 2026-09-09) — même esprit que
 * `commerce-source.ts`/`order-source.ts` : un module nommé plutôt qu'un
 * `getPayload` inline à chaque appelant. Trois appelants : `catalogue-pg.ts`
 * (statut d'achat public), `commerce-source.ts` (re-validation checkout) et
 * `src/payload/admin/dashboard/data.ts` (vue `/admin/stock`, un titre
 * numérique seul n'a rien à y faire).
 *
 * Distinct de `order-source.ts:findBookIdsWithEbook` : « a un fichier
 * numérique » (déclenche le lien de téléchargement après achat, toujours vrai
 * pour une ligne `ebooks`) et « vendu UNIQUEMENT en numérique » (déclenche
 * l'absence d'envoi — port/adresse/stock) sont deux faits indépendants — un
 * livre papier accompagné d'un ePub a un fichier mais n'est PAS
 * `numeriqueSeul`. D'où la requête filtrée `numeriqueSeul: { equals: true }`
 * plutôt qu'une réutilisation de ce helper.
 *
 * `overrideAccess: true` : `Ebooks.access.read` est restreint
 * (`isAdminOrEditor`, un fichier numérique payant ne se lit pas sans achat) —
 * mais le DRAPEAU lui-même (contrairement au fichier) conditionne un fait
 * public (port, adresse au checkout, statut catalogue), les trois appelants
 * ci-dessus servent un public anonyme.
 */

/**
 * Parmi un lot d'ids de livres, ceux dont le fichier numérique est coché
 * `numeriqueSeul` — requête UNIQUE pour tout le lot (jamais de N+1), même
 * patron que `order-source.ts:findBookIdsWithEbook`.
 */
export async function findDigitalOnlyBookIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "ebooks",
    where: { livre: { in: ids }, numeriqueSeul: { equals: true } },
    depth: 0,
    limit: 0,
    pagination: false,
    select: { livre: true },
    overrideAccess: true,
  });
  return new Set(
    docs.flatMap((doc) => (typeof doc.livre === "number" ? [doc.livre] : [doc.livre.id])),
  );
}

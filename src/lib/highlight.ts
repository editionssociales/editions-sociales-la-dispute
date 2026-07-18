import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Highlight } from "@/payload-types";

/**
 * Mise en avant ponctuelle (E6bis du plan, engagement C32 du devis) — lit la
 * collection Payload `highlight` via la Local API, comme `catalogue-pg.ts`
 * (E4) : c'est une fonctionnalité **back-office uniquement**, hors du port
 * `CatalogueSource` — toujours lue depuis Postgres.
 *
 * Le filtre « actif » est pré-appliqué dans la requête (`where`) ; le filtre
 * de date est recalculé côté appelant, en jour (`YYYY-MM-DD`) plutôt qu'à
 * l'horodatage exact — `dateDebut`/`dateFin` sont saisis en `dayOnly`
 * (`Highlight.ts`) : comparer à l'instant précis (`now.toISOString()`) ferait
 * disparaître le bandeau dès minuit le jour de fin au lieu de rester visible
 * jusqu'à sa fin, même biais que celui déjà corrigé pour `publishedAt` dans
 * `resolvePurchase` (`catalogue-core.ts`). Une seule mise en avant peut être
 * éligible à la fois par construction (le back-office n'empêche pas de dater
 * deux campagnes qui se chevauchent — `-updatedAt` départage en prenant la
 * plus récemment éditée).
 *
 * Dégrade en `null` (bandeau masqué) sur toute erreur Payload/Postgres —
 * schéma pas encore migré, Neon indisponible, etc. — plutôt que de faire
 * planter la page d'accueil : cette lecture reste hors du contrat
 * `CatalogueSource`, mais le contrat de dégradation gracieuse de
 * `src/lib/CLAUDE.md` s'applique quand même, la page d'accueil n'ayant aucune
 * raison de dépendre de la disponibilité de ce bandeau optionnel.
 */
export async function getActiveHighlight(): Promise<Highlight | null> {
  try {
    const payload = await getPayload({ config });
    const today = new Date().toISOString().slice(0, 10);
    const { docs } = await payload.find({
      collection: "highlight",
      where: { actif: { equals: true } },
      sort: "-updatedAt",
      limit: 0,
    });
    return (
      docs.find((doc) => doc.dateDebut.slice(0, 10) <= today && doc.dateFin.slice(0, 10) >= today) ??
      null
    );
  } catch (err) {
    console.error("[highlight] lecture Payload indisponible — bandeau masqué :", err);
    return null;
  }
}

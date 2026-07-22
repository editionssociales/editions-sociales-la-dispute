import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Book, Media, Rencontre as PayloadRencontre } from "@/payload-types";
import type { EditionSlug } from "./types";

/**
 * Agenda des rencontres (page `/rencontres`) — lit la collection Payload
 * `rencontres` via la Local API, comme `highlight.ts` : fonctionnalité
 * back-office uniquement, hors du port `CatalogueSource`, toujours lue depuis
 * Postgres. Remplace `rencontres-data.ts` (données provisoires, supprimé).
 */

/** Image résolue, prête à rendre (`Cover`/`BookCover`, `src/lib/cover.tsx`). */
export interface RencontreImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** Livre lié — juste de quoi construire le lien vers sa fiche (`book-card.tsx`). */
export interface RencontreLivre {
  slug: string;
  titre: string;
  /**
   * Absent de la forme Payload brute utilisée ailleurs, mais indispensable
   * ici : l'URL d'une fiche livre dépend du fonds (`/catalogue/[edition]/[slug]`)
   * ou de son absence (`/boutique/[slug]`) — cf. `book-card.tsx`. L'omettre
   * ferait construire un lien faux pour tout livre boutique-seul.
   */
  edition: EditionSlug | null;
}

/** Forme d'affichage d'une rencontre — image et livre déjà résolus. */
export interface Rencontre {
  id: string | number;
  titre: string;
  /** ISO `YYYY-MM-DD` — formatée à l'affichage via `formatDateFr`. */
  date: string;
  heure?: string;
  lieu: string;
  ville: string;
  intervenants?: string;
  description: string;
  /** Image dédiée si renseignée, sinon couverture du livre lié, sinon `null`. */
  image: RencontreImage | null;
  livre: RencontreLivre | null;
}

export interface RencontresSplit {
  aVenir: Rencontre[];
  passees: Rencontre[];
}

/** Un champ relation Payload est-il peuplé (objet) plutôt que renvoyé comme simple id ? */
function isPopulated<T extends { id: number }>(
  value: number | T | null | undefined,
): value is T {
  return typeof value === "object" && value !== null;
}

/** `Media` peuplé → image d'affichage, `alt` avec repli — `null` si absent ou incomplet. */
function toImage(
  value: number | Media | null | undefined,
  altFallback: string,
): RencontreImage | null {
  if (!isPopulated<Media>(value) || !value.url || !value.width || !value.height) return null;
  return {
    url: value.url,
    width: value.width,
    height: value.height,
    alt: value.alt?.trim() || altFallback,
  };
}

/** `Book` peuplé → juste de quoi lier vers la fiche — `null` si absent ou non peuplé. */
function toLivre(value: number | Book | null | undefined): RencontreLivre | null {
  if (!isPopulated<Book>(value)) return null;
  return { slug: value.slug, titre: value.title, edition: value.edition ?? null };
}

/**
 * Document `rencontres` Payload (Local API, `depth: 2` — peuple `livre` ET
 * `livre.cover`) → forme d'affichage. Résolution image (contrat mission) :
 * `image` de l'événement si présente, sinon couverture du livre lié, sinon
 * aucune colonne image (jamais de placeholder gris, cf. page publique). `alt`
 * pertinent : celui du média s'il est renseigné, sinon le titre du livre lié
 * (ou celui de la rencontre si aucun livre n'est lié).
 */
export function rencontreFromDoc(doc: PayloadRencontre): Rencontre {
  const livre = toLivre(doc.livre);
  const altFallback = livre?.titre ?? doc.titre;
  const image =
    toImage(doc.image, altFallback) ??
    (isPopulated<Book>(doc.livre) ? toImage(doc.livre.cover, altFallback) : null);

  return {
    id: doc.id,
    titre: doc.titre,
    date: doc.date.slice(0, 10),
    heure: doc.heure ?? undefined,
    lieu: doc.lieu,
    ville: doc.ville,
    intervenants: doc.intervenants ?? undefined,
    description: doc.description,
    image,
    livre,
  };
}

/**
 * Découpe + trie une liste de rencontres — PURE, testée isolément
 * (`rencontres.test.ts`). `today` en `YYYY-MM-DD` (comparaison lexicographique
 * sur l'ISO, même convention que `highlight.ts`) : à venir = date >=
 * aujourd'hui (aujourd'hui même compte comme à venir), tri ASCENDANT (la plus
 * proche d'abord) ; passées = date < aujourd'hui, tri DESCENDANT (la plus
 * récente d'abord — montre la vie de la maison en remontant dans le temps).
 */
export function splitRencontres(events: Rencontre[], today: string): RencontresSplit {
  const aVenir = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const passees = events
    .filter((e) => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { aVenir, passees };
}

/**
 * Lit l'agenda complet et le découpe/trie autour d'aujourd'hui. `depth: 2` :
 * peuple `livre` ET `livre.cover` en un seul aller (même profondeur que
 * `catalogue-pg.ts`, pour la même raison — le repli image en a besoin).
 * `overrideAccess: false` : fait jouer la policy `read` du livre lié
 * (`_status: 'published'` pour un anonyme, `Books.ts`) — un brouillon ne doit
 * pas fuiter via l'agenda public, même contrat anti-brouillon que le
 * catalogue (`catalogue-source.ts:PUBLIC_BOOKS_READ`).
 *
 * Dégrade en agenda vide sur toute erreur Payload/Postgres — schéma pas
 * encore migré, Neon indisponible — plutôt que de faire planter la page,
 * même contrat de dégradation gracieuse que `highlight.ts`.
 */
export async function getRencontres(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<RencontresSplit> {
  try {
    const payload = await getPayload({ config });
    const { docs } = await payload.find({
      collection: "rencontres",
      depth: 2,
      sort: "-date",
      limit: 0,
      draft: false,
      overrideAccess: false,
    });
    return splitRencontres(docs.map(rencontreFromDoc), today);
  } catch (err) {
    console.error("[rencontres] lecture Payload indisponible — agenda vide :", err);
    return { aVenir: [], passees: [] };
  }
}

import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import type { Author, Book as PayloadBook, Libelle, Media } from "@/payload-types";
import type { CommerceInfo, RawBook } from "./catalogue-source";
import type { Cover, Term } from "./types";

/**
 * `lexical` (le paquet) n'est pas une dépendance directe du site — seulement
 * une dépendance transitive de `@payloadcms/richtext-lexical` (pnpm ne la
 * hisse pas). On récupère donc le type de `data` structurellement depuis la
 * signature déjà résolue de `convertLexicalToHTML`, sans l'importer nous-mêmes.
 */
type LexicalData = Parameters<typeof convertLexicalToHTML>[0]["data"];

/**
 * Mapper **pur** Payload → forme brute neutre du port (`RawBook`), symétrique
 * de `catalogue-wp-map.ts` : `catalogue-pg.ts` (E4 du plan) l'applique aux
 * documents lus par la Local API, `catalogue-core.ts` ne voit jamais la
 * différence. Les données Payload étant déjà propres (nombres, ISO, texte nu),
 * le mapping va droit — plus de fausse enveloppe WordPress à fabriquer.
 *
 * Le parachute de parité (contrat `site/CLAUDE.md`) vit ici : tant qu'une
 * fiche n'a jamais été retouchée par un humain dans Payload
 * (`contentTouched=false`, jamais posé par l'import de migration), le HTML
 * WordPress importé (`*LegacyHtml`) reste la source de rendu — le Lexical
 * n'est converti que pour les fiches réellement rééditées.
 */

/** Rendu HTML d'un contenu Lexical Payload (racine `{ root }` ou vide/absent). */
export function lexicalToHtml(data: unknown): string {
  if (!data || typeof data !== "object" || !("root" in data)) return "";
  return convertLexicalToHTML({
    data: data as LexicalData,
    // Pas de `<div class="payload-richtext">` : `sanitizeCms` (aval) le
    // dépouillerait de toute façon (aucun attribut autorisé sur `div`), et le
    // HTML legacy (`*LegacyHtml`, ex `content.rendered` WP) n'a jamais ce
    // conteneur — même forme des deux côtés du bascule.
    disableContainer: true,
  });
}

/**
 * Bascule legacy/Lexical du parachute de parité, avec repli croisé : si la
 * source attendue par `contentTouched` est vide (ne devrait pas arriver sur
 * une fiche migrée — 0 contenu vide, R2 §1.1 — mais reste possible sur une
 * fiche neuve dont l'éditeur n'a pas encore saisi de texte), on rend l'autre
 * source plutôt que de silencieusement perdre du contenu.
 */
function renderHtml(
  legacyHtml: string | null | undefined,
  lexicalData: unknown,
  contentTouched: boolean | null | undefined,
): string {
  const legacy = legacyHtml?.trim() ?? "";
  const lexical = lexicalToHtml(lexicalData);
  return contentTouched ? lexical || legacy : legacy || lexical;
}

/** Un champ relation Payload est-il peuplé (objet) plutôt que renvoyé comme simple id ? */
function isPopulated<T extends { id: number }>(
  value: number | T | null | undefined,
): value is T {
  return typeof value === "object" && value !== null;
}

/** `Author`/`Libelle` peuplés → `Term` du port (mêmes champs `name`/`slug`). */
function toTerm(value: number | Author | Libelle | null | undefined): Term | null {
  return isPopulated(value) ? { name: value.name, slug: value.slug } : null;
}

function toAuthors(value: PayloadBook["authors"]): Term[] {
  return (value ?? []).flatMap((a) => {
    const term = toTerm(a);
    return term ? [term] : [];
  });
}

function toLibelles(value: PayloadBook["libelles"]): Term[] {
  return (value ?? []).flatMap((l) => {
    const term = toTerm(l);
    return term ? [term] : [];
  });
}

/** `Media` peuplé → `Cover` (dims sharp) — `null` si absent ou incomplet. */
function toCover(value: PayloadBook["cover"]): Cover | null {
  if (!isPopulated<Media>(value) || !value.url || !value.width || !value.height) return null;
  return { url: value.url, width: value.width, height: value.height };
}

/** URL d'un média peuplé (PDF table/extrait) — `null` si absent ou non peuplé. */
function mediaUrl(value: number | Media | null | undefined): string | null {
  return isPopulated<Media>(value) ? (value.url ?? null) : null;
}

/**
 * Groupe `commerce` Payload → `CommerceInfo` du port — `null` si le groupe est
 * absent (fiche jamais touchée par la migration commerce, cf. `Books.ts`).
 * `sellable`/`stock` sont optionnels côté schéma Payload (`boolean | null`,
 * `number | null`) : `sellable` manquant vaut « non vendable » (jamais
 * vendable par défaut), `stock` manquant vaut « non suivi » — même défaut que
 * `resolveNativePurchase` applique à une fiche sans groupe `commerce` du tout.
 */
function toCommerce(value: PayloadBook["commerce"]): CommerceInfo | null {
  if (!value) return null;
  return { sellable: Boolean(value.sellable), stock: value.stock ?? null };
}

/** Document `books` Payload (Local API, `depth:2`) → forme brute neutre du port. */
export function payloadBookToRawBook(doc: PayloadBook): RawBook {
  const presentation = renderHtml(doc.presentationLegacyHtml, doc.presentation, doc.contentTouched);
  const plusLoin =
    renderHtml(doc.plusLoinLegacyHtml, doc.plusLoin, doc.contentTouched) || null;

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    // Auteurs déjà en forme d'affichage (la migration convertit `Nom/Prénom` à l'import).
    authors: toAuthors(doc.authors),
    libelles: toLibelles(doc.libelles),
    isbn: doc.isbn ?? null,
    price: doc.prix ?? null,
    pages: doc.pages ?? null,
    // Champ date Payload, toujours ISO — seule la partie jour intéresse le domaine.
    publishedAt: doc.dateParution ? doc.dateParution.slice(0, 10) : null,
    cover: toCover(doc.cover),
    buy: {
      boutique: doc.buy?.boutiqueUrl ?? null,
      parislibrairies: doc.buy?.parislibrairies ?? null,
      lalibrairie: doc.buy?.lalibrairie ?? null,
    },
    presentationHtml: presentation || null,
    furtherReadingHtml: plusLoin,
    tocUrl: mediaUrl(doc.tablePdf),
    excerptUrl: mediaUrl(doc.extraitPdf),
    commerce: toCommerce(doc.commerce),
  };
}

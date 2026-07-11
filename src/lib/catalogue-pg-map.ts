import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import type { Author, Book as PayloadBook, Collection, Media } from "../payload-types";
import type { WpBook, WpBookField, WpCoverField } from "./catalogue-source";
import type { Term } from "./types";

/**
 * `lexical` (le paquet) n'est pas une dépendance directe du site — seulement
 * une dépendance transitive de `@payloadcms/richtext-lexical` (pnpm ne la
 * hisse pas). On récupère donc le type de `data` structurellement depuis la
 * signature déjà résolue de `convertLexicalToHTML`, sans l'importer nous-mêmes.
 */
type LexicalData = Parameters<typeof convertLexicalToHTML>[0]["data"];

/**
 * Mapper **pur** Payload → forme brute du port (`WpBook`), symétrique de
 * l'adaptateur http : `catalogue-pg.ts` (E4 du plan) l'applique aux documents
 * lus par la Local API, `catalogue-core.ts` ne voit jamais la différence.
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

/** `Author`/`Collection` peuplés → `Term` du port (mêmes champs `name`/`slug`). */
function toTerm(value: number | Author | Collection | null | undefined): Term | null {
  return isPopulated(value) ? { name: value.name, slug: value.slug } : null;
}

function toAuthors(value: PayloadBook["authors"]): Term[] {
  return (value ?? []).flatMap((a) => {
    const term = toTerm(a);
    return term ? [term] : [];
  });
}

/** `Media` peuplé → `{url,width,height}` (dims sharp, contrat `cover` du port). */
function toWpCover(value: PayloadBook["cover"]): WpCoverField | null {
  if (!isPopulated<Media>(value) || !value.url || !value.width || !value.height) return null;
  return { url: value.url, width: value.width, height: value.height };
}

/** URL d'un média peuplé (PDF table/extrait) — `null` si absent ou non peuplé. */
function mediaUrl(value: number | Media | null | undefined): string | null {
  return isPopulated<Media>(value) ? (value.url ?? null) : null;
}

/** Document `books` Payload (Local API, `depth:2`) → forme brute `WpBook` du port. */
export function payloadBookToWpBook(doc: PayloadBook): WpBook {
  const presentation = renderHtml(doc.presentationLegacyHtml, doc.presentation, doc.contentTouched);
  const plusLoin =
    renderHtml(doc.plusLoinLegacyHtml, doc.plusLoin, doc.contentTouched) || null;

  const book: WpBookField = {
    isbn: doc.isbn ?? null,
    prix: doc.prix ?? null,
    pages: doc.pages ?? null,
    date_parution: doc.dateParution ?? null,
    plus_loin: plusLoin,
    table: mediaUrl(doc.tablePdf),
    extrait: mediaUrl(doc.extraitPdf),
    boutique: doc.buy?.boutiqueUrl ?? null,
    parislibrairies: doc.buy?.parislibrairies ?? null,
    lalibrairie: doc.buy?.lalibrairie ?? null,
    authors: toAuthors(doc.authors),
    collection: toTerm(doc.collection),
    cover: toWpCover(doc.cover),
  };

  return {
    id: doc.id,
    slug: doc.slug,
    title: { rendered: doc.title },
    content: { rendered: presentation },
    book,
  };
}

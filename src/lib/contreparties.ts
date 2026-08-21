import "server-only";
import * as Sentry from "@sentry/nextjs";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Author, Book as PayloadBook, Libelle, Media } from "@/payload-types";
import {
  BOOK_HOVER_EXCERPT_MAX,
  type BookHoverCardData,
  isUsefulBookHoverCardData,
} from "./book-hover-card-data";
import { renderHtml } from "./catalogue-pg-map";
import { cmsExcerpt, sanitizeCms } from "./cms-html";
import type { Cover } from "./types";
import type { ContrepartieComposition, ContrepartieItemRef } from "./contreparties-core";
import { EDITIONS, isEditionSlug } from "./editions";
import { formatPrice } from "./format";

/**
 * Lecture Payload dédiée à la résolution des contreparties de don (composition
 * structurée de `contreparties-core.ts`, résolue par SLUG de produit) — module
 * I/O, non testé unitairement (même convention que `catalogue.ts`) : toute
 * logique pure (agrégation, résolution d'une sélection) vit dans
 * `contreparties-core.ts`, jamais ici.
 *
 * `draft: true` (client 2026-08-21) : les fiches référencées par une
 * contrepartie peuvent être des BROUILLONS Payload (fiches minimales,
 * encore à compléter le temps de la campagne) — jamais absentes de la
 * résolution pour ça, à la différence du catalogue public
 * (`PUBLIC_BOOKS_READ`, `catalogue-source.ts`) qui exclut les brouillons.
 * `overrideAccess: true` : lecture serveur pure (server action de don, page de
 * sélection), aucun contexte utilisateur à restreindre — même posture que
 * `commerce-source.ts:getPromoCodeRecord`.
 */

/**
 * Fiche minimale d'un livre référencé par une contrepartie — de quoi
 * l'afficher, l'encoder en ligne de commande, ET construire sa mini fiche au
 * survol (`fiche`, `ContrepartieDisplayItem`, client 2026-08-21). Les champs
 * ajoutés pour la fiche (`price`/`authors`/`libelles`/`excerpt`) tolèrent
 * tous l'absence : produits boutique (totebag, planche de stickers, packs)
 * souvent sans auteurs ni présentation détaillée.
 */
export interface ContrepartieBook {
  id: number;
  title: string;
  /** Couverture AVEC dimensions (client 2026-08-21) : l'étape de choix rend au ratio réel, la recette des grilles (`lib/cover.tsx`) — jamais une URL nue. */
  cover?: Cover;
  /** Maison — distingue deux fiches homonymes (unicité composite `(edition, slug)`, `Books.ts`). */
  edition?: string;
  /** Snapshot de ligne de commande don (webhook) — null sur les fiches brouillon sans ISBN. */
  isbn: string | null;
  /** Prix TTC en EUROS (champ Payload `prix`) — jamais `centsToEuros`/`eurosToCents` (`money.ts`), ce prix n'entre dans aucun calcul de centimes ici. */
  price: number | null;
  /** Noms joints (« A, B ») — même recette que `book-card.tsx`. Vide → `null`. */
  authors: string | null;
  /** Noms des libellés. */
  libelles: string[];
  /** Extrait de présentation (parachute `renderHtml` → `sanitizeCms` → `cmsExcerpt`) — `null` si la fiche n'a aucune présentation. */
  excerpt: string | null;
}

/** Un champ relation Payload est-il peuplé (objet) plutôt que renvoyé comme simple id ? Même garde que `catalogue-pg-map.ts`. */
function isPopulated<T extends { id: number }>(value: number | T | null | undefined): value is T {
  return typeof value === "object" && value !== null;
}

/** Noms d'auteurs joints (« A, B ») depuis une relation `authors` peuplée — `null` si aucun auteur peuplé. */
function toAuthorNames(value: PayloadBook["authors"]): string | null {
  const names = (value ?? []).flatMap((a) => (isPopulated<Author>(a) ? [a.name] : []));
  return names.length > 0 ? names.join(", ") : null;
}

/** Noms de libellés depuis une relation `libelles` peuplée. */
function toLibelleNames(value: PayloadBook["libelles"]): string[] {
  return (value ?? []).flatMap((l) => (isPopulated<Libelle>(l) ? [l.name] : []));
}

/**
 * Extrait de présentation d'un doc `books` brut — MÊME parachute legacy/
 * Lexical que le pipeline catalogue (`renderHtml`, `catalogue-pg-map.ts`,
 * exporté pour cette réutilisation), jamais réécrit à côté : `contreparties.ts`
 * lit directement Payload (hors `RawBook`), donc n'a jamais de `presentation`
 * déjà résolue/sanitisée à disposition comme `BookDetail` l'offre à
 * `toBookHoverCardData` (`book-hover-card-data.ts`).
 */
function toExcerpt(doc: PayloadBook): string | null {
  const html = renderHtml(doc.presentationLegacyHtml, doc.presentation, doc.contentTouched);
  if (!html) return null;
  return cmsExcerpt(sanitizeCms(html), BOOK_HOVER_EXCERPT_MAX) || null;
}

/** Doc `books` Payload (depth:1) → `ContrepartieBook` — fabricant UNIQUE, partagé par la lecture par slugs ET par ids. */
function toContrepartieBook(doc: PayloadBook): ContrepartieBook {
  return {
    id: doc.id,
    title: doc.title,
    cover:
      isPopulated<Media>(doc.cover) && doc.cover.url
        ? { url: doc.cover.url, width: doc.cover.width ?? 0, height: doc.cover.height ?? 0 }
        : undefined,
    edition: doc.edition ?? undefined,
    isbn: doc.isbn ?? null,
    price: doc.prix ?? null,
    authors: toAuthorNames(doc.authors),
    libelles: toLibelleNames(doc.libelles),
    excerpt: toExcerpt(doc),
  };
}

/**
 * `ContrepartieBook` → mini fiche au survol (`BookHoverCardData`) — `null` si
 * la fiche n'a rien d'utile à montrer au-delà du titre nu (ni prix, ni
 * extrait, ni auteurs) : l'appelant rend alors le titre nu comme aujourd'hui,
 * jamais une carte vide.
 */
function toFiche(book: ContrepartieBook): BookHoverCardData | null {
  const data: BookHoverCardData = {
    title: book.title,
    authors: book.authors,
    editionLabel: book.edition && isEditionSlug(book.edition) ? EDITIONS[book.edition].name : null,
    libelles: book.libelles,
    priceLabel: formatPrice(book.price),
    excerpt: book.excerpt,
    coverUrl: book.cover?.url ?? null,
  };
  return isUsefulBookHoverCardData(data) ? data : null;
}

/**
 * Relit les fiches `books` référencées par un ensemble de slugs — un slug
 * absent de la carte retournée est simplement absent (l'appelant décide du
 * refus, cf. `souscription/actions.ts`, jamais un jet ici). Deux fiches
 * distinctes peuvent partager un même slug (unicité composite
 * `(edition, slug)`) : la PREMIÈRE rencontrée est conservée, l'ambiguïté est
 * signalée à Sentry plutôt que silencieusement absorbée — ne devrait jamais
 * se produire une fois l'audit des slugs de `CONTREPARTIES_2026` terminé
 * (TODO-AUDIT, `contreparties-core.ts`).
 */
export async function getContrepartieBooksBySlugs(
  slugs: string[],
): Promise<Map<string, ContrepartieBook>> {
  if (slugs.length === 0) return new Map();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { slug: { in: slugs } },
    draft: true,
    overrideAccess: true,
    // Profondeur 1 : peuple `cover` (relation directe vers `media`) ET
    // `authors`/`libelles` (relations directes elles aussi) — la mini fiche
    // au survol (`fiche`, `ContrepartieDisplayItem`) en a besoin.
    depth: 1,
    limit: 0,
  });
  const bySlug = new Map<string, ContrepartieBook>();
  for (const doc of docs) {
    if (bySlug.has(doc.slug)) {
      Sentry.captureMessage(
        `Contrepartie : slug « ${doc.slug} » ambigu (plusieurs fiches books, unicité (edition, slug)) — première fiche conservée`,
        {
          level: "warning",
          extra: { slug: doc.slug, keptId: bySlug.get(doc.slug)?.id, ignoredId: doc.id },
        },
      );
      continue;
    }
    bySlug.set(doc.slug, toContrepartieBook(doc));
  }
  return bySlug;
}

/**
 * Relit les fiches `books` référencées par un ensemble d'IDS — pendant de
 * `getContrepartieBooksBySlugs` par identifiant plutôt que par slug, utilisé
 * là où la donnée déjà en main est un id Postgres (décodage de
 * `metadata.donLines`, `souscription/merci/page.tsx`). Mêmes garanties :
 * brouillons inclus (`draft: true`), un id absent est simplement absent de la
 * carte — l'appelant dégrade, ne jette jamais.
 */
export async function getContrepartieBooksByIds(ids: number[]): Promise<Map<number, ContrepartieBook>> {
  if (ids.length === 0) return new Map();
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { id: { in: ids } },
    draft: true,
    overrideAccess: true,
    depth: 1,
    limit: ids.length,
  });
  const byId = new Map<number, ContrepartieBook>();
  for (const doc of docs) {
    byId.set(doc.id, toContrepartieBook(doc));
  }
  return byId;
}

/**
 * Slugs référencés par UNE composition — contrairement à
 * `allContrepartieSlugs` (`contreparties-core.ts`), qui couvre les 9 paliers :
 * ne relit que ce qu'il faut pour l'étape de choix d'UN palier donné.
 */
function compositionSlugs(composition: ContrepartieComposition): string[] {
  const slugs = new Set<string>();
  for (const section of composition.sections) {
    if (section.kind === "inclus") {
      for (const item of section.items) slugs.add(item.slug);
    } else {
      for (const option of section.options) {
        for (const item of option.items) slugs.add(item.slug);
      }
    }
  }
  return [...slugs];
}

/** Un item de contrepartie résolu pour l'affichage (titre/couverture réels). */
export interface ContrepartieDisplayItem {
  slug: string;
  qty: number;
  title: string;
  /** Cf. `ContrepartieBook.cover` — dimensions incluses, rendu au ratio réel. */
  cover?: Cover;
  /** Mini fiche au survol (`BookHoverCard`) — `null` si le slug est introuvable OU si la fiche n'a rien d'utile à montrer (`toFiche`) : l'appelant rend alors le titre nu. */
  fiche: BookHoverCardData | null;
}

/** Composition d'un palier, sections dans le MÊME ordre que `contreparties-core.ts`, prêtes à afficher. */
export type ContrepartieDisplaySection =
  | { kind: "inclus"; label: string; items: ContrepartieDisplayItem[] }
  | {
      kind: "choix";
      id: string;
      label: string;
      options: { id: string; label: string; items: ContrepartieDisplayItem[] }[];
    };

/**
 * Composition d'un palier → sections prêtes à afficher (titres/couvertures
 * réels), en UNE seule lecture Payload pour toute la composition. Un slug
 * introuvable (fiche pas encore créée en base) retombe sur le slug lui-même
 * comme libellé — rendu de repli propre plutôt qu'une section qui disparaît ;
 * l'audit des slugs (TODO-AUDIT, `contreparties-core.ts`) reste le filet en
 * amont, ce module ne fait jamais échouer l'affichage pour ça.
 */
export async function getContrepartieDisplay(
  composition: ContrepartieComposition,
): Promise<ContrepartieDisplaySection[]> {
  const books = await getContrepartieBooksBySlugs(compositionSlugs(composition));
  const toDisplayItem = (item: ContrepartieItemRef): ContrepartieDisplayItem => {
    const book = books.get(item.slug);
    return {
      slug: item.slug,
      qty: item.qty,
      title: book?.title ?? item.slug,
      cover: book?.cover,
      fiche: book ? toFiche(book) : null,
    };
  };
  return composition.sections.map((section) =>
    section.kind === "inclus"
      ? { kind: "inclus", label: section.label, items: section.items.map(toDisplayItem) }
      : {
          kind: "choix",
          id: section.id,
          label: section.label,
          options: section.options.map((option) => ({
            id: option.id,
            label: option.label,
            items: option.items.map(toDisplayItem),
          })),
        },
  );
}

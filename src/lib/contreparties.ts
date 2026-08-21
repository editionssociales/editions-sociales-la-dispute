import "server-only";
import * as Sentry from "@sentry/nextjs";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Media } from "@/payload-types";
import type { ContrepartieComposition, ContrepartieItemRef } from "./contreparties-core";

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

/** Fiche minimale d'un livre référencé par une contrepartie — juste de quoi l'afficher et l'encoder en ligne de commande. */
export interface ContrepartieBook {
  id: number;
  title: string;
  coverUrl?: string;
  /** Maison — distingue deux fiches homonymes (unicité composite `(edition, slug)`, `Books.ts`). */
  edition?: string;
  /** Snapshot de ligne de commande don (webhook) — null sur les fiches brouillon sans ISBN. */
  isbn: string | null;
}

/** Un champ relation Payload est-il peuplé (objet) plutôt que renvoyé comme simple id ? Même garde que `catalogue-pg-map.ts`. */
function isPopulated<T extends { id: number }>(value: number | T | null | undefined): value is T {
  return typeof value === "object" && value !== null;
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
    // Profondeur 1 : suffit à peupler `cover` (relation directe vers `media`) —
    // ni auteurs ni libellés ne sont lus ici.
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
    bySlug.set(doc.slug, {
      id: doc.id,
      title: doc.title,
      coverUrl: isPopulated<Media>(doc.cover) ? (doc.cover.url ?? undefined) : undefined,
      edition: doc.edition ?? undefined,
      isbn: doc.isbn ?? null,
    });
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
    byId.set(doc.id, {
      id: doc.id,
      title: doc.title,
      coverUrl: isPopulated<Media>(doc.cover) ? (doc.cover.url ?? undefined) : undefined,
      edition: doc.edition ?? undefined,
      isbn: doc.isbn ?? null,
    });
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
  coverUrl?: string;
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
    return { slug: item.slug, qty: item.qty, title: book?.title ?? item.slug, coverUrl: book?.coverUrl };
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

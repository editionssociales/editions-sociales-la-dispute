"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Cover } from "@/lib/cover";
import type { NouveauteBook } from "@/lib/nouveaute-book";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import { ScrollRail, type ScrollRailItem } from "./scroll-rail";
import {
  NOUVEAUTES_RAIL_ID,
  nouveautesBootstrapScript,
  nouveautesCoverSizes,
  nouveautesInitialIndex,
} from "./nouveautes-carousel-lcp";

export type { NouveauteBook };

/**
 * Carrousel des dernières parutions — ADAPTATEUR MINCE par-dessus la
 * primitive générique `ScrollRail` (extraction lot D3, `scroll-rail.tsx`) :
 * DOM, classes et comportement STRICTEMENT identiques à l'ancien composant
 * monolithique — verrouillé par `nouveautes-carousel-lcp.test.ts`, qui grep
 * le SOURCE de ce fichier. Ne reste ici que ce qui est spécifique au livre :
 * couvertures (`Cover`), lien de fiche, bootstrap LCP et `id` DOM singleton
 * (`NOUVEAUTES_RAIL_ID`) — le rail lui-même (défilement natif, glissé
 * souris, flèches, effet de profondeur) vit dans `scroll-rail.tsx`, partagé
 * avec `souscription/_components/soutiens-rail.tsx`.
 *
 * PROFONDEUR (épure minimaliste — la perspective 3D/rotation a été retirée) :
 * activée ici (`depthEffect`) — la carte centrale zoomée et opaque, les
 * latérales reculent et s'estompent, sans aucune rotation ni perspective.
 *
 * COUVERTURES SEULES (retour client 2026-07-23) : plus aucune légende
 * titre/auteur/date sous le rail — le titre et l'auteur restent portés par
 * l'`aria-label` de chaque lien. Flèches et sortie « Tout le catalogue »
 * sont désactivables par prop (la vitrine et la vue « à paraître » les
 * masquent toutes deux).
 */
export function NouveautesCarousel({
  books,
  showArrows = true,
  showCatalogueLink = true,
}: {
  books: NouveauteBook[];
  showArrows?: boolean;
  showCatalogueLink?: boolean;
}) {
  const n = books.length;
  // C'est CETTE couverture qui est le LCP, pas l'index 0 (issue #109) —
  // cf. `nouveautes-carousel-lcp.ts`.
  const initialIndex = nouveautesInitialIndex(n);
  const bootstrapScript = nouveautesBootstrapScript(initialIndex);

  // Items mémoïsés : la primitive s'appuie sur cette référence pour ne
  // jamais reconcilier les cartes pendant un défilement (cf. `scroll-rail.tsx`).
  const items: ScrollRailItem[] = useMemo(
    () =>
      books.map((book, i) => ({
        key: book.href,
        label: book.title,
        node: (
          <Link
            href={book.href}
            draggable={false}
            aria-label={`${book.title}${book.author ? `, ${book.author}` : ""}`}
            className={`block origin-center will-change-transform ${FOCUS_RING_LIGHT} ${
              i === initialIndex ? "[transform:scale(1.12)]" : ""
            }`}
          >
            {/* Hauteur commune fixée ; la largeur suit le ratio réel de
                l'image (aucune bande, jamais coupée). Couverture initialement
                centrée : preload + fetchPriority high (LCP). Les autres
                restent lazy, `sizes` resserré.
                `[transform:scale(1.12)]` : même zoom que l'effet de
                profondeur du rail dès le HTML (LCP déjà à la taille finale)
                ET même propriété que son inline style, qui l'écrase donc à
                l'hydratation — jamais l'utilitaire `scale-[…]` : Tailwind v4
                émet la propriété AUTONOME `scale`, qui compose avec le
                `style.transform` du rail au lieu d'être remplacée (double
                zoom 1,12² sur la carte centrée, constaté en prod le
                2026-08-29). */}
            <div className="relative h-[var(--cover-h)] w-fit bg-paper-2 shadow-[8px_8px_0_0_var(--color-ink)] ring-1 ring-ink">
              <Cover
                cover={{ url: book.coverUrl, width: book.coverW, height: book.coverH }}
                alt={book.title}
                fit="height"
                sizes={nouveautesCoverSizes(i, initialIndex)}
                preload={i === initialIndex}
                draggable={false}
                className="block h-full w-auto select-none"
              />
            </div>
          </Link>
        ),
      })),
    [books, initialIndex],
  );

  if (n === 0) return null;

  return (
    <ScrollRail
      items={items}
      railId={NOUVEAUTES_RAIL_ID}
      ariaLabel="Nouveautés"
      initialIndex={initialIndex}
      depthEffect
      showArrows={showArrows}
      prevAriaLabel="Couverture précédente"
      nextAriaLabel="Couverture suivante"
      // Épure minimaliste : plus de titre de section ni de rangée dédiée —
      // flèches et sortie catalogue (quand demandées) sont SUPERPOSÉES au
      // cadre du carrousel, coin supérieur droit (posé par la primitive).
      cornerExtra={
        showCatalogueLink ? (
          // Sortie discrète du carrousel, à proximité des flèches — même
          // patron que les liens secondaires existants (`min-h-11`, anneau
          // de focus, soulignement sobre ; ex. « Retirer » du panier).
          <Link
            href="/catalogue"
            className={`inline-flex min-h-11 items-center gap-1 px-2 -mx-2 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink-soft underline decoration-1 underline-offset-2 hover:text-ink ${FOCUS_RING_LIGHT}`}
          >
            Tout le catalogue <span aria-hidden="true">→</span>
          </Link>
        ) : undefined
      }
      trackClassName="flex cursor-grab select-none items-center gap-[clamp(14px,1.6vw,26px)] overflow-x-auto px-[calc(50%_-_clamp(96px,11vw,132px))] pb-[clamp(20px,3vw,40px)] pt-[clamp(24px,4vw,52px)] [--cover-h:clamp(200px,32vw,392px)] [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      itemClassName="flex-none [scroll-snap-align:center]"
      afterTrack={<script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />}
    />
  );
}

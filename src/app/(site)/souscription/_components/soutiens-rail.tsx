import Link from "next/link";
import { Container } from "@/components/container";
import { NewTabMark } from "@/components/new-tab-mark";
import { Reveal } from "@/components/reveal";
import { ScrollRail, type ScrollRailItem } from "@/components/scroll-rail";
import { Cover } from "@/lib/cover";
import type { SoutienVisuel } from "@/lib/site-content-core";

/**
 * Section « Ils et elles nous soutiennent » (lot D3, 2026-08-30) — rail de
 * visuels (photos, logos, messages…) monté sur la primitive générique
 * `ScrollRail` (`@/components/scroll-rail`, partagée avec
 * `nouveautes-carousel.tsx`). Rail PLAT, sans effet de profondeur : les
 * visuels de soutien n'ont ni le même ratio ni la même fonction que des
 * couvertures de livres (logo carré à côté d'une photo portrait) — zoomer la
 * carte centrale n'aurait fait qu'accentuer cette hétérogénéité, sans
 * bénéfice équivalent à la vitrine des nouveautés.
 *
 * Contrat de vide hérité de `mergeSoutiens` (`site-content-core.ts`) :
 * `soutiens` vide ⇒ AUCUN rendu, jamais un titre de section sans rien
 * dessous (contrat « Highlight »).
 *
 * Composant serveur : la seule pièce client de l'arbre est `ScrollRail`
 * lui-même (importé, pas défini ici) — même pattern que `TiersRail`
 * composant `SubmitButton`.
 */
export function SoutiensRail({ soutiens }: { soutiens: SoutienVisuel[] }) {
  if (soutiens.length === 0) return null;

  const items: ScrollRailItem[] = soutiens.map((soutien, i) => {
    const visuel = (
      <div className="flex h-[140px] w-[220px] items-center justify-center border-2 border-ink bg-paper p-4 sm:h-[170px] sm:w-[260px]">
        <Cover
          cover={soutien.image}
          alt={soutien.image.alt}
          fit="height"
          sizes="(min-width: 640px) 260px, 220px"
          draggable={false}
          className="block h-full w-auto select-none"
        />
      </div>
    );
    // `NewTabMark` en DERNIER enfant du lien (convention `site-footer.tsx`) —
    // rendu qu'un lien existe ou non de légende visible (un soutien sans
    // légende reste signalé pour les technologies d'assistance).
    const legende = soutien.legende && (
      <p className="mt-2 max-w-[220px] text-center font-sans text-xs font-semibold text-ink-soft sm:max-w-[260px]">
        {soutien.legende}
      </p>
    );
    return {
      key: `${soutien.image.url}-${i}`,
      label: soutien.legende ?? undefined,
      node: soutien.lien ? (
        <Link href={soutien.lien} target="_blank" rel="noreferrer" className="block">
          {visuel}
          {legende}
          <NewTabMark />
        </Link>
      ) : (
        <div>
          {visuel}
          {legende}
        </div>
      ),
    };
  });

  return (
    <div className="mt-12 sm:mt-16">
      <Reveal>
        <Container>
          <h2 className="mb-4 font-sans text-sm font-extrabold uppercase tracking-[.08em] text-ink">
            Ils et elles nous soutiennent
          </h2>
        </Container>
      </Reveal>
      <ScrollRail
        items={items}
        ariaLabel="Ils et elles nous soutiennent"
        showArrows
        // `pt-16` : réserve la bande occupée par les flèches (superposées en
        // haut à droite du rail, `scroll-rail.tsx`) — sans elle, elles
        // recouvriraient le haut des cartes les plus proches du bord droit.
        trackClassName="flex cursor-grab select-none items-start gap-6 overflow-x-auto px-5 pb-4 pt-16 sm:gap-8 sm:px-8 [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        itemClassName="flex flex-none flex-col items-center [scroll-snap-align:center]"
      />
    </div>
  );
}

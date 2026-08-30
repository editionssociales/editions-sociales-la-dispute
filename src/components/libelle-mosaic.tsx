import { Fragment } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { LinkPendingHint } from "./link-pending-hint";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition]. « INDEX-MANIFESTE » depuis l'arbitrage
 * client du 2026-08-30, qui remplace les « cases variables » du 25/07 : plus
 * d'étages pyramidaux à corps calculé (l'arithmétique `libelle-mosaic-core.ts`
 * et l'accordéon mobile `mosaic-disclosure.tsx` sont supprimés avec — ils
 * vivent dans l'historique git). Tous les libellés au MÊME corps et à la même
 * graisse, coulés en un seul paragraphe justifié de liens sous la bannière
 * « Tous les livres » : la hiérarchie ne passe plus par la taille (perçue
 * comme arbitraire), seulement par l'ordre de lecture. Le paragraphe reflow
 * naturellement en mobile — plus aucun repli, donc plus d'îlot client : la
 * vue est redevenue 100 % serveur.
 *
 * Deux exigences client NON NÉGOCIABLES (retour prototype 2026-08-30) :
 * AUCUN compte de livres affiché — le `count` de l'item ne sert plus qu'à
 * l'ordre de LECTURE — et les états hover/actif/focus ne changent QUE la
 * peinture (`invertingCell`, anneaux R5) : jamais une métrique (corps,
 * graisse, padding, contenu conditionnel). Le paragraphe ne bouge pas d'un
 * pixel au survol.
 */

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/**
 * Peinture d'un lien selon son état — l'anneau de focus suit le fond qu'il
 * borde (R5) : clair au repos (avec la surcharge de survol embarquée par
 * `invertingCell`), sombre quand la cellule est inversée. Rien ici ne touche
 * à la géométrie : c'est le verrou de l'exigence « le paragraphe ne bouge
 * pas » (cf. `libelle-mosaic.test.tsx`).
 */
const statePaint = (active: boolean) =>
  `${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`;

export function LibelleMosaic({
  items,
  activeLibelle,
  hrefFor,
  ariaLabel,
  className = "",
}: {
  items: LibelleMosaicItem[];
  /** Slug du libellé actif (`undefined` = « Tous les livres »). */
  activeLibelle?: string;
  /** Construit l'URL d'une cellule (`null` = retour à « Tous les livres »). */
  hrefFor: (slug: string | null) => string;
  ariaLabel: string;
  className?: string;
}) {
  const isActive = (item: LibelleMosaicItem) =>
    (item.slug ?? undefined) === activeLibelle;

  // Ordre de LECTURE : taille de catalogue décroissante, égalités à
  // l'alphabétique. La COPIE est le contrat (`src/lib/CLAUDE.md`) :
  // `getFacets` détient l'ordre alphabétique, cette vue ne trie jamais le
  // tableau de l'appelant en place.
  const byCount = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"),
  );

  // Bannière = la cellule « Tous les livres » (`slug: null`, épinglée par les
  // deux appelants). Repli assumé : un jeu d'items qui ne la porte pas coule
  // simplement TOUT dans le paragraphe — jamais de libellé ordinaire promu
  // bannière, jamais d'erreur.
  const banner = byCount.find((item) => item.slug === null) ?? null;
  const words = banner
    ? byCount.filter((item) => item.slug !== null)
    : byCount;

  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      className={`grid-cols-1 ${className}`}
    >
      {banner && (
        <Link
          href={hrefFor(null)}
          aria-current={isActive(banner) ? "page" : undefined}
          // `relative` : ancre du témoin de navigation (`LinkPendingHint`).
          className={`relative block px-3 py-2 text-center font-sans text-[24px] font-black uppercase leading-[1.05] tracking-[.01em] transition-colors motion-reduce:transition-none sm:py-3 sm:text-[34px] lg:text-[42px] ${statePaint(isActive(banner))}`}
        >
          {banner.name}
          <LinkPendingHint />
        </Link>
      )}
      {/* Le paragraphe-manifeste. Justifié à `sm`+ SEULEMENT (vérif visuelle
          2026-08-30 : à ~343px de colonne, peu de mots par ligne — les
          espaces s'étirent en trous ; en drapeau gauche le gris typographique
          reste régulier, au prix d'un bord droit irrégulier). Les espaces
          réels (cf. les `{" "}` ci-dessous — sans eux le justifié n'a aucun
          point d'élasticité) absorbent la ligne.
          `[overflow-wrap:break-word]` remplace l'ex-garde-fou `truncateWords`
          pour un mot dégénéré importé sans espace. Cibles tactiles :
          l'interligne large espace les lignes, et le padding CONSTANT des
          liens (`px-1 py-1`) étend leur zone cliquable — le padding vertical
          d'un inline peint et capte le clic HORS de la boîte de ligne sans
          la pousser, donc sans toucher à l'invariance de géométrie exigée en
          tête de fichier. */}
      {words.length > 0 && (
      <p className="bg-paper px-4 py-4 font-sans text-[15px] font-black uppercase leading-[2.1] tracking-[.02em] text-ink [overflow-wrap:break-word] sm:px-6 sm:py-5 sm:text-justify sm:text-[16px] lg:text-[17px]">
        {words.map((item, i) => (
          <Fragment key={item.slug ?? "tous"}>
            {i > 0 && (
              // Séparateur : carré plein, la ponctuation du site (même
              // vocabulaire que le mortier de `FramedGrid`). Un <span> ISOLÉ
              // entre deux liens, pas un ::after porté par le lien : le lien
              // porte `box-decoration-clone` pour son PROPRE fond
              // d'inversion, un pseudo-élément y serait cloné à CHAQUE
              // fragment de ligne (un carré par ligne, pas par libellé).
              // Décoratif pur — `aria-hidden`, hors du nom accessible.
              <>
                {" "}
                <span
                  aria-hidden="true"
                  className="mx-1 inline-block h-[0.35em] w-[0.35em] bg-ink align-middle"
                />{" "}
              </>
            )}
            {/* Lien INLINE (jamais inline-block) : le libellé peut se couper
                en fin de ligne, c'est le parti pris « texte-matériau » ;
                `box-decoration-clone` fait suivre l'inversion sur chaque
                fragment. `relative` : ancre du témoin `LinkPendingHint` —
                ces liens ne passent par AUCUNE transition de
                `CatalogueFilters` (le clic irait sans lui vers la vue
                dynamique sans le moindre retour, même raison que la
                pagination). Sur un lien coupé, l'ancre absolue se cale sur
                la boîte englobante des fragments : témoin de 6px,
                imprécision cosmétique assumée. */}
            <Link
              href={hrefFor(item.slug)}
              aria-current={isActive(item) ? "page" : undefined}
              className={`relative box-decoration-clone px-1 py-1 transition-colors motion-reduce:transition-none ${statePaint(isActive(item))}`}
            >
              {item.name}
              <LinkPendingHint />
            </Link>
          </Fragment>
        ))}
      </p>
      )}
    </FramedGrid>
  );
}

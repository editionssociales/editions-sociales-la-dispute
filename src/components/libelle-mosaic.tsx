import { Fragment } from "react";
import Link from "next/link";
import { LinkPendingHint } from "./link-pending-hint";
import { FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition] via le slot `libellesSlot` de
 * `catalogue-filters.tsx`. « INDEX-MANIFESTE » (arbitrage client 2026-08-30,
 * remplace les « cases variables » du 25/07), resserré le jour même en 2e
 * passe : plus de cadre ni de bannière « Tous les livres » — le paragraphe
 * vit NU, juste sous la barre recherche/Auteur/Tri, et « Tous les livres »
 * devient son premier mot (premier au tri par count, il porte le retour au
 * catalogue complet et l'état actif quand aucun libellé n'est filtré).
 * Tous les libellés au même corps et à la même graisse : la hiérarchie ne
 * passe plus par la taille, seulement par l'ordre de lecture. Le paragraphe
 * reflow naturellement en mobile — aucun repli, composant 100 % serveur.
 *
 * Deux exigences client NON NÉGOCIABLES (retour prototype 2026-08-30) :
 * AUCUN compte de livres affiché — le `count` de l'item ne sert plus qu'à
 * l'ordre de LECTURE — et les états hover/actif/focus ne changent QUE la
 * peinture : jamais une métrique (corps, graisse, padding, contenu
 * conditionnel). Le paragraphe ne bouge pas d'un pixel au survol.
 */

export interface LibelleMosaicItem {
  name: string;
  /** `null` = « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/**
 * BANDE D'INVERSION resserrée sur les CAPITALES (retour client 2026-08-30,
 * 2e passe : « même marge en haut et en bas que sur les côtés, sans compter
 * accents ni virgules ») — le fond d'un inline couvre toute la zone de
 * contenu de la fonte (ascendantes + jambages), bien plus haut que les
 * capitales : la boîte débordait et, opaque, masquait la bande de la ligne
 * du dessus (peinte avant). D'où un `background-image` à hauteur PILOTÉE,
 * indépendante du padding : `calc(1cap + 8px)` = capitales + 4px de part et
 * d'autre (le pendant vertical du `px-1`), posé à `.583em` du haut de la
 * boîte de padding = (ascent − cap) d'EFFRA, la fonte réelle du site
 * (ascent 1.25em, cap 0.667em — mesurés au canvas sur le rendu dev le
 * 2026-08-30 ; Inter n'est que le repli et aurait donné .24em) : la marge
 * vaut ainsi 4px à TOUS les corps (l'em épouse la métrique, le 8px reste
 * constant). ATTENTION : ce `.583em` suppose le `py-1` (4px) du lien — les
 * deux se compensent dans le calcul ; changer l'un impose de recalculer
 * l'autre (marge = py + (ascent − cap)·corps − offset).
 * Le `py-1` ne sert plus qu'à la zone tactile (le padding d'un inline capte
 * le clic hors de la boîte de ligne sans la pousser). Au repos le lien est
 * TRANSPARENT (jamais `bg-paper` : il effaçait la bande inversée de la
 * ligne supérieure), donc plus d'`invertingCell` ici. Les accents (É) et
 * virgules débordent de la bande : assumé, la marge se mesure aux capitales.
 */
const BAND =
  "bg-no-repeat [background-size:100%_calc(1cap+8px)] [background-position:0_.583em]";

/**
 * Peinture d'un lien selon son état — rien ici ne touche à la géométrie :
 * c'est le verrou de l'exigence « le paragraphe ne bouge pas » (cf.
 * `libelle-mosaic.test.tsx`). L'anneau de focus reste `FOCUS_RING_LIGHT`
 * dans les DEUX états : ses bords se posent sur le papier de la page (la
 * bande est en retrait dans la boîte de padding), l'ink y contraste partout.
 */
const statePaint = (active: boolean) =>
  active
    ? "text-paper [background-image:linear-gradient(var(--color-ink),var(--color-ink))]"
    : "text-ink hover:text-paper hover:[background-image:linear-gradient(var(--color-ink),var(--color-ink))]";

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
  /** Construit l'URL d'un libellé (`null` = retour à « Tous les livres »). */
  hrefFor: (slug: string | null) => string;
  ariaLabel: string;
  className?: string;
}) {
  const isActive = (item: LibelleMosaicItem) =>
    (item.slug ?? undefined) === activeLibelle;

  // Ordre de LECTURE : taille de catalogue décroissante, égalités à
  // l'alphabétique — « Tous les livres » (count = total) arrive donc
  // naturellement en tête. La COPIE est le contrat (`src/lib/CLAUDE.md`) :
  // `getFacets` détient l'ordre alphabétique, cette vue ne trie jamais le
  // tableau de l'appelant en place.
  const byCount = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"),
  );

  if (byCount.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className={className}>
      {/* Le paragraphe-manifeste. Justifié à `sm`+ SEULEMENT (vérif visuelle
          2026-08-30 : à ~343px de colonne, peu de mots par ligne — les
          espaces s'étirent en trous ; en drapeau gauche le gris typographique
          reste régulier). Les espaces réels (cf. les `{" "}` ci-dessous —
          sans eux le justifié n'a aucun point d'élasticité) absorbent la
          ligne. `[overflow-wrap:break-word]` : garde-fou d'un mot dégénéré
          importé sans espace. L'interligne large espace les lignes et fait,
          avec le `py-1` des liens, les cibles tactiles. */}
      <p className="font-sans text-[15px] font-black uppercase leading-[2.1] tracking-[.02em] text-ink [overflow-wrap:break-word] sm:text-justify sm:text-[16px] lg:text-[17px]">
        {byCount.map((item, i) => (
          <Fragment key={item.slug ?? "tous"}>
            {i > 0 && (
              // Séparateur : carré plein, la ponctuation du site. Un <span>
              // ISOLÉ entre deux liens, pas un ::after porté par le lien :
              // le lien porte `box-decoration-clone` pour sa PROPRE bande,
              // un pseudo-élément y serait cloné à CHAQUE fragment de ligne
              // (un carré par ligne, pas par libellé). Décoratif pur —
              // `aria-hidden`, hors du nom accessible.
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
                `box-decoration-clone` fait suivre la bande sur chaque
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
              className={`relative box-decoration-clone px-1 py-1 transition-colors motion-reduce:transition-none ${BAND} ${statePaint(isActive(item))} ${FOCUS_RING_LIGHT}`}
            >
              {item.name}
              <LinkPendingHint />
            </Link>
          </Fragment>
        ))}
      </p>
    </nav>
  );
}

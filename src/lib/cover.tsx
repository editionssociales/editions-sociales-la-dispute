/**
 * Affichage des couvertures — source unique de vérité pour dimensionner une
 * couverture sans jamais la recadrer ni lui ajouter de bande, quel que soit
 * son format.
 *
 * Les couvertures n'ont pas toutes le même ratio largeur/hauteur. Poser une
 * couverture dans une boîte à ratio FIXE (ex. 2/3) puis `object-cover` recadre
 * le haut et le bas de toutes celles qui ont un autre format ; `object-contain`
 * leur ajoute des bandes. Les deux sont laids.
 *
 * Règle unique : on ne fixe qu'UNE dimension (la hauteur OU la largeur, selon
 * le contexte) et on laisse l'AUTRE se calculer sur le ratio RÉEL de l'image.
 * L'image se dimensionne alors elle-même (`width`/`height: auto`) : le
 * navigateur utilise la proportion naturelle du fichier chargé — aucun
 * recadrage, aucune bande, même si les dimensions en base sont absentes ou
 * fausses. Les dimensions de la base ne servent plus qu'à réserver l'espace
 * avant chargement (éviter le saut de mise en page).
 *
 * À réutiliser PARTOUT où l'on affiche une couverture (carrousel, fiche,
 * vignettes du catalogue, étagère 3D…).
 */
import Image from "next/image";
import type { Cover } from "./types";

type CoverLike = Pick<Cover, "width" | "height"> | null | undefined;

/**
 * Résolution nominale de réservation quand les dimensions réelles manquent.
 * Ne sert qu'à réserver l'espace (ratio provisoire) avant chargement : une fois
 * l'image chargée, sa proportion naturelle prime (`width`/`height: auto`).
 */
const FALLBACK_W = 400;
const FALLBACK_H = 600;

/**
 * Chaîne `aspect-ratio` CSS au ratio RÉEL de la couverture (dimensions de la
 * base de données). À utiliser quand la géométrie CSS doit épouser exactement
 * la proportion de la couverture — typiquement la face 3D de l'étagère, dont
 * la largeur se déduit alors de sa hauteur à chaque instant : l'objet adopte
 * le format EXACT de la couverture, sans jamais la recadrer.
 */
export function coverAspectRatio(cover: CoverLike): string {
  if (!cover || cover.width <= 0 || cover.height <= 0) return "2 / 3";
  return `${cover.width} / ${cover.height}`;
}

/**
 * Dimensions à passer à `next/image` pour réserver l'espace. Jamais de valeur
 * dégénérée (2px…) qui ferait demander une image minuscule à l'optimiseur :
 * on retombe sur une résolution nominale quand la base ne fournit rien.
 */
function reservation(cover: CoverLike): { w: number; h: number } {
  if (cover && cover.width >= 20 && cover.height >= 20) {
    return { w: Math.round(cover.width), h: Math.round(cover.height) };
  }
  return { w: FALLBACK_W, h: FALLBACK_H };
}

/**
 * `"height"` : le parent fixe la HAUTEUR, la largeur suit le ratio réel
 * (rails horizontaux — carrousel). `"width"` : le parent fixe la LARGEUR, la
 * hauteur suit le ratio réel (grilles, fiche — colonne de largeur donnée).
 */
type CoverFit = "height" | "width";

/**
 * Rend une couverture au ratio réel de son image. Le parent DOIT fixer la
 * dimension correspondant à `fit` (hauteur pour `"height"`, largeur pour
 * `"width"`) ; l'autre est calculée par le navigateur. Aucun `object-fit` :
 * l'image n'est jamais recadrée ni encadrée de bandes.
 */
export function Cover({
  cover,
  alt,
  fit,
  sizes,
  className,
  preload,
  draggable,
}: {
  cover: Pick<Cover, "url" | "width" | "height">;
  alt: string;
  fit: CoverFit;
  sizes: string;
  className?: string;
  preload?: boolean;
  /** À passer `false` là où le drag HTML5 natif gênerait (rail glissable). */
  draggable?: boolean;
}) {
  const { w, h } = reservation(cover);
  const style =
    fit === "height"
      ? ({ height: "100%", width: "auto" } as const)
      : ({ width: "100%", height: "auto" } as const);
  return (
    <Image
      src={cover.url}
      alt={alt}
      width={w}
      height={h}
      sizes={sizes}
      style={style}
      className={className}
      preload={preload}
      draggable={draggable}
    />
  );
}

/**
 * Couverture avec repli : si l'ouvrage n'a pas d'image, affiche le titre en
 * placeholder plutôt que de laisser un vide. Rassemble la décision « couverture
 * encadrée OU titre de repli » dupliquée jusqu'ici entre la vignette du
 * catalogue et la fiche livre. `fallbackClassName` fixe le padding du repli
 * (`p-4` en vignette, `p-6` en fiche) ; par défaut `p-4`.
 */
export function BookCover({
  cover,
  title,
  alt,
  fit,
  sizes,
  className,
  preload,
  fallbackClassName,
}: {
  cover: Pick<Cover, "url" | "width" | "height"> | null | undefined;
  title: string;
  alt: string;
  fit: CoverFit;
  sizes: string;
  className?: string;
  preload?: boolean;
  fallbackClassName?: string;
}) {
  if (cover) {
    return (
      <Cover
        cover={cover}
        alt={alt}
        fit={fit}
        sizes={sizes}
        className={className}
        preload={preload}
      />
    );
  }
  return (
    <span
      className={`flex aspect-[2/3] items-center justify-center text-center font-sans text-sm font-bold uppercase text-black ${fallbackClassName ?? "p-4"}`}
    >
      {title}
    </span>
  );
}

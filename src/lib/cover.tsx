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
 * Plafond des dimensions passées à `next/image` : au-delà, le srcset généré
 * monte jusqu'à 2048/3840w alors que les couvertures s'affichent à ≤ ~400px
 * CSS (carrousel, grille, fiche). On conserve le ratio, on borne le grand côté.
 */
const MAX_RESERVATION = 1080;

/**
 * Dimensions à passer à `next/image` pour réserver l'espace. Jamais de valeur
 * dégénérée (2px…) qui ferait demander une image minuscule à l'optimiseur :
 * on retombe sur une résolution nominale quand la base ne fournit rien.
 */
function reservation(cover: CoverLike): { w: number; h: number } {
  if (cover && cover.width >= 20 && cover.height >= 20) {
    const w0 = cover.width;
    const h0 = cover.height;
    const long = Math.max(w0, h0);
    if (long <= MAX_RESERVATION) {
      return { w: Math.round(w0), h: Math.round(h0) };
    }
    const scale = MAX_RESERVATION / long;
    return { w: Math.round(w0 * scale), h: Math.round(h0 * scale) };
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

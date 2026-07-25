import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Bouton CTA — recette couleur/bordure/hover/focus partagée par les
 * clusters de CTA du site. Le padding, le tracking et la taille de texte
 * varient d'un appelant à l'autre : ils passent par `className`, pas par
 * cette recette. L'anneau de focus dépend du fond AU REPOS de chaque variante
 * (R5) : SOLID démarre sur ink → anneau sombre (pop-yellow) ; OUTLINE démarre
 * sur paper → anneau clair (ink) ; HOUSE démarre sur navy/brick (accent
 * sombre) → anneau sombre, comme SOLID ; ALARM démarre sur brick → anneau
 * sombre aussi. État `disabled` (R7) : opacité
 * réduite, curseur bloqué, hover neutralisé (n'a de prise que sur le
 * `<button>` rendu sans `href` — un lien ne peut pas être `disabled` en
 * HTML).
 */

const BASE =
  "inline-flex items-center justify-center font-sans font-bold uppercase transition-colors motion-reduce:transition-none border-2 disabled:cursor-not-allowed disabled:opacity-40";

const SOLID = `border-ink bg-ink text-paper hover:bg-paper hover:text-ink disabled:hover:bg-ink disabled:hover:text-paper ${FOCUS_RING_DARK}`;
const OUTLINE = `border-ink bg-paper text-ink hover:bg-ink hover:text-paper disabled:hover:bg-paper disabled:hover:text-ink ${FOCUS_RING_LIGHT}`;

/**
 * Variante « inversée » (clair sur fond ink, souscription §7) : même recette
 * qu'OUTLINE (fond paper au repos, hover inversé), bordure PAPER plutôt
 * qu'ink — le bord doit rester visible posé sur un fond ink, jamais se
 * confondre avec lui. Exportée en plus du composant : les CTA en `<form
 * action>` (`<SubmitButton>`, `tone="light"`) ne composent pas `<Button>`
 * mais ont besoin de la même recette de couleur pour ne pas la recopier à la
 * main à chaque emplacement.
 */
export const INVERT = `border-paper bg-paper text-ink hover:bg-ink hover:text-paper disabled:hover:bg-paper disabled:hover:text-ink ${FOCUS_RING_LIGHT}`;

/**
 * Variante « maison » (R3 — navy = Éditions sociales, brick = La Dispute) :
 * CTA à bordure paper sur fond navy/brick, réservée aux liens de maison du
 * héros de marque de l'accueil (chantier 4 §1). Même recette d'inversion au
 * survol que SOLID/OUTLINE (R4), appliquée à l'accent de la maison plutôt
 * qu'à ink. Correspondance littérale (contrat JIT) : jamais `bg-${tone}`
 * assemblé dynamiquement.
 */
const HOUSE: Record<"navy" | "brick", string> = {
  navy: `border-paper bg-navy text-paper hover:bg-paper hover:text-navy disabled:hover:bg-navy disabled:hover:text-paper ${FOCUS_RING_DARK}`,
  brick: `border-paper bg-brick text-paper hover:bg-paper hover:text-brick disabled:hover:bg-paper disabled:hover:text-brick ${FOCUS_RING_DARK}`,
};

/**
 * Variante « alarme » (brick sur fond CLAIR — le CTA du compteur de
 * /souscription, retour Youri soir du 26/07) : même recette que HOUSE brick,
 * bordure INK et non paper — posée sur paper, une bordure paper
 * disparaîtrait ; le contour reste celui des objets du fond clair. Repos sur
 * brick (accent sombre) → anneau sombre, comme SOLID/HOUSE. Elle rime avec le
 * bandeau brick de la feuille de bas d'écran : les deux entrées vers le
 * paiement portent le même rouge.
 */
const ALARM = `border-ink bg-brick text-paper hover:bg-paper hover:text-brick disabled:hover:bg-brick disabled:hover:text-paper ${FOCUS_RING_DARK}`;

type ButtonOwnProps = {
  href?: string;
  variant?: "solid" | "outline" | "house" | "invert" | "alarm";
  /** Couleur de la maison ciblée — requis quand `variant="house"`. */
  tone?: "navy" | "brick";
  className?: string;
  target?: string;
  rel?: string;
  children: ReactNode;
};

type ButtonProps = ButtonOwnProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement> & ButtonHTMLAttributes<HTMLButtonElement>,
    keyof ButtonOwnProps | "href"
  >;

export function Button({
  href,
  variant = "solid",
  tone,
  className,
  target,
  rel,
  children,
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === "house"
      ? HOUSE[tone ?? "navy"]
      : variant === "outline"
        ? OUTLINE
        : variant === "invert"
          ? INVERT
          : variant === "alarm"
            ? ALARM
            : SOLID;
  const classes = [BASE, variantClass, className].filter(Boolean).join(" ");

  if (href) {
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={classes} target={target} rel={rel} {...rest}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} className={classes} target={target} rel={rel} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

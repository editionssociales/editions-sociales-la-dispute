import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Bouton CTA — recette couleur/bordure/hover/focus partagée par les
 * clusters de CTA du site. Le padding, le tracking et la taille de texte
 * varient d'un appelant à l'autre : ils passent par `className`, pas par
 * cette recette. L'anneau de focus dépend du fond AU REPOS de chaque variante
 * (R5) : SOLID démarre sur ink → anneau sombre (pop-yellow) ; OUTLINE démarre
 * sur paper → anneau clair (ink). État `disabled` (R7) : opacité réduite,
 * curseur bloqué, hover neutralisé (n'a de prise que sur le `<button>` rendu
 * sans `href` — un lien ne peut pas être `disabled` en HTML).
 */

const BASE =
  "inline-flex items-center justify-center font-sans font-bold uppercase transition-colors motion-reduce:transition-none border-2 border-ink disabled:cursor-not-allowed disabled:opacity-40";

const SOLID = `bg-ink text-paper hover:bg-paper hover:text-ink disabled:hover:bg-ink disabled:hover:text-paper ${FOCUS_RING_DARK}`;
const OUTLINE = `bg-paper text-ink hover:bg-ink hover:text-paper disabled:hover:bg-paper disabled:hover:text-ink ${FOCUS_RING_LIGHT}`;

type ButtonOwnProps = {
  href?: string;
  variant?: "solid" | "outline";
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
  className,
  target,
  rel,
  children,
  ...rest
}: ButtonProps) {
  const classes = [BASE, variant === "solid" ? SOLID : OUTLINE, className]
    .filter(Boolean)
    .join(" ");

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

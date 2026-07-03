import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { FOCUS_RING } from "@/lib/ui";

/**
 * Bouton CTA — recette couleur/bordure/hover/focus partagée par les
 * clusters de CTA du site. Le padding, le tracking et la taille de texte
 * varient d'un appelant à l'autre : ils passent par `className`, pas par
 * cette recette.
 */

const BASE =
  "inline-flex items-center justify-center font-sans font-bold uppercase transition-colors motion-reduce:transition-none border-2 border-black " +
  FOCUS_RING;

const SOLID = "bg-black text-white hover:bg-white hover:text-black";
const OUTLINE = "bg-white text-black hover:bg-black hover:text-white";

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

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { FOCUS_RING_DARK, FOCUS_RING_INVERTING, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Bouton CTA — recette couleur/bordure/hover/focus partagée par les
 * clusters de CTA du site. Le padding, le tracking et la taille de texte
 * varient d'un appelant à l'autre : ils passent par `className`, pas par
 * cette recette. L'anneau de focus dépend du fond AU REPOS de chaque variante
 * (R5) : SOLID démarre sur ink → anneau sombre (pop-yellow) ; OUTLINE démarre
 * sur paper → anneau clair (ink) ; HOUSE démarre sur navy/brick (accent
 * sombre) → anneau sombre, comme SOLID ; ALARM, seule variante dont le fond
 * S'INVERSE orange → ink, prend l'anneau inversant `FOCUS_RING_INVERTING`
 * (voir plus bas). États `disabled`/`active` (R7) : `disabled` — opacité
 * réduite, curseur bloqué, hover neutralisé (n'a de prise que sur le
 * `<button>` rendu sans `href` — un lien ne peut pas être `disabled` en
 * HTML, cf. le type discriminé `ButtonProps` plus bas, qui rend le couple
 * `href`+`disabled` impossible à la compilation) ; `active:` — pression
 * (souris/tactile), même sens que le hover (inversion), un cran plus soutenu
 * pour se distinguer de lui.
 */

// `inline-flex` est en DUR ici : un `hidden` nu passé en `className` ne masque
// donc PAS un `<Button>` — Tailwind écrit `.inline-flex` après `.hidden`, et à
// égalité de spécificité c'est le dernier écrit qui gagne, quel que soit
// l'ordre dans l'attribut. Masquer un Button : `<span>` enveloppant, ou une
// variante `@media` seule (`lg:hidden`). Verrouillé par `button-display.test.tsx`.
const BASE =
  "inline-flex items-center justify-center font-sans font-bold uppercase transition-colors motion-reduce:transition-none border-2 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:brightness-100";

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
 * Variante « alarme » (l'ORANGE DE LA PALETTE DU SITE sur fond clair — le CTA
 * du compteur de /souscription ; brick à l'origine, passé à l'orange le
 * 2026-08-07 avec toute la page, retour Clara) : bordure INK et non paper —
 * posée sur paper, une bordure paper disparaîtrait ; le contour reste celui des
 * objets du fond clair. L'orange est CLAIR : le texte y est `ink` (5,09:1),
 * jamais `paper` (3,38:1, sous les 4,5:1 de AA), et l'inversion au survol se
 * fait donc vers ink et non vers paper. Anneau : ni DARK ni LIGHT mais `FOCUS_RING_INVERTING` (`lib/ui.ts`) —
 * le pop-yellow de DARK ne fait que 2,99:1 sur l'orange, SOUS le seuil de 3:1
 * de WCAG 1.4.11 (ce commentaire annonçait « ≈3:1 » ; c'était en dessous,
 * corrigé le 2026-08-18), et l'ink de LIGHT disparaîtrait sur l'ink du survol.
 * L'anneau inversant tient les DEUX états : ink 5,09:1 au repos, paper 17,19:1
 * au survol. Elle rime avec le bandeau de la feuille de bas d'écran : les deux
 * entrées vers le paiement portent le même orange — et le même anneau.
 */
const ALARM = `border-ink bg-pop-orange text-ink hover:bg-ink hover:text-pop-orange disabled:hover:bg-pop-orange disabled:hover:text-ink ${FOCUS_RING_INVERTING}`;

type ButtonCommonProps = {
  variant?: "solid" | "outline" | "house" | "invert" | "alarm";
  /** Couleur de la maison ciblée — requis quand `variant="house"`. */
  tone?: "navy" | "brick";
  className?: string;
  children: ReactNode;
};

/**
 * Rendu lien : jamais `disabled` — un `<a>` ne peut pas l'être en HTML (rien
 * n'empêchait auparavant de le passer quand même : ça compilait, et ça ne
 * faisait rien). `href` discrimine l'union : présent ⇒ ce variant, `disabled`
 * hors de portée du type ; absent ⇒ `ButtonAsButtonProps`, où il redevient
 * valide (#88).
 */
type ButtonAsLinkProps = ButtonCommonProps & {
  href: string;
  target?: string;
  rel?: string;
} & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof ButtonCommonProps | "href" | "target" | "rel"
  >;

type ButtonAsButtonProps = ButtonCommonProps & {
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonCommonProps>;

export type ButtonProps = ButtonAsLinkProps | ButtonAsButtonProps;

export function Button({ variant = "solid", tone, className, children, ...domProps }: ButtonProps) {
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

  // `domProps` (props communes retirées) reste un type-union discriminé sur
  // `href` : le test narrowe vers `ButtonAsLinkProps` (jamais de `disabled`
  // dans cette branche) plutôt que vers `ButtonAsButtonProps`.
  // `typeof … === "string"` et NON une simple vérité : `href: ""` laisserait
  // l'union non résolue dans la branche `else`, et le `type?: string` que
  // `AnchorHTMLAttributes` porte pour les `<a>` viendrait alors élargir le
  // `type="button"` du `<button>` rendu plus bas.
  if (typeof domProps.href === "string") {
    const { href, target, rel, ...rest } = domProps;
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

  const { href: _href, ...rest } = domProps;
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

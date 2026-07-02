import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Module de composition de « rectangles » plats bg-ink/text-paper qui
 * s'inversent au survol/focus. Sert la navbar (bandeau compact + affiche
 * desktop, nav mobile hybride, overlay mobile) et, plus tard, le menu des
 * thèmes du catalogue.
 *
 * Les classes de placement en grille passent par des tables statiques :
 * Tailwind v4 (JIT) ne compile pas les classes construites dynamiquement
 * (`col-start-${n}`). Les besoins de mise en page hors de ces enums
 * (gabarits de colonnes, affichage responsive…) passent par des classes
 * littérales fournies par l'appelant (`cols`, `rows`, `className`).
 */

export type BlockVariant = "lien" | "cta" | "socials" | "actif";

const COL_START = {
  1: "col-start-1",
  2: "col-start-2",
  3: "col-start-3",
  4: "col-start-4",
} as const;

const ROW_START = {
  1: "row-start-1",
  2: "row-start-2",
  3: "row-start-3",
  4: "row-start-4",
  5: "row-start-5",
  6: "row-start-6",
  7: "row-start-7",
} as const;

const COL_SPAN = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
} as const;

const ROW_SPAN = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
  4: "row-span-4",
  5: "row-span-5",
  6: "row-span-6",
} as const;

/** Couleurs + inversion au survol par variante — littéraux complets (JIT). */
export const BLOCK_VARIANT_CLASSES: Record<BlockVariant, string> = {
  lien: "bg-ink text-paper hover:bg-paper hover:text-ink",
  cta: "bg-ink text-paper hover:bg-ocher-text hover:text-paper",
  socials: "bg-ink text-paper",
  actif: "bg-paper text-ink ring-2 ring-inset ring-ink",
};

/**
 * Transition + parité clavier partagées : le focus-visible reproduit l'état
 * hover du proto (outline 3px ocre, offset -3, la cellule focus passe
 * au-dessus de ses voisines). Neutralisée sous prefers-reduced-motion.
 */
export const BLOCK_INTERACTIVE_CLASSES =
  "relative transition-colors duration-150 [transition-timing-function:ease] motion-reduce:transition-none focus-visible:z-[2] focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-[-3px]";

export interface BlockCell {
  key: string;
  variant: BlockVariant;
  href?: string;
  colStart?: keyof typeof COL_START;
  colSpan?: keyof typeof COL_SPAN;
  rowStart?: keyof typeof ROW_START;
  rowSpan?: keyof typeof ROW_SPAN;
  /** Classes littérales additionnelles (mise en page, espacements) propres à l'appelant. */
  className?: string;
  /** Contenu entièrement personnalisé, prioritaire sur kicker/label/note/numero (ex. cellule « Nous suivre »). */
  content?: ReactNode;
  kicker?: string;
  kickerClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  note?: ReactNode;
  noteClassName?: string;
  /** Numéro affiché en haut à droite (cellules « Catalogue » 01, « À paraître » 02…). */
  numero?: string;
  ariaCurrent?: boolean;
  ariaLabel?: string;
}

function placementClasses(cell: BlockCell): string {
  return [
    cell.colStart ? COL_START[cell.colStart] : "",
    cell.colSpan ? COL_SPAN[cell.colSpan] : "",
    cell.rowStart ? ROW_START[cell.rowStart] : "",
    cell.rowSpan ? ROW_SPAN[cell.rowSpan] : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function CellBody({ cell }: { cell: BlockCell }) {
  if (cell.content !== undefined) return <>{cell.content}</>;
  return (
    <>
      {cell.numero && (
        <span className="absolute right-[18px] top-4 font-sans text-[11px] tracking-[.18em] opacity-50">
          {cell.numero}
        </span>
      )}
      {cell.kicker && <span className={cell.kickerClassName}>{cell.kicker}</span>}
      {cell.label !== undefined && <span className={cell.labelClassName}>{cell.label}</span>}
      {cell.note !== undefined && <span className={cell.noteClassName}>{cell.note}</span>}
    </>
  );
}

/** Rendu d'une cellule seule — pour composer des grilles non uniformes (nav mobile, overlay). */
export function BlockMenuItem({ cell }: { cell: BlockCell }) {
  const shared = [
    BLOCK_VARIANT_CLASSES[cell.variant],
    BLOCK_INTERACTIVE_CLASSES,
    placementClasses(cell),
    cell.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!cell.href) {
    return (
      <div className={shared} aria-label={cell.ariaLabel}>
        <CellBody cell={cell} />
      </div>
    );
  }

  return (
    <Link
      href={cell.href}
      aria-current={cell.ariaCurrent ? "true" : undefined}
      aria-label={cell.ariaLabel}
      className={shared}
    >
      <CellBody cell={cell} />
    </Link>
  );
}

export interface BlockMenuProps {
  cells: BlockCell[];
  /** Classes littérales de grid-template-columns (ex. "lg:grid-cols-[1.72fr_1.04fr_1.06fr_1.06fr]"). */
  cols: string;
  /** Classes littérales de grid-template-rows (ex. "lg:grid-rows-6"). */
  rows?: string;
  /** Affichage/positionnement du conteneur (ex. "hidden lg:grid relative z-[41]"). */
  className?: string;
  ariaLabel?: string;
}

/** Grille de blocs pleins — affiche desktop de la navbar, (plus tard) thèmes du catalogue. */
export function BlockMenu({ cells, cols, rows, className = "", ariaLabel }: BlockMenuProps) {
  return (
    <nav aria-label={ariaLabel} className={`gap-[3px] bg-paper ${cols} ${rows ?? ""} ${className}`}>
      {cells.map((cell) => (
        <BlockMenuItem key={cell.key} cell={cell} />
      ))}
    </nav>
  );
}

export interface SocialLink {
  key: string;
  ariaLabel: string;
  initials: string;
}

/** Données partagées entre l'affiche desktop et l'overlay mobile. */
export const SOCIAL_LINKS: SocialLink[] = [
  { key: "instagram", ariaLabel: "Instagram", initials: "Ig" },
  { key: "facebook", ariaLabel: "Facebook", initials: "Fb" },
  { key: "x", ariaLabel: "X (anciennement Twitter)", initials: "X" },
  { key: "linkedin", ariaLabel: "LinkedIn", initials: "In" },
];

const SOCIAL_SIZE: Record<"desktop" | "mobile", string> = {
  desktop: "h-[38px] w-[38px]",
  mobile: "h-10 w-10",
};

/** Cercles de réseaux sociaux — bordure paper sur fond ink (contraste vérifié). */
export function SocialCircles({
  size = "desktop",
  className = "",
}: {
  size?: "desktop" | "mobile";
  className?: string;
}) {
  return (
    <div className={`flex gap-2.5 ${className}`}>
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.key}
          // TODO(client) : remplacer par l'URL réelle de ce réseau social.
          href="#"
          aria-label={s.ariaLabel}
          className={`flex ${SOCIAL_SIZE[size]} items-center justify-center rounded-full border-[1.5px] border-paper font-sans text-xs font-semibold text-paper transition-colors duration-150 [transition-timing-function:ease] hover:bg-paper hover:text-ink focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-2 motion-reduce:transition-none`}
        >
          {s.initials}
        </a>
      ))}
    </div>
  );
}

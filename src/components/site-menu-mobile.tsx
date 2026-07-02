"use client";

import { useEffect, useState } from "react";
import {
  BLOCK_INTERACTIVE_CLASSES,
  BLOCK_VARIANT_CLASSES,
  BlockMenuItem,
  SocialCircles,
  type BlockCell,
} from "./block-menu";

const HYBRID_MAISON_CLASS =
  "flex min-h-[86px] items-end whitespace-nowrap px-4 py-3.5 font-serif text-[19px] font-semibold uppercase leading-[0.98]";

/** Nav hybride sticky (2 colonnes) affichée sous 1024px. */
const HYBRID_CELLS: BlockCell[] = [
  {
    key: "la-dispute",
    variant: "lien",
    href: "/editions/la-dispute",
    className: HYBRID_MAISON_CLASS,
    label: "La Dispute",
  },
  {
    key: "editions-sociales",
    variant: "lien",
    href: "/editions/editions-sociales",
    className: HYBRID_MAISON_CLASS,
    label: "Les Éditions sociales",
  },
  {
    key: "soutenir",
    variant: "cta",
    href: "/souscription",
    className: "flex min-h-[72px] flex-col justify-center gap-1 px-4 py-3.5",
    kicker: "Souscription",
    kickerClassName: "font-sans text-[10px] uppercase tracking-[.18em] opacity-60",
    label: "Nous soutenir",
    labelClassName: "font-serif text-[22px] font-semibold uppercase leading-[0.96]",
  },
];

const OVERLAY_LINK_CLASS = "flex min-h-[104px] items-end whitespace-nowrap p-[18px]";
const OVERLAY_LINK_LABEL_CLASS = "font-sans text-[26px] font-bold uppercase tracking-[.03em]";

/** Liens de l'overlay plein écran (identiques à l'affiche desktop). */
const OVERLAY_LINKS: BlockCell[] = [
  {
    key: "catalogue",
    variant: "lien",
    href: "/catalogue",
    className: OVERLAY_LINK_CLASS,
    label: "Catalogue",
    labelClassName: OVERLAY_LINK_LABEL_CLASS,
  },
  {
    key: "a-paraitre",
    variant: "lien",
    href: "/catalogue?upcoming=1",
    className: OVERLAY_LINK_CLASS,
    label: "À paraître",
    labelClassName: OVERLAY_LINK_LABEL_CLASS,
  },
  {
    key: "rencontres",
    variant: "lien",
    href: "/rencontres",
    className: OVERLAY_LINK_CLASS,
    label: "Rencontres",
    labelClassName: OVERLAY_LINK_LABEL_CLASS,
  },
  {
    key: "geme",
    variant: "lien",
    href: "/catalogue/editions-sociales?collection=geme",
    className: OVERLAY_LINK_CLASS,
    label: "La GEME",
    labelClassName: OVERLAY_LINK_LABEL_CLASS,
  },
];

/** Nav mobile (< 1024px) : bandeau hybride sticky + bouton Menu + overlay plein écran. */
export function SiteMenuMobile() {
  const [open, setOpen] = useState(false);

  // Fermeture au clavier (Échap) et verrouillage du scroll de fond pendant l'overlay.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="sticky top-0 z-[60] grid grid-cols-2 gap-[3px] bg-paper lg:hidden"
      >
        {HYBRID_CELLS.map((cell) => (
          <BlockMenuItem key={cell.key} cell={cell} />
        ))}
        <button
          type="button"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 border-0 ${BLOCK_VARIANT_CLASSES.lien} ${BLOCK_INTERACTIVE_CLASSES}`}
        >
          <span aria-hidden="true" className="h-0.5 w-[26px] bg-current" />
          <span aria-hidden="true" className="h-0.5 w-[26px] bg-current" />
          <span aria-hidden="true" className="h-0.5 w-[26px] bg-current" />
          <span className="mt-0.5 font-sans text-[10px] uppercase tracking-[.16em]">Menu</span>
        </button>
      </nav>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navigation"
          className="fixed inset-0 z-[80] flex flex-col gap-[3px] overflow-auto bg-paper"
        >
          <div className="flex gap-[3px]">
            <span className="flex flex-1 items-center bg-ink p-4 font-serif text-base font-semibold text-paper">
              Menu
            </span>
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setOpen(false)}
              className={`w-16 border-0 text-[22px] ${BLOCK_VARIANT_CLASSES.lien} ${BLOCK_INTERACTIVE_CLASSES}`}
            >
              ✕
            </button>
          </div>

          {/* Délégation : tout clic sur un lien de l'overlay referme le menu
              (la navigation App Router ne démonte pas le header du layout). */}
          <div className="contents" onClick={() => setOpen(false)}>
            {OVERLAY_LINKS.map((cell) => (
              <BlockMenuItem key={cell.key} cell={cell} />
            ))}
          </div>

          <div className="flex items-center gap-3.5 bg-ink px-[18px] py-5">
            <span className="font-sans text-[11px] uppercase tracking-[.2em] text-paper opacity-50">
              Nous suivre
            </span>
            <SocialCircles size="mobile" />
          </div>
        </div>
      )}
    </>
  );
}

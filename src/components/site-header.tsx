"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Navbar brutaliste — quadrillage noir 2px (conteneur `grid gap-[2px]
 * bg-black p-[2px]`, cellules blanches/pop). Collante (sticky) : GRANDE en haut
 * de page, elle se COMPACTE en douceur dès qu'on défile (état `compact`, ~200ms).
 *
 * Desktop (lg+) : 4 colonnes × 2 rangées — maisons | « Nous soutenir » | nav 2×2.
 * Mobile : empilé — 2 maisons pleine largeur, nav 2×2, puis « Nous soutenir ».
 */

type NavSection = "catalogue" | "geme" | "a-paraitre" | "agenda";

const NAV_ACCENT_CLASS: Record<NavSection, string> = {
  catalogue: "bg-pop-pink",
  geme: "bg-pop-teal",
  "a-paraitre": "bg-pop-orange",
  agenda: "bg-pop-yellow",
};
const NAV_HOVER_CLASS: Record<NavSection, string> = {
  catalogue: "bg-white hover:bg-pop-pink",
  geme: "bg-white hover:bg-pop-teal",
  "a-paraitre": "bg-white hover:bg-pop-orange",
  agenda: "bg-white hover:bg-pop-yellow",
};

// transition-all : la couleur (survol/actif) ET la taille (padding/police, au
// compactage) s'animent sur la même durée.
const CELL_TRANSITION =
  "transition-all duration-200 ease-out motion-reduce:transition-none";
const FOCUS_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black";
const FOCUS_LIGHT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white";

function maisonCellClass(compact: boolean) {
  return `flex items-center bg-white px-6 font-sans font-bold italic uppercase leading-none tracking-[.01em] text-black hover:bg-black hover:text-white ${CELL_TRANSITION} ${FOCUS_DARK} ${
    compact ? "py-3 text-[14px]" : "py-7 text-[clamp(18px,1.5vw,23px)]"
  }`;
}

function navCellClass(section: NavSection, active: boolean, compact: boolean) {
  // Sur desktop la hauteur des cellules nav suit la rangée (py-0) ; le padding
  // vertical ne joue qu'en mobile.
  const size = compact
    ? "py-3 text-[12px] lg:py-0"
    : "py-7 text-[14px] lg:py-0";
  return `flex items-center justify-center px-4 text-center font-sans font-extrabold uppercase tracking-[.08em] text-black ${CELL_TRANSITION} ${FOCUS_DARK} ${size} ${
    active ? NAV_ACCENT_CLASS[section] : NAV_HOVER_CLASS[section]
  }`;
}

function soutenirClass(compact: boolean, placement: string) {
  return `flex items-center justify-center gap-2 bg-black px-4 text-center font-sans font-extrabold uppercase tracking-[.08em] text-white hover:bg-pop-yellow hover:text-black ${CELL_TRANSITION} ${FOCUS_LIGHT} ${
    compact ? "text-[12px]" : "text-[14px]"
  } ${placement}`;
}

/**
 * Section active d'après le pathname : sur l'accueil les 4 cellules restent
 * allumées ; sur une page de section, seule la cellule correspondante.
 */
function useActiveSections(): Record<NavSection, boolean> {
  const pathname = usePathname() ?? "/";
  if (pathname === "/") {
    return { catalogue: true, geme: true, "a-paraitre": true, agenda: true };
  }
  const isGeme = pathname.startsWith("/catalogue/editions-sociales");
  const isCatalogue = pathname.startsWith("/catalogue") && !isGeme;
  const isAgenda = pathname.startsWith("/rencontres");
  return {
    catalogue: isCatalogue,
    geme: isGeme,
    // À paraître partage /catalogue : on n'allume que CATALOGUE sur une section.
    "a-paraitre": false,
    agenda: isAgenda,
  };
}

/** Passe à `true` dès qu'on quitte le haut de page (défilement > seuil). */
function useCompactOnScroll(threshold = 12): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return compact;
}

export function SiteHeader() {
  const active = useActiveSections();
  const compact = useCompactOnScroll();

  return (
    <header className="sticky top-0 z-50">
      <nav aria-label="Navigation principale" className="bg-black">
        {/* Mobile (< lg) : maisons pleine largeur, nav 2×2, puis « Nous soutenir ». */}
        <div className="grid grid-cols-2 gap-[2px] p-[2px] lg:hidden">
          <Link href="/editions/la-dispute" className={`col-span-2 ${maisonCellClass(compact)}`}>
            La Dispute
          </Link>
          <Link
            href="/editions/editions-sociales"
            className={`col-span-2 ${maisonCellClass(compact)}`}
          >
            Les Éditions sociales
          </Link>
          <Link
            href="/catalogue"
            aria-current={active.catalogue ? "page" : undefined}
            className={navCellClass("catalogue", active.catalogue, compact)}
          >
            Catalogue
          </Link>
          <Link
            href="/catalogue/editions-sociales?collection=geme"
            aria-current={active.geme ? "page" : undefined}
            className={navCellClass("geme", active.geme, compact)}
          >
            La Geme
          </Link>
          <Link
            href="/catalogue?upcoming=1"
            aria-current={active["a-paraitre"] ? "page" : undefined}
            className={navCellClass("a-paraitre", active["a-paraitre"], compact)}
          >
            À paraître
          </Link>
          <Link
            href="/rencontres"
            aria-current={active.agenda ? "page" : undefined}
            className={navCellClass("agenda", active.agenda, compact)}
          >
            Agenda
          </Link>
          <Link href="/souscription" className={soutenirClass(compact, "col-span-2 py-4")}>
            Nous soutenir <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Desktop (lg+) : maisons | « Nous soutenir » | nav 2×2. */}
        <div className="hidden grid-cols-[1.3fr_1fr_0.9fr_0.9fr] grid-rows-2 gap-[2px] p-[2px] lg:grid">
          <Link
            href="/editions/la-dispute"
            className={`col-start-1 row-start-1 ${maisonCellClass(compact)}`}
          >
            La Dispute
          </Link>
          <Link
            href="/editions/editions-sociales"
            className={`col-start-1 row-start-2 ${maisonCellClass(compact)}`}
          >
            Les Éditions sociales
          </Link>

          {/* Cellule centrale (vide dans la maquette) : CTA « Nous soutenir ». */}
          <Link
            href="/souscription"
            className={soutenirClass(compact, "col-start-2 row-span-2 row-start-1")}
          >
            Nous soutenir <span aria-hidden="true">→</span>
          </Link>

          <Link
            href="/catalogue"
            aria-current={active.catalogue ? "page" : undefined}
            className={`col-start-3 row-start-1 ${navCellClass("catalogue", active.catalogue, compact)}`}
          >
            Catalogue
          </Link>
          <Link
            href="/catalogue/editions-sociales?collection=geme"
            aria-current={active.geme ? "page" : undefined}
            className={`col-start-4 row-start-1 ${navCellClass("geme", active.geme, compact)}`}
          >
            La Geme
          </Link>
          <Link
            href="/catalogue?upcoming=1"
            aria-current={active["a-paraitre"] ? "page" : undefined}
            className={`col-start-3 row-start-2 ${navCellClass("a-paraitre", active["a-paraitre"], compact)}`}
          >
            À paraître
          </Link>
          <Link
            href="/rencontres"
            aria-current={active.agenda ? "page" : undefined}
            className={`col-start-4 row-start-2 ${navCellClass("agenda", active.agenda, compact)}`}
          >
            Agenda
          </Link>
        </div>
      </nav>
    </header>
  );
}

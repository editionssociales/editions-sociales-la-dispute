"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navbar brutaliste — quadrillage noir 2px (recette : conteneur
 * `grid gap-[2px] bg-black p-[2px]`, les gaps + le padding forment les
 * lignes ; les cellules enfant portent leur propre fond blanc/pop).
 *
 * Desktop (lg+) : 4 colonnes × 2 rangées — maisons | vide | nav 2×2.
 * Mobile : empilé — 2 maisons pleine largeur puis nav 2×2 (cellule vide
 * masquée, elle n'a pas de contenu).
 */

type NavSection = "catalogue" | "geme" | "a-paraitre" | "agenda";

const MAISON_CELL_CLASS =
  "flex items-center bg-white px-5 py-4 font-sans text-[15px] font-bold italic uppercase leading-none tracking-[.01em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black";

const NAV_LABEL_CLASS =
  "flex items-center justify-center px-4 py-6 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.08em] text-black transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black lg:py-0";

/** Fond par section quand active ; blanc + survol coloré sinon. */
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

function navCellClass(section: NavSection, active: boolean) {
  return `${NAV_LABEL_CLASS} ${active ? NAV_ACCENT_CLASS[section] : NAV_HOVER_CLASS[section]}`;
}

/**
 * Détermine la section active à partir du pathname (voir spec) : sur
 * l'accueil, les 4 cellules restent allumées ; sur une page de section,
 * seule la cellule correspondante l'est.
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
    // À paraître partage le chemin /catalogue : on n'allume que CATALOGUE sur
    // une page de section (une seule cellule active, comme la maquette).
    "a-paraitre": false,
    agenda: isAgenda,
  };
}

export function SiteHeader() {
  const active = useActiveSections();

  return (
    <header>
      <nav aria-label="Navigation principale" className="bg-black">
        {/* Mobile (< lg) : maisons pleine largeur puis nav 2×2. */}
        <div className="grid grid-cols-2 gap-[2px] p-[2px] lg:hidden">
          <Link href="/editions/la-dispute" className={`col-span-2 ${MAISON_CELL_CLASS}`}>
            La Dispute
          </Link>
          <Link
            href="/editions/editions-sociales"
            className={`col-span-2 ${MAISON_CELL_CLASS}`}
          >
            Les Éditions sociales
          </Link>
          <Link
            href="/catalogue"
            aria-current={active.catalogue ? "page" : undefined}
            className={navCellClass("catalogue", active.catalogue)}
          >
            Catalogue
          </Link>
          <Link
            href="/catalogue/editions-sociales?collection=geme"
            aria-current={active.geme ? "page" : undefined}
            className={navCellClass("geme", active.geme)}
          >
            La Geme
          </Link>
          <Link
            href="/catalogue?upcoming=1"
            aria-current={active["a-paraitre"] ? "page" : undefined}
            className={navCellClass("a-paraitre", active["a-paraitre"])}
          >
            À paraître
          </Link>
          <Link
            href="/rencontres"
            aria-current={active.agenda ? "page" : undefined}
            className={navCellClass("agenda", active.agenda)}
          >
            Agenda
          </Link>
          <Link
            href="/souscription"
            className="col-span-2 flex items-center justify-center gap-2 bg-black px-4 py-4 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.08em] text-white transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
          >
            Nous soutenir <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Desktop (lg+) : maisons | vide | nav 2×2. */}
        <div className="hidden grid-cols-[1.3fr_1fr_0.9fr_0.9fr] grid-rows-2 gap-[2px] p-[2px] lg:grid">
          <Link
            href="/editions/la-dispute"
            className={`col-start-1 row-start-1 ${MAISON_CELL_CLASS}`}
          >
            La Dispute
          </Link>
          <Link
            href="/editions/editions-sociales"
            className={`col-start-1 row-start-2 ${MAISON_CELL_CLASS}`}
          >
            Les Éditions sociales
          </Link>

          {/* Cellule centrale (vide dans la maquette) : CTA « Nous soutenir ». */}
          <Link
            href="/souscription"
            className="col-start-2 row-span-2 row-start-1 flex items-center justify-center gap-2 bg-black px-4 text-center font-sans text-[14px] font-extrabold uppercase tracking-[.08em] text-white transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
          >
            Nous soutenir <span aria-hidden="true">→</span>
          </Link>

          <Link
            href="/catalogue"
            aria-current={active.catalogue ? "page" : undefined}
            className={`col-start-3 row-start-1 ${navCellClass("catalogue", active.catalogue)}`}
          >
            Catalogue
          </Link>
          <Link
            href="/catalogue/editions-sociales?collection=geme"
            aria-current={active.geme ? "page" : undefined}
            className={`col-start-4 row-start-1 ${navCellClass("geme", active.geme)}`}
          >
            La Geme
          </Link>
          <Link
            href="/catalogue?upcoming=1"
            aria-current={active["a-paraitre"] ? "page" : undefined}
            className={`col-start-3 row-start-2 ${navCellClass("a-paraitre", active["a-paraitre"])}`}
          >
            À paraître
          </Link>
          <Link
            href="/rencontres"
            aria-current={active.agenda ? "page" : undefined}
            className={`col-start-4 row-start-2 ${navCellClass("agenda", active.agenda)}`}
          >
            Agenda
          </Link>
        </div>
      </nav>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  NAV_HOUSES,
  NAV_SECTIONS,
  activeSections,
  type NavSectionId,
} from "@/lib/nav";
import { CartNavCell } from "./cart/cart-badge";

/**
 * Navbar brutaliste — quadrillage noir 2px (conteneur `grid gap-[2px]
 * bg-black p-[2px]`, cellules blanches/pop). Collante (sticky) : GRANDE en haut
 * de page, elle se COMPACTE en douceur dès qu'on défile (état `compact`, ~200ms).
 *
 * Desktop (lg+) : 4 colonnes × 2 rangées — maisons | « Nous soutenir » | nav 2×2.
 * Mobile : empilé — 2 maisons pleine largeur, nav 2×2, puis « Nous soutenir ».
 *
 * La 5e cellule « Panier » (desktop et mobile, plan §4 étape 6) est
 * permanente. `useSearchParams` (états Geme / À paraître) est confiné derrière
 * `<Suspense>` — sans ça, le layout racine dynamiserait tout le site.
 *
 * Sections et maisons viennent du modèle de données `lib/nav` (label, href,
 * matcher d'activité) ; ce composant n'ajoute que l'apparence.
 */

const NAV_ACCENT_CLASS: Record<NavSectionId, string> = {
  catalogue: "bg-pop-pink",
  geme: "bg-pop-teal",
  "a-paraitre": "bg-pop-orange",
  agenda: "bg-pop-yellow",
};
const NAV_HOVER_CLASS: Record<NavSectionId, string> = {
  catalogue: "bg-white hover:bg-pop-pink",
  geme: "bg-white hover:bg-pop-teal",
  "a-paraitre": "bg-white hover:bg-pop-orange",
  agenda: "bg-white hover:bg-pop-yellow",
};

/** Placement en grille desktop (littéral : le JIT ne compile pas `col-start-${n}`). */
const HOUSE_ROW = ["row-start-1", "row-start-2"];
const SECTION_PLACEMENT: Record<NavSectionId, string> = {
  catalogue: "col-start-3 row-start-1",
  geme: "col-start-4 row-start-1",
  "a-paraitre": "col-start-3 row-start-2",
  agenda: "col-start-4 row-start-2",
};

/**
 * Grille desktop, littérale (jamais de gabarit assemblé par concaténation,
 * même contrat que `maisonCellClass` ci-dessous) — 5 colonnes, « Panier » en
 * dernière.
 */
const DESKTOP_GRID =
  "hidden grid-cols-[1.3fr_1fr_0.9fr_0.9fr_0.7fr] grid-rows-2 gap-[2px] p-[2px] lg:grid";

// transition-all : la couleur (survol/actif) ET la taille (padding/police, au
// compactage) s'animent sur la même durée.
const CELL_TRANSITION =
  "transition-all duration-200 ease-out motion-reduce:transition-none";
const FOCUS_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black";
const FOCUS_LIGHT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white";

// Fondu/échelle des deux calques du CTA « Nous soutenir » (cf. SoutenirCell) :
// on anime opacité + transform (compositables, continus) et JAMAIS la police
// d'un même libellé — dont le reflow 2 lignes ↔ 1 ligne « sauterait ».
const MORPH_TRANSITION =
  "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

function maisonCellClass(compact: boolean) {
  return `flex items-center bg-white px-6 font-sans font-bold italic uppercase leading-none tracking-[.01em] text-black hover:bg-black hover:text-white ${CELL_TRANSITION} ${FOCUS_DARK} ${
    compact ? "py-3 text-[14px]" : "py-7 text-[clamp(18px,1.5vw,23px)]"
  }`;
}

function navCellClass(section: NavSectionId, active: boolean, compact: boolean) {
  // Sur desktop la hauteur des cellules nav suit la rangée (py-0) ; le padding
  // vertical ne joue qu'en mobile.
  const size = compact
    ? "py-3 text-[12px] lg:py-0"
    : "py-7 text-[14px] lg:py-0";
  return `flex items-center justify-center px-4 text-center font-sans font-extrabold uppercase tracking-[.08em] text-black ${CELL_TRANSITION} ${FOCUS_DARK} ${size} ${
    active ? NAV_ACCENT_CLASS[section] : NAV_HOVER_CLASS[section]
  }`;
}

function soutenirClass(placement: string) {
  // Conteneur du CTA « Nous soutenir » : styles COMMUNS aux deux états (fond,
  // survol, focus, graisse). Ni la taille ni le nombre de lignes ne sont animés
  // ici — deux calques empilés s'en chargent (cf. SoutenirCell). `grid` sert de
  // pile : les deux calques occupent la MÊME cellule ([grid-area:1/1]). `relative`
  // ancre la flèche déployée (hors des calques, pour garder sa position d'origine).
  return `relative grid bg-black px-4 text-center font-sans font-extrabold italic uppercase tracking-[.06em] text-white hover:bg-pop-yellow hover:text-black ${CELL_TRANSITION} ${FOCUS_LIGHT} ${placement}`;
}

/**
 * Cellule CTA « Nous soutenir ». Deux calques SUPERPOSÉS dans la même cellule de
 * grille ([grid-area:1/1]), chacun figé dans sa mise en page — on ne redimensionne
 * jamais un libellé unique (dont le passage 2 lignes → 1 ligne « sauterait ») :
 *
 *  • calque DÉPLOYÉ  — grand corps, libellé sur ~2 lignes, flèche au coin bas-droit ;
 *  • calque COMPACT  — corps réduit, libellé sur 1 ligne aligné à une grande flèche.
 *
 * On croise leur opacité + une légère échelle (grossit en se déployant, rétrécit
 * en se compactant) : morphing fluide et continu, sans reflow. Le libellé est
 * dupliqué visuellement mais chaque calque est `aria-hidden` ; le nom accessible
 * unique et stable vient de l'`aria-label` du lien. `placement` place la cellule.
 */
function SoutenirCell({ compact, placement }: { compact: boolean; placement: string }) {
  return (
    <Link
      href="/souscription"
      aria-label="Nous soutenir"
      className={soutenirClass(placement)}
    >
      {/* Calque DÉPLOYÉ : grand libellé (~2 lignes). Visible en haut de page ;
          s'efface en rétrécissant au compactage. */}
      <span
        aria-hidden="true"
        className={`flex items-center justify-center [grid-area:1/1] ${MORPH_TRANSITION} ${
          compact ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <span className="leading-[0.95] text-[clamp(22px,7vw,42px)]">Nous soutenir</span>
      </span>

      {/* Calque COMPACT : libellé 1 ligne + flèche alignés. Apparaît en rétrécissant au compactage. */}
      <span
        aria-hidden="true"
        className={`flex items-center justify-center gap-3 [grid-area:1/1] ${MORPH_TRANSITION} ${
          compact ? "scale-100 opacity-100" : "scale-110 opacity-0"
        }`}
      >
        <span className="whitespace-nowrap leading-none text-[clamp(20px,2vw,28px)]">
          Nous soutenir
        </span>
        <span className="flex-none leading-none text-[clamp(22px,2.2vw,30px)]">→</span>
      </span>

      {/* Flèche du calque déployé : ancrée au coin bas-droit de la cellule, contre le
          lien (hors des calques transformés, pour garder sa position d'origine) ;
          s'efface avec le grand libellé. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-2 right-4 leading-none text-[clamp(32px,3vw,44px)] ${MORPH_TRANSITION} ${
          compact ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        →
      </span>
    </Link>
  );
}

/** Sections actives d'après pathname + query (logique dans `lib/nav`). */
function useActiveSections(): Record<NavSectionId, boolean> {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  return activeSections(pathname, searchParams);
}

/**
 * Passe à `true` dès qu'on quitte le haut de page. HYSTÉRÉSIS (deux seuils) : on
 * se compacte en dépassant `enter`, on ne se re-déploie qu'en repassant sous
 * `exit` — la bande morte entre les deux tue le papillotement autour d'un seuil
 * unique.
 *
 * NB : la vraie cause du yo-yo lent était le *scroll anchoring* du navigateur.
 * Le header est sticky (donc dans le flux) ; en se compactant il libère ~sa
 * moitié de hauteur, et le navigateur réajustait alors scrollY vers le haut pour
 * garder le contenu stable — ce qui refaisait passer scrollY sous le seuil et
 * re-déployait la navbar, en boucle. On neutralise ce réajustement via
 * `overflow-anchor: none` (globals.css) ; l'hystérésis ci-dessous ne fait plus
 * que blinder d'éventuelles micro-oscillations résiduelles.
 */
function useCompactOnScroll(enter = 72, exit = 16): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY;
      setCompact((prev) => (prev ? y > exit : y > enter));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enter, exit]);
  return compact;
}

function SiteHeaderChrome({
  active,
  compact,
}: {
  active: Record<NavSectionId, boolean>;
  compact: boolean;
}) {
  return (
    <header className="sticky top-0 z-50">
      <nav aria-label="Navigation principale" className="bg-black">
        {/* Mobile (< lg) : maisons pleine largeur, nav 2×2, panier, puis « Nous soutenir ». */}
        <div className="grid grid-cols-2 gap-[2px] p-[2px] lg:hidden">
          {NAV_HOUSES.map((house) => (
            <Link
              key={house.href}
              href={house.href}
              className={`col-span-2 ${maisonCellClass(compact)}`}
            >
              {house.label}
            </Link>
          ))}
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active[section.id] ? "page" : undefined}
              className={navCellClass(section.id, active[section.id], compact)}
            >
              {section.label}
            </Link>
          ))}
          <CartNavCell compact={compact} placement="col-span-2" />
          <SoutenirCell compact={compact} placement="col-span-2 py-4" />
        </div>

        {/* Desktop (lg+) : maisons | « Nous soutenir » | nav 2×2 | panier. */}
        <div className={DESKTOP_GRID}>
          {NAV_HOUSES.map((house, i) => (
            <Link
              key={house.href}
              href={house.href}
              className={`col-start-1 ${HOUSE_ROW[i]} ${maisonCellClass(compact)}`}
            >
              {house.label}
            </Link>
          ))}

          {/* Cellule centrale (vide dans la maquette) : CTA « Nous soutenir ». */}
          <SoutenirCell compact={compact} placement="col-start-2 row-span-2 row-start-1" />

          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active[section.id] ? "page" : undefined}
              className={`${SECTION_PLACEMENT[section.id]} ${navCellClass(section.id, active[section.id], compact)}`}
            >
              {section.label}
            </Link>
          ))}

          <CartNavCell compact={compact} placement="col-start-5 row-span-2 row-start-1" />
        </div>
      </nav>
    </header>
  );
}

function SiteHeaderInner() {
  const active = useActiveSections();
  const compact = useCompactOnScroll();
  return <SiteHeaderChrome active={active} compact={compact} />;
}

/** Fallback Suspense : pathname seul, sans `useSearchParams` (pas de query). */
function SiteHeaderFallback() {
  const pathname = usePathname() ?? "/";
  const active = activeSections(pathname, null);
  const compact = useCompactOnScroll();
  return <SiteHeaderChrome active={active} compact={compact} />;
}

/**
 * `useSearchParams` (Geme / À paraître) est confiné derrière `<Suspense>` :
 * sans ça, le layout racine basculerait tout le site en rendu dynamique
 * (piège documenté).
 */
export function SiteHeader() {
  return (
    <Suspense fallback={<SiteHeaderFallback />}>
      <SiteHeaderInner />
    </Suspense>
  );
}

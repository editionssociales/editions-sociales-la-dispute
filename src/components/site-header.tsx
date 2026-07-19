"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  NAV_HOME,
  NAV_HOUSES,
  NAV_SECTIONS,
  activeSections,
  type NavSearch,
  type NavSectionId,
} from "@/lib/nav";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import { NAV_ACCENT_BG } from "./nav-accent";
import { CartNavCell } from "./cart/cart-badge";

/**
 * Navbar brutaliste — quadrillage noir 2px (conteneur `grid gap-[2px]
 * bg-ink p-[2px]`, cellules blanches/pop).
 *
 * Sous `lg` : COMPACTE PAR DÉFAUT, en permanence — l'arbitrage retenu contre
 * le menu burger (le quadrillage permanent EST l'identité de marque ; on
 * réduit sa taille, on ne le cache jamais). Les tailles « déployées »
 * (grande navbar du haut de page) sont réservées à `lg:` : sous `lg`, chaque
 * cellule porte une taille fixe, indépendante du scroll.
 *
 * À `lg` et au-delà : la navbar reste collante (sticky) et GRANDE en haut de
 * page, elle se COMPACTE en douceur dès qu'on défile (état `compact`, géré
 * par `useCompactOnScroll`, ~200ms) — comportement scroll inchangé, mais
 * cantonné au desktop.
 *
 * Desktop (lg+) : 4 colonnes × 2 rangées — maisons | « Nous soutenir » |
 * nav 2×2. Dans le bloc maisons, « Les Éditions sociales » (plus long) fixe
 * la largeur ; la rangée du dessus aligne « La Dispute » puis deux carrés
 * icône (Accueil, Panier) dans l'espace restant. Mobile : 2 rangées —
 * [LD | Accueil icône | ES | « Nous soutenir » | panier icône] puis
 * [Catalogue | Agenda]. La Geme et À paraître n'ont pas de cellule téléphone
 * (elles restent accessibles par la mosaïque de libellés de /catalogue et la
 * mosaïque pop du pied de page) — le quadrillage tient au premier paint sans
 * pousser le contenu hors écran.
 *
 * Les carrés Accueil / Panier (desktop dans le bloc maisons ; mobile en
 * rangée haute) sont permanents. `useSearchParams` (états Geme / À paraître)
 * est confiné derrière `<Suspense>` — sans ça, le layout racine dynamiserait
 * tout le site.
 *
 * Sections et maisons viennent du modèle de données `lib/nav` (label, href,
 * matcher d'activité) ; ce composant n'ajoute que l'apparence. Les cellules
 * (maisons, accueil, sections, panier, CTA) sont des `<li>` d'un `<ul>` —
 * parité avec le footer pour une annonce cohérente en lecteur d'écran ;
 * `display: contents` les rend transparentes à la grille CSS (aucun
 * changement visuel), sauf le groupe maisons desktop qui reste un vrai
 * item de grille (sous-grille Dispute + carrés / ES).
 */

const NAV_HOVER_CLASS: Record<NavSectionId, string> = {
  catalogue: "bg-paper hover:bg-pop-pink",
  geme: "bg-paper hover:bg-pop-teal",
  "a-paraitre": "bg-paper hover:bg-pop-orange",
  agenda: "bg-paper hover:bg-pop-yellow",
};

/**
 * Monogrammes maisons de la rangée mobile — carrés sur l'accent de la maison
 * (R3 : navy = Éditions sociales, brick = La Dispute), inversion accent↔paper
 * au survol. Clefs = hrefs de `NAV_HOUSES` (source unique), classes littérales
 * (contrat JIT) ; le nom complet reste porté par l'`aria-label`.
 */
const MAISON_MONOGRAM: Record<string, { sigle: string; cellClass: string }> = {
  "/editions/la-dispute": {
    sigle: "LD",
    cellClass: "bg-brick text-paper hover:bg-paper hover:text-brick",
  },
  "/editions/editions-sociales": {
    sigle: "ES",
    cellClass: "bg-navy text-paper hover:bg-paper hover:text-navy",
  },
};

/** Sections gardées dans le quadrillage téléphone (cf. docstring du fichier). */
const MOBILE_SECTION_IDS: NavSectionId[] = ["catalogue", "agenda"];

/** Placement en grille desktop (littéral : le JIT ne compile pas `col-start-${n}`). */
const SECTION_PLACEMENT: Record<NavSectionId, string> = {
  catalogue: "col-start-3 row-start-1",
  geme: "col-start-4 row-start-1",
  "a-paraitre": "col-start-3 row-start-2",
  agenda: "col-start-4 row-start-2",
};

/**
 * Grille desktop, littérale (jamais de gabarit assemblé par concaténation,
 * même contrat que `maisonCellClass` ci-dessous) — 4 colonnes ; Accueil et
 * Panier sont des carrés dans le bloc maisons (col 1), pas des colonnes
 * dédiées.
 */
const DESKTOP_GRID =
  "hidden grid-cols-[1.6fr_1fr_0.9fr_0.9fr] grid-rows-2 gap-[2px] p-[2px] lg:grid";

/** Carré icône calé sur la hauteur de la rangée « La Dispute ». */
const ICON_SQUARE =
  "aspect-square h-full min-h-11 w-auto shrink-0 self-stretch";

// transition-all : la couleur (survol/actif) ET la taille (padding/police, au
// compactage) s'animent sur la même durée.
const CELL_TRANSITION =
  "transition-all duration-200 ease-out motion-reduce:transition-none";

// Fondu/échelle des deux calques du CTA « Nous soutenir » (cf. SoutenirCell) :
// on anime opacité + transform (compositables, continus) et JAMAIS la police
// d'un même libellé — dont le reflow 2 lignes ↔ 1 ligne « sauterait ».
const MORPH_TRANSITION =
  "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

/**
 * Taille FIXE sous `lg` (compact par défaut, indépendante du scroll) ; à `lg`
 * et au-delà, le scroll retrouve l'écart compact/déployé — plafond déployé
 * rééquilibré à ~30px (au lieu de 23px) et graisse `font-black` (au lieu de
 * `font-bold`) pour porter l'identité maison au même niveau que le CTA
 * « Nous soutenir » (chantier 3 §4 — c'était l'inverse : CTA à 42px, maisons
 * à 23px, dans le composant le plus vu du site).
 */
function maisonCellClass(compact: boolean) {
  const lg = compact ? "lg:py-3 lg:text-[14px]" : "lg:py-7 lg:text-[clamp(22px,2vw,30px)]";
  return `flex min-h-11 items-center bg-paper px-6 py-4 font-sans text-[16px] font-black italic uppercase leading-none tracking-[.01em] text-ink hover:bg-ink hover:text-paper ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${lg}`;
}

function navCellClass(section: NavSectionId, active: boolean, compact: boolean) {
  // Fond au repos toujours clair (bg-paper) ou pop (R2) : anneau clair dans
  // les deux cas (R5). Taille fixe sous `lg` (compact par défaut) ; à `lg`
  // la hauteur suit la rangée (py-0), seule la taille de texte varie au scroll.
  const lg = compact ? "lg:min-h-0 lg:py-0 lg:text-[12px]" : "lg:min-h-0 lg:py-0 lg:text-[14px]";
  return `flex min-h-11 items-center justify-center px-4 py-4 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.08em] text-black ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${lg} ${
    active ? NAV_ACCENT_BG[section] : NAV_HOVER_CLASS[section]
  }`;
}

function soutenirClass(placement: string) {
  // Conteneur du CTA « Nous soutenir » : styles COMMUNS aux deux états (fond,
  // survol, focus, graisse). Ni la taille ni le nombre de lignes ne sont animés
  // ici — deux calques empilés s'en chargent (cf. SoutenirCell). `grid` sert de
  // pile : les deux calques occupent la MÊME cellule ([grid-area:1/1]). `relative`
  // ancre la flèche déployée (hors des calques, pour garder sa position d'origine).
  // `min-h-11` : cible tactile garantie sous `lg`, où le calque compact seul
  // porte la hauteur de la cellule (chantier 3 §3). Fond ink au repos :
  // anneau de focus sombre (pop-yellow, R2/R5).
  return `relative grid min-h-11 bg-ink px-4 text-center font-sans font-extrabold italic uppercase tracking-[.06em] text-paper hover:bg-pop-yellow hover:text-black ${CELL_TRANSITION} ${FOCUS_RING_DARK} ${placement}`;
}

/**
 * Pictogramme maison (angles droits, R8) — seul rendu de la cellule Accueil ;
 * le libellé reste porté par l'`aria-label`.
 */
function HomeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M2 11 L12 2 L22 11 V22 H14 V14 H10 V22 H2 Z" />
    </svg>
  );
}

/**
 * Carré « Accueil » (icône seule) — desktop : à la suite de « La Dispute » ;
 * mobile : entre les monogrammes LD/ES. Hover ink↔paper (identité de marque,
 * pas une section pop R2) ; actif = ink plein + `aria-current`. `placement`
 * fixe la taille (carré sur la rangée, ou taille fixe mobile).
 */
function HomeNavCell({ placement, active }: { placement: string; active: boolean }) {
  const tone = active
    ? "bg-ink text-paper hover:bg-paper hover:text-ink"
    : "bg-paper text-ink hover:bg-ink hover:text-paper";
  return (
    <Link
      href={NAV_HOME.href}
      aria-label={NAV_HOME.label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-center ${tone} ${CELL_TRANSITION} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${placement}`}
    >
      <HomeGlyph />
    </Link>
  );
}

/** Monogramme maison (rangée mobile) — sigle + accent R3. */
function MaisonMonogramLink({ href, label }: { href: string; label: string }) {
  const m = MAISON_MONOGRAM[href];
  return (
    <Link
      href={href}
      aria-label={label}
      className={`flex min-h-11 w-14 items-center justify-center font-sans text-[15px] font-black italic uppercase leading-none ${m?.cellClass ?? "bg-paper text-ink hover:bg-ink hover:text-paper"} ${CELL_TRANSITION} ${FOCUS_RING_DARK}`}
    >
      <span aria-hidden="true">{m?.sigle ?? label.slice(0, 2)}</span>
    </Link>
  );
}

/**
 * Cellule CTA « Nous soutenir ». Deux calques SUPERPOSÉS dans la même cellule de
 * grille ([grid-area:1/1]), chacun figé dans sa mise en page — on ne redimensionne
 * jamais un libellé unique (dont le passage 2 lignes → 1 ligne « sauterait ») :
 *
 *  • calque DÉPLOYÉ  — grand corps, libellé sur ~2 lignes, flèche au coin bas-droit ;
 *    RÉSERVÉ à `lg:` (`hidden lg:flex`/`hidden lg:block`) — sous `lg`, la navbar
 *    est compacte par défaut (chantier 3 §3), ce calque ne s'affiche donc jamais
 *    en dessous de ce point de rupture, quel que soit le scroll.
 *  • calque COMPACT  — corps réduit, libellé sur 1 ligne aligné à une grande flèche.
 *    Base TOUJOURS visible (mobile compact par défaut) ; ne cross-fade qu'à `lg:`.
 *
 * À `lg` et au-delà, on croise leur opacité + une légère échelle (grossit en se
 * déployant, rétrécit en se compactant) : morphing fluide et continu, sans
 * reflow. Plafond du calque déployé aligné à ~30px (chantier 3 §4, au lieu de
 * 42px) — les maisons (`maisonCellClass`) plafonnent au même corps, en
 * `font-black` : la CTA de dons ne domine plus l'identité éditoriale. Le
 * libellé est dupliqué visuellement mais chaque calque est `aria-hidden` ; le
 * nom accessible unique et stable vient de l'`aria-label` du lien. `placement`
 * place la cellule.
 */
function SoutenirCell({ compact, placement }: { compact: boolean; placement: string }) {
  return (
    <Link
      href="/souscription"
      aria-label="Nous soutenir"
      className={soutenirClass(placement)}
    >
      {/* Calque DÉPLOYÉ : grand libellé (~2 lignes), réservé à lg:. */}
      <span
        aria-hidden="true"
        className={`hidden [grid-area:1/1] items-center justify-center lg:flex ${MORPH_TRANSITION} ${
          compact ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <span className="leading-[0.95] text-[clamp(22px,7vw,30px)]">Nous soutenir</span>
      </span>

      {/* Calque COMPACT : libellé 1 ligne + flèche alignés. Visible en permanence
          sous lg (compact par défaut) ; ne cross-fade qu'à partir de lg:. */}
      <span
        aria-hidden="true"
        className={`flex scale-100 items-center justify-center gap-3 opacity-100 [grid-area:1/1] ${MORPH_TRANSITION} ${
          compact ? "lg:scale-100 lg:opacity-100" : "lg:scale-110 lg:opacity-0"
        }`}
      >
        {/* Plancher fluide sous ~445px : la cellule mobile partage désormais sa
            rangée avec les monogrammes et le panier — le libellé doit tenir
            dans ~140px à 320px de large. À lg, plafonds inchangés. */}
        <span className="whitespace-nowrap leading-none text-[clamp(15px,4.5vw,28px)]">
          Nous soutenir
        </span>
        <span className="flex-none leading-none text-[clamp(17px,5vw,30px)]">→</span>
      </span>

      {/* Flèche du calque déployé : ancrée au coin bas-droit de la cellule, contre le
          lien (hors des calques transformés, pour garder sa position d'origine) ;
          réservée à lg: comme le calque déployé qu'elle accompagne. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-2 right-4 hidden leading-none text-[clamp(32px,3vw,44px)] lg:block ${MORPH_TRANSITION} ${
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
  homeActive,
}: {
  active: Record<NavSectionId, boolean>;
  compact: boolean;
  homeActive: boolean;
}) {
  return (
    <header className="sticky top-0 z-50">
      <nav aria-label="Navigation principale" className="bg-ink">
        {/* Mobile (< lg) : 2 rangées — chaque cellule est un <li>
            (`display: contents`, parité lecteur d'écran) ; les tailles restent
            fixes sous lg (compact par défaut, chantier 3 §3), cibles ≥ 44px (R7). */}
        <div className="flex flex-col gap-[2px] p-[2px] lg:hidden">
          <ul className="flex items-stretch gap-[2px]">
            {/* LD | Accueil | ES | Soutenir | Panier */}
            <li className="contents">
              <MaisonMonogramLink href={NAV_HOUSES[0].href} label={NAV_HOUSES[0].label} />
            </li>
            <li className="contents">
              <HomeNavCell
                active={homeActive}
                placement="h-11 w-11 shrink-0 self-stretch"
              />
            </li>
            <li className="contents">
              <MaisonMonogramLink href={NAV_HOUSES[1].href} label={NAV_HOUSES[1].label} />
            </li>
            <li className="contents">
              <SoutenirCell compact={compact} placement="min-w-0 flex-1 py-3" />
            </li>
            <li className="contents">
              <CartNavCell compact={compact} icon placement="w-14" />
            </li>
          </ul>
          <ul className="grid grid-cols-2 gap-[2px]">
            {NAV_SECTIONS.filter((section) => MOBILE_SECTION_IDS.includes(section.id)).map(
              (section) => (
                <li key={section.id} className="contents">
                  <Link
                    href={section.href}
                    aria-current={active[section.id] ? "page" : undefined}
                    className={navCellClass(section.id, active[section.id], compact)}
                  >
                    {section.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>

        {/* Desktop (lg+) : maisons (Dispute + carrés Accueil/Panier / ES) |
            « Nous soutenir » | nav 2×2. */}
        <ul className={DESKTOP_GRID}>
          {/* Groupe maisons : vrai item de grille (pas `contents`) — sous-grille
              3×2 : Dispute | Accueil | Panier sur la 1ʳᵉ rangée, ES en pleine
              largeur en dessous (« Les Éditions sociales » dicte la largeur). */}
          <li className="col-start-1 row-span-2 row-start-1 grid grid-cols-[1fr_auto_auto] grid-rows-2 gap-[2px]">
            <Link href={NAV_HOUSES[0].href} className={maisonCellClass(compact)}>
              {NAV_HOUSES[0].label}
            </Link>
            <HomeNavCell active={homeActive} placement={ICON_SQUARE} />
            <CartNavCell compact={compact} icon placement={ICON_SQUARE} />
            <Link
              href={NAV_HOUSES[1].href}
              className={`col-span-3 ${maisonCellClass(compact)}`}
            >
              {NAV_HOUSES[1].label}
            </Link>
          </li>

          {/* Cellule centrale (vide dans la maquette) : CTA « Nous soutenir ». */}
          <li className="contents">
            <SoutenirCell compact={compact} placement="col-start-2 row-span-2 row-start-1" />
          </li>

          {NAV_SECTIONS.map((section) => (
            <li key={section.id} className="contents">
              <Link
                href={section.href}
                aria-current={active[section.id] ? "page" : undefined}
                className={`${SECTION_PLACEMENT[section.id]} ${navCellClass(section.id, active[section.id], compact)}`}
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function SiteHeaderInner() {
  const pathname = usePathname() ?? "/";
  const active = useActiveSections();
  const compact = useCompactOnScroll();
  return (
    <SiteHeaderChrome
      active={active}
      compact={compact}
      homeActive={pathname === NAV_HOME.href}
    />
  );
}

/**
 * Lecture SYNCHRONE de `window.location.search` à l'initialisation (jamais en
 * effet) — `URLSearchParams` est un `NavSearch` valide (méthode `get`).
 * Élimine le flash de couleur active (rose → teal) que produisait
 * `search=null` en fallback avant l'hydratation de `useSearchParams`, sur un
 * lien profond (ex. `/catalogue/editions-sociales?libelle=geme`) : sans
 * cette lecture précoce, la cellule « Catalogue » s'allumait d'abord avant
 * de basculer sur « La Geme » une fois `SiteHeaderInner` monté.
 */
function useInitialSearch(): NavSearch | null {
  const [search] = useState<NavSearch | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search),
  );
  return search;
}

/** Fallback Suspense : pathname + lecture synchrone de la query (pas de re-render au montage). */
function SiteHeaderFallback() {
  const pathname = usePathname() ?? "/";
  const search = useInitialSearch();
  const active = activeSections(pathname, search);
  const compact = useCompactOnScroll();
  return (
    <SiteHeaderChrome
      active={active}
      compact={compact}
      homeActive={pathname === NAV_HOME.href}
    />
  );
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

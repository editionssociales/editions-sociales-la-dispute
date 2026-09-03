"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  NAV_HOME,
  NAV_HOUSES,
  NAV_SECTIONS,
  activeSections,
  maisonMonogramName,
  type NavSearch,
  type NavSectionId,
} from "@/lib/nav";
import {
  FOCUS_RING_DARK,
  FOCUS_RING_HOVER_DARK,
  FOCUS_RING_HOVER_LIGHT,
  FOCUS_RING_LIGHT,
} from "@/lib/ui";
import { NAV_ACCENT_BG } from "./nav-accent";
import { RAIL_INSET_TRANSITION_CLASS, RAIL_WIDTH_CLASS } from "./rail-inset";
import { CartCountBadge, CartNavCell } from "./cart/cart-badge";
import { useCart } from "./cart/cart-context";
import { cartFlyTarget } from "./cart/fly-to-cart";

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
 * Exception /souscription (`railInset`, maquette 25/07) : le rail des
 * contreparties monte jusqu'en haut de page — la navbar se RESSERRE À
 * GAUCHE (marge droite = largeur du rail, `RAIL_WIDTH_CLASS`, à garder en
 * phase avec `RAIL_GRID_CLASS` de la page) et reste en format compact quel
 * que soit le scroll. La marge vit sur le <header> (pas sur le <nav>) :
 * sinon sa boîte sticky z-50 continuerait de couvrir le haut du rail et
 * intercepterait les clics.
 *
 * Depuis le 2026-08-19 ce rail est un TIROIR (`souscription/_components/
 * tiers-drawer.tsx`) : la marge n'est plus 380px mais `380px × --rail-open`.
 * Elle porte donc la MÊME transition que la grille de la page
 * (`RAIL_INSET_TRANSITION_CLASS`, 540 ms easeInOutCubic) — les deux
 * consommateurs de cette largeur bougent ensemble, sinon la navbar sauterait
 * d'un bloc pendant que la colonne glisse.
 *
 * `RAIL_WIDTH_CLASS` et `RAIL_GRID_CLASS` viennent de
 * `@/components/rail-inset` (source unique 380px, cf. ce fichier) — une
 * seule ligne à changer le jour où la valeur bouge. (Le liseré de collecte
 * fixé au viewport, et la réserve de 10px que le header lui gardait ici, ont
 * été retirés le 2026-08-20 sur retour client.)
 *
 * Desktop (lg+) : 4 colonnes × 2 rangées — maisons | « Nous soutenir » |
 * nav 2×2. Dans le bloc maisons, « Les Éditions sociales » (plus long) fixe
 * la largeur ; la rangée du dessus aligne « La Dispute » puis deux carrés
 * icône (Accueil, Panier) dans l'espace restant.
 *
 * Mobile : UNE seule rangée visible par défaut —
 * [LD | Accueil icône | ES | « Nous soutenir » | bascule chevron]. La deuxième
 * rangée n'existe plus en permanence : les 4 sections du desktop vivent
 * derrière la bascule, en menu déroulant 2×2. Déroulé, la case de droite de la
 * rangée haute redevient le carré panier et la bascule se réinstalle en barre
 * pleine largeur SOUS les sections, chevron retourné, pour refermer. Le
 * compteur d'articles suit toujours cette case de droite : il s'affiche donc
 * sur le chevron quand le menu est fermé (`CartCountBadge`, exigence client).
 *
 * Le carré Accueil (desktop dans le bloc maisons ; mobile en rangée haute) est
 * permanent. `useSearchParams` (états Geme / À paraître)
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
 * (R3 : navy = Éditions sociales, pop-orange = La Dispute depuis le retour
 * client 2026-08-20 — ex-brick, cf. `lib/editions.ts`). Clefs = labels de
 * `NAV_HOUSES` (clef stable, indépendante des hrefs — désormais les pages
 * maisons `/editions/[slug]`), classes littérales (contrat JIT) ; le nom
 * accessible est `maisonMonogramName(sigle, label)` (WCAG 2.5.3 : le sigle
 * visible figure dans le nom).
 *
 * Les DEUX accents n'ont plus la même nature — d'où l'anneau PORTÉ PAR
 * L'ENTRÉE, plus par une règle commune : navy est SOMBRE (texte paper,
 * inversion vers paper, anneau sombre + surcharge claire) ; l'orange est
 * CLAIR — texte ink (5,84:1 ; paper serait à 2,95:1, sous AA), inversion vers
 * l'INK au survol (jamais vers paper : l'orange en texte à ce corps y est
 * sous AA, cf. `pop-palette.ts` — même recette qu'`ALARM` de `button.tsx`),
 * anneau clair + surcharge sombre (R5).
 */
const MAISON_MONOGRAM: Record<string, { sigle: string; cellClass: string; ring: string }> = {
  "La Dispute": {
    sigle: "LD",
    cellClass: "bg-pop-orange text-ink hover:bg-ink hover:text-pop-orange",
    ring: `${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`,
  },
  "Les Éditions sociales": {
    sigle: "ES",
    cellClass: "bg-navy text-paper hover:bg-paper hover:text-navy",
    ring: `${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT}`,
  },
};

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
// compactage) s'animent sur la même durée. `active:brightness-90` : la recette
// de pression de `BASE` (`button.tsx`), étendue aux cellules du header — tous
// les usages de cette constante sont interactifs (liens/bascule), aucun
// n'est `disabled` ; la cellule panier (`cart-badge.tsx`) porte la même.
const CELL_TRANSITION =
  "transition-all duration-200 ease-out motion-reduce:transition-none active:brightness-90";

// Fondu/échelle des deux calques du CTA « Nous soutenir » (cf. SoutenirCell) :
// on anime opacité + transform (compositables, continus) et JAMAIS la police
// d'un même libellé — dont le reflow 2 lignes ↔ 1 ligne « sauterait ».
const MORPH_TRANSITION =
  "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

// Croisement des deux calques de la case de droite mobile (panier ↔ bascule du
// menu) : opacité seule. Le calque sortant est retiré du parcours clavier par
// `inert`, JAMAIS par `visibility` — une visibilité en transition n'est pas
// encore rendue focalisable au moment où l'effet suit le focus, et le focus se
// perdait (constat live).
//
// EXCEPTION `prefers-reduced-motion` (arbitrage client 2026-07-26, cf. aussi le
// panneau déroulant ci-dessous et `bottom-sheet.tsx`) : pas de
// `motion-reduce:transition-none` ici. Ces mouvements ne sont pas décoratifs —
// ils DISENT où va le menu et d'où revient le panier ; coupés, la substitution
// redevient le saut sec qu'on venait de corriger. iOS active « Réduire les
// animations » sur tous ses navigateurs à la fois : l'exception se voyait sur
// chaque iPhone concerné. Le reste du site respecte le réglage.
const LAYER_MORPH = "transition-opacity duration-200 ease-out";

/**
 * Taille FIXE sous `lg` (compact par défaut, indépendante du scroll) ; à `lg`
 * et au-delà, le scroll retrouve l'écart compact/déployé — plafond déployé
 * rééquilibré à ~30px (au lieu de 23px) et graisse `font-black` (au lieu de
 * `font-bold`) pour porter l'identité maison au même niveau que le CTA
 * « Nous soutenir » (chantier 3 §4 — c'était l'inverse : CTA à 42px, maisons
 * à 23px, dans le composant le plus vu du site).
 */
function maisonCellClass(compact: boolean) {
  // Échelle rem (#88, R7 zoom-texte) : 14/16/22/30px → 0.875/1/1.375/1.875rem.
  const lg = compact ? "lg:py-3 lg:text-[0.875rem]" : "lg:py-7 lg:text-[clamp(1.375rem,2vw,1.875rem)]";
  // Fond paper au repos, ink au survol : anneau clair + sa surcharge de survol
  // (R5) — l'ink seul serait invisible sur l'ink du survol (1:1).
  return `flex min-h-11 items-center bg-paper px-6 py-4 font-sans text-[1rem] font-black italic uppercase leading-none tracking-[.01em] text-ink hover:bg-ink hover:text-paper ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK} ${lg}`;
}

function navCellClass(section: NavSectionId, active: boolean, compact: boolean) {
  // Fond toujours clair (bg-paper) ou pop (R2), au repos COMME au survol :
  // l'anneau clair tient les deux états sans surcharge (R5) — ink 17,19:1 sur
  // paper, 15,16:1 sur le jaune, 12,44:1 sur le rose, 10,26:1 sur le bleu,
  // 5,84:1 sur l'orange ; la cellule active ne change pas de fond du tout.
  // Taille fixe sous `lg` (compact par défaut) ; à `lg`
  // la hauteur suit la rangée (py-0), seule la taille de texte varie au scroll.
  // Échelle rem (#88, R7 zoom-texte) : 12/14/13px → 0.75/0.875/0.8125rem.
  const lg = compact ? "lg:min-h-0 lg:py-0 lg:text-[0.75rem]" : "lg:min-h-0 lg:py-0 lg:text-[0.875rem]";
  return `flex min-h-11 items-center justify-center px-4 py-4 text-center font-sans text-[0.8125rem] font-extrabold uppercase tracking-[.08em] text-black ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${lg} ${
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
  // porte la hauteur de la cellule (chantier 3 §3). Fond ink au repos, jaune au
  // survol : anneau sombre (pop-yellow, 15,16:1 sur l'ink) + sa surcharge de
  // survol (R5) — sans elle, le jaune se posait sur le jaune (1:1).
  return `relative grid min-h-11 bg-ink px-4 text-center font-sans font-extrabold italic uppercase tracking-[.06em] text-paper hover:bg-pop-yellow hover:text-black ${CELL_TRANSITION} ${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT} ${placement}`;
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
 *
 * La cellule s'INVERSE au survol dans les deux états (paper → ink inactive,
 * ink → paper active) : l'anneau de base suit le fond de REPOS, la surcharge
 * `*_HOVER_*` suit celui du survol (R5). Un anneau seul serait faux dans un
 * état sur deux — ink sur ink (1:1) inactive, pop-yellow sur paper (1,13:1)
 * active.
 */
function HomeNavCell({ placement, active }: { placement: string; active: boolean }) {
  const tone = active
    ? "bg-ink text-paper hover:bg-paper hover:text-ink"
    : "bg-paper text-ink hover:bg-ink hover:text-paper";
  const ring = active
    ? `${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT}`
    : `${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`;
  return (
    <Link
      href={NAV_HOME.href}
      aria-label={NAV_HOME.label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-center ${tone} ${CELL_TRANSITION} ${ring} ${placement}`}
    >
      <HomeGlyph />
    </Link>
  );
}

/** Chevron du menu déroulant mobile (angles droits, R8) — pointe vers le bas
 *  au repos, retourné (`rotate-180`) quand le menu est déroulé. */
function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 8 L12 17 L20 8" />
    </svg>
  );
}

/**
 * Bascule du menu déroulant mobile — MÊME recette visuelle que la cellule
 * panier (`CartNavCell` en mode `icon`) : les deux occupent tour à tour la case
 * de droite de la rangée haute (fermé = cette bascule, déroulé = le panier).
 *
 *  • `open=false` : carré de droite de la rangée haute, chevron vers le bas ;
 *    il porte le compteur du panier (le panier n'a alors pas de case à lui —
 *    le compteur doit rester visible, exigence client).
 *  • `open=true` : barre pleine largeur SOUS les sections, chevron retourné,
 *    referme le menu. Pas de compteur : le panier a repris sa case.
 */
function MobileMenuToggle({
  open,
  onToggle,
  panelId,
  ref,
}: {
  open: boolean;
  onToggle: () => void;
  panelId: string;
  /** Suivi du focus quand la bascule change de place (cf. `SiteHeaderChrome`). */
  ref?: RefObject<HTMLButtonElement | null>;
}) {
  // Le compte d'articles (`CartCountBadge`) n'est rendu que fermé (le panier a
  // sa propre case une fois le menu déroulé) — mais un `aria-label` remplace
  // TOUT le contenu descendant dans le calcul du nom accessible : sans le
  // porter ici aussi, le compte n'existe pour aucune technologie d'assistance
  // (#82). Même formulation que `CartNavCell` (`cart/cart-badge.tsx`).
  const { count } = useCart();
  const label =
    open || count === 0
      ? open
        ? "Fermer le menu"
        : "Ouvrir le menu"
      : `Ouvrir le menu — Panier, ${count} article${count > 1 ? "s" : ""}`;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={label}
      // Cible de REPLI du vol « ajout au panier » (`fly-to-cart.tsx`) : menu
      // fermé, la case panier est masquée (calque `inert`) et c'est cette
      // bascule qui porte le compteur — le vol atterrit donc ici.
      {...cartFlyTarget("menu")}
      // La largeur vient de l'emplacement : carré `w-14` de la rangée haute
      // (porté par la pile de calques) ou barre pleine largeur du menu.
      // Paper au repos, pop-yellow au survol : deux fonds CLAIRS, l'anneau
      // clair tient les deux (17,19:1 puis 15,16:1) — aucune surcharge (R5).
      className={`relative flex h-full min-h-11 w-full items-center justify-center bg-paper text-ink hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT}`}
    >
      <span className={open ? "rotate-180" : undefined}>
        <ChevronGlyph />
      </span>
      {!open && <CartCountBadge />}
    </button>
  );
}

/**
 * Monogramme maison (rangée mobile) — sigle + accent R3. L'anneau vient de
 * L'ENTRÉE (`MAISON_MONOGRAM.ring`) : les deux maisons n'ont plus la même
 * nature d'accent (navy sombre, orange clair — cf. le commentaire du record).
 * Le repli sans accent (maison inconnue) part d'un fond clair : anneau clair
 * + surcharge sombre, comme sa recette d'inversion.
 */
function MaisonMonogramLink({ href, label }: { href: string; label: string }) {
  const m = MAISON_MONOGRAM[label];
  const sigle = m?.sigle ?? label.slice(0, 2);
  const ring = m?.ring ?? `${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`;
  return (
    <Link
      href={href}
      aria-label={maisonMonogramName(sigle, label)}
      className={`flex min-h-11 w-14 items-center justify-center font-sans text-[15px] font-black italic uppercase leading-none ${m?.cellClass ?? "bg-paper text-ink hover:bg-ink hover:text-paper"} ${CELL_TRANSITION} ${ring}`}
    >
      <span aria-hidden="true">{sigle}</span>
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
        {/* Flèche masquée sous ~430px : à 375px, libellé + flèche (~172px)
            débordaient de la cellule (~151px) et la flèche passait sous la
            cellule panier (mesuré en live) ; le libellé seul tient à 320px. */}
        <span className="flex-none leading-none text-[clamp(17px,5vw,30px)] max-[429px]:hidden">→</span>
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
  railInset,
}: {
  active: Record<NavSectionId, boolean>;
  compact: boolean;
  homeActive: boolean;
  railInset: boolean;
}) {
  // Menu déroulant mobile : fermé par défaut à chaque page (la rangée des
  // sections n'existe plus en permanence sous `lg`), refermé après navigation.
  // Refermeture après navigation par AJUSTEMENT EN RENDU (pattern React
  // « adjusting state when a prop changes ») et non par effet : un
  // `setState` dans un `useEffect` provoquerait un rendu en cascade (et
  // l'ouverture resterait peinte une frame après le clic).
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  // La bascule CHANGE de place d'un état à l'autre (case de droite ↔ barre du
  // bas) : au clavier, le bouton qu'on vient d'actionner devient invisible et
  // le focus tomberait sur le <body>. On le suit jusqu'à sa nouvelle position
  // — après le commit (l'élément visé est encore masqué pendant le rendu).
  // Id du panneau via `useId` et non une constante : le rendu en flux laisse
  // dans le document une COPIE cachée du header (le div `hidden` de la
  // frontière Suspense) — un id littéral y serait dupliqué, et `aria-controls`
  // résoudrait vers la copie morte.
  const panelId = useId();
  const topToggle = useRef<HTMLButtonElement>(null);
  const bottomToggle = useRef<HTMLButtonElement>(null);
  const followFocus = useRef(false);
  const toggleMenu = () => {
    followFocus.current = true;
    setMenuOpen((previous) => !previous);
  };
  useEffect(() => {
    if (!followFocus.current) return;
    followFocus.current = false;
    (menuOpen ? bottomToggle : topToggle).current?.focus();
  }, [menuOpen]);

  // Échap referme le menu (APG Disclosure) — écouté sur `document` tant
  // qu'il est ouvert : le focus est alors dans le panneau. Même exclusion
  // des champs de saisie que le tiroir des contreparties.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select")) return;
      event.preventDefault();
      followFocus.current = true;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={
        railInset
          ? `sticky top-0 z-50 ${RAIL_WIDTH_CLASS} ${RAIL_INSET_TRANSITION_CLASS}`
          : "sticky top-0 z-50"
      }
    >
      <nav aria-label="Navigation principale" className="bg-ink">
        {/* Mobile (< lg) : 2 rangées — chaque cellule est un <li>
            (`display: contents`, parité lecteur d'écran) ; les tailles restent
            fixes sous lg (compact par défaut, chantier 3 §3), cibles ≥ 44px (R7). */}
        {/* Pas de `gap` ici : l'écart de 2px vit DANS le panneau déroulant
            (`pt-[2px]`), sinon il resterait peint sous la rangée haute une fois
            le menu replié. */}
        <div className="flex flex-col p-[2px] lg:hidden">
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
            {/* Case de droite : panier quand le menu est déroulé, bascule du
                menu (chevron + compteur panier) quand il est fermé. Les DEUX
                calques sont montés en permanence dans la même case
                ([grid-area:1/1], même pile que `SoutenirCell`) et se croisent
                en opacité — un montage/démontage rendrait la substitution
                brutale. `inert` sur le calque sortant : il quitte le parcours
                clavier et les clics sans quitter le rendu (il doit finir son
                fondu). Vrai item de grille (pas `contents`) : c'est la pile qui
                porte la case. */}
            <li className="relative grid w-14 shrink-0 self-stretch">
              <span
                inert={!menuOpen}
                className={`[grid-area:1/1] ${LAYER_MORPH} ${
                  menuOpen ? "opacity-100" : "opacity-0"
                }`}
              >
                <CartNavCell placement="h-full w-full" />
              </span>
              <span
                inert={menuOpen}
                className={`[grid-area:1/1] ${LAYER_MORPH} ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              >
                <MobileMenuToggle
                  ref={topToggle}
                  open={false}
                  onToggle={toggleMenu}
                  panelId={panelId}
                />
              </span>
            </li>
          </ul>
          {/* Panneau des sections — TOUJOURS monté, pour pouvoir se dérouler
              ET se replier visuellement : la grille interpole `0fr → 1fr`
              (seule façon d'animer une hauteur `auto` sans la mesurer en JS),
              l'enfant clippe le débordement pendant la course. `inert` replié :
              ni focusable, ni lu par un lecteur d'écran. Pas de
              `motion-reduce:transition-none` — exception assumée, cf.
              `LAYER_MORPH`. L'opacité accompagne la hauteur : si un moteur
              n'interpole pas `grid-template-rows` (WebKit ancien), le panneau
              se fond au lieu d'apparaître d'un bloc. */}
          <div
            id={panelId}
            inert={!menuOpen}
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
              menuOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            {/* L'item de grille ne porte QUE le clipping (`min-h-0` : sans
                lui, sa taille minimale automatique empêcherait la rangée de
                descendre à 0). L'écart de 2px vit un cran plus bas, sinon ce
                padding survivrait au repli — la rangée tombe à 0, pas la boîte. */}
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col gap-[2px] pt-[2px]">
                <ul className="grid grid-cols-2 gap-[2px]">
                  {NAV_SECTIONS.map((section) => (
                    <li key={section.id} className="contents">
                      <Link
                        href={section.href}
                        aria-current={active[section.id] ? "page" : undefined}
                        className={navCellClass(section.id, active[section.id], compact)}
                      >
                        {section.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {/* Bascule repliée en bas du menu, chevron retourné. */}
                <MobileMenuToggle
                  ref={bottomToggle}
                  open
                  onToggle={toggleMenu}
                  panelId={panelId}
                />
              </div>
            </div>
          </div>
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
            <CartNavCell placement={ICON_SQUARE} />
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
  const railInset = pathname === "/souscription";
  const compact = useCompactOnScroll() || railInset;
  return (
    <SiteHeaderChrome
      active={active}
      compact={compact}
      homeActive={pathname === NAV_HOME.href}
      railInset={railInset}
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
  const railInset = pathname === "/souscription";
  const compact = useCompactOnScroll() || railInset;
  return (
    <SiteHeaderChrome
      active={active}
      compact={compact}
      homeActive={pathname === NAV_HOME.href}
      railInset={railInset}
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

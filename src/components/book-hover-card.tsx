"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { BookHoverCardData } from "@/lib/book-hover-card-data";
import { FOCUS_RING_LIGHT } from "@/lib/ui";

export type { BookHoverCardData };

/**
 * Mini fiche livre au survol — module général réutilisable (premier
 * branchement : titres/options de `/souscription/contrepartie/[tierId]`),
 * NOUVELLE exception `"use client"` à la règle « serveur par défaut »
 * (`src/components/CLAUDE.md`) : la carte doit réagir au survol/focus, mesurer
 * sa propre taille pour se positionner, et écouter Échap/scroll — rien de
 * tout ça n'existe côté serveur. Tout ce qu'elle affiche (`BookHoverCardData`)
 * est en revanche préformaté côté serveur (`toBookHoverCardData`/
 * `contreparties.ts`) : le composant reste purement présentationnel, un DTO
 * sérialisable en entrée, jamais un import `server-only`/Payload ici.
 *
 * Portail vers `document.body`, en `position: fixed`, UNIQUEMENT quand
 * ouverte : la page cible enveloppe ses sections dans `Reveal` (`transform`
 * actif pendant la transition = containing block qui casserait un `fixed`
 * interne), et un ancêtre peut clipper (`overflow-hidden`) — le portail
 * échappe aux deux à la fois, même raison que `cart/fly-to-cart.tsx`.
 *
 * Pattern ARIA « tooltip riche » (WCAG 1.4.13) : `role="tooltip"` + `id`
 * (`useId`), `aria-describedby` posé sur le déclencheur SEULEMENT quand la
 * carte est ouverte. PAS de `aria-expanded` — ce n'est pas un déroulé
 * (`mosaic-disclosure.tsx`). AUCUN élément interactif dans la carte (règle
 * nested-interactive, cf. commentaire de `book-card.tsx`) : pas de lien
 * « voir la fiche ».
 *
 * Sur appareil sans survol (`matchMedia("(hover: none)")`), le module est
 * INERTE : pas de `tabIndex`, pas d'affordance visuelle, la carte ne s'ouvre
 * jamais — un tap sur un titre qui vit dans un `<label>` de radio (écran de
 * contrepartie) doit se contenter de sélectionner l'option, jamais rivaliser
 * avec un survol qui n'existe pas au doigt.
 */

/** Délai d'ouverture au survol (`mouseenter`) — assez court pour ne pas paraître mort, assez long pour ne pas flasher au simple passage de la souris. */
const OPEN_DELAY_MS = 120;
/** Délai de fermeture au départ du pointeur — laisse le temps de traverser du déclencheur à la carte (timers PARTAGÉS, cf. handlers de la carte ci-dessous) sans la refermer sous le curseur. */
const CLOSE_DELAY_MS = 100;
/** Écart vertical carte↔déclencheur. */
const GAP_PX = 8;
/** Clamp aux bords du viewport (horizontal ET bascule verticale). */
const EDGE_MARGIN_PX = 8;

/** Chips de libellés — non cliquables (aucun élément interactif dans la carte, cf. commentaire du module). */
function LibelleChips({ libelles }: { libelles: string[] }) {
  if (libelles.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {libelles.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="border border-ink px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.04em] text-ink"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

/** Contenu de la carte — extrait pour la lisibilité du composant, jamais exporté (pas un point de réutilisation en soi). */
function HoverCardBody({ data }: { data: BookHoverCardData }) {
  return (
    <>
      <div className={data.coverUrl ? "flex gap-3" : undefined}>
        {data.coverUrl && (
          <span className="relative block h-28 w-20 flex-none overflow-hidden border-2 border-ink bg-paper-2">
            {/* `alt=""` : décorative — le titre à côté porte déjà l'information (même parti pris que `ItemVisual`, page contrepartie). */}
            <Image src={data.coverUrl} alt="" fill sizes="80px" className="object-contain p-1" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {data.editionLabel && (
            <p className="font-sans text-[10px] font-bold uppercase tracking-[.05em] text-ink/60">
              {data.editionLabel}
            </p>
          )}
          <p className="font-sans font-bold leading-snug text-ink">{data.title}</p>
          {data.authors && <p className="mt-1 font-sans text-sm text-ink/80">{data.authors}</p>}
          <LibelleChips libelles={data.libelles} />
          {data.priceLabel && (
            <p className="mt-2 font-sans text-sm font-bold text-ink">{data.priceLabel}</p>
          )}
        </div>
      </div>
      {data.excerpt && (
        <p className="mt-3 font-sans text-sm leading-snug text-muted">{data.excerpt}</p>
      )}
    </>
  );
}

export function BookHoverCard({
  data,
  children,
  focusable = true,
  className,
}: {
  data: BookHoverCardData;
  children: ReactNode;
  /** `false` quand l'enfant est déjà un lien (déjà focalisable) — le wrapper ne pose alors ni `tabIndex` ni anneau de focus, seulement l'affordance dotted et les handlers. */
  focusable?: boolean;
  className?: string;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Fail-open `false` côté serveur (`useMediaQuery`) : un appareil à survol
  // est l'hypothèse par défaut tant que l'hydratation n'a pas tranché — sur
  // écran tactile, le pointillé du SSR s'efface donc à l'hydratation
  // (compromis assumé : l'inverse ferait surgir l'affordance sur TOUS les
  // écrans à souris, bien plus visibles qu'un pointillé qui s'efface au tact).
  const hoverNone = useMediaQuery("(hover: none)");

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearTimers]);

  const openNow = useCallback(() => {
    clearTimers();
    setOpen(true);
  }, [clearTimers]);

  const closeNow = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // Échap ferme — écouté seulement carte ouverte, retiré aussitôt fermée.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeNow();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeNow]);

  // Défilement ferme plutôt que repositionner — plus simple et plus sûr
  // (`capture: true` : le scroll ne bulle pas, sans la capture un listener
  // `window` ne verrait que le défilement de la PAGE, jamais celui d'un
  // conteneur interne scrollable).
  useEffect(() => {
    if (!open) return;
    function onScroll() {
      closeNow();
    }
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [open, closeNow]);

  // Position : la carte est déjà montée (gate sur `open` seul, jamais sur
  // `position`) quand cet effet tourne — son `cardRef` a donc sa taille RÉELLE
  // avant la première peinture (layout effect = après le commit DOM, avant
  // que le navigateur peigne). Sous le déclencheur par défaut, bascule
  // au-dessus si la place manque, clamp horizontal aux bords.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const triggerRect = trigger.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - GAP_PX;
    const top =
      spaceBelow >= cardRect.height
        ? triggerRect.bottom + GAP_PX
        : Math.max(EDGE_MARGIN_PX, triggerRect.top - GAP_PX - cardRect.height);
    const left = Math.min(
      Math.max(triggerRect.left, EDGE_MARGIN_PX),
      window.innerWidth - cardRect.width - EDGE_MARGIN_PX,
    );
    setPosition({ top, left });
  }, [open]);

  // Inerte sur appareil sans survol : ni tabIndex, ni affordance, ni
  // handlers d'ouverture — un tap doit se contenter de son comportement
  // natif (sélection de l'option radio sur l'écran de contrepartie).
  const showAffordance = focusable && !hoverNone;

  return (
    <span
      ref={triggerRef}
      tabIndex={showAffordance ? 0 : undefined}
      aria-describedby={open ? tooltipId : undefined}
      // `decoration-current/40` (jamais `decoration-ink/40`) : le pointillé
      // suit la couleur du texte — ink sur paper, mais paper sur une option
      // cochée (fond ink, écran de contrepartie) où un pointillé ink serait
      // invisible.
      className={`${hoverNone ? "" : "underline decoration-dotted underline-offset-2 decoration-current/40"} ${showAffordance ? FOCUS_RING_LIGHT : ""} ${className ?? ""}`}
      onMouseEnter={hoverNone ? undefined : scheduleOpen}
      onMouseLeave={hoverNone ? undefined : scheduleClose}
      onFocusCapture={hoverNone ? undefined : openNow}
      onBlurCapture={hoverNone ? undefined : closeNow}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={cardRef}
            id={tooltipId}
            role="tooltip"
            style={{ position: "fixed", top: position.top, left: position.left }}
            // `z-[80]` : au-dessus de tout le reste de l'échelle du site — header
            // sticky `z-50`, tiroir de souscription `z-60`, vol panier `z-[70]`
            // (`fly-to-cart.tsx`) — la carte flottante passe devant chacun d'eux.
            // Fondu d'entrée en CSS pur via `starting:` (`@starting-style`,
            // Tailwind v4) : la carte monte déjà à `opacity-100`, le navigateur
            // joue la transition depuis l'état `starting:` — zéro état React
            // supplémentaire (la règle `react-hooks/set-state-in-effect` interdit
            // la bascule « visible » en effet) ; sans support `@starting-style`,
            // la carte apparaît simplement sans fondu, dégradation acceptable
            // pour un tooltip.
            className="starting:translate-y-1 starting:opacity-0 z-[80] w-80 max-w-[calc(100vw-16px)] translate-y-0 border-2 border-ink bg-paper p-4 opacity-100 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
            // Timers PARTAGÉS avec le déclencheur : passer le pointeur du titre à
            // la carte annule la fermeture programmée plutôt que d'en relancer
            // une — la carte reste ouverte tant que le pointeur est sur l'un OU
            // l'autre (`pointer-events` actifs par défaut, jamais `-none`).
            onMouseEnter={clearTimers}
            onMouseLeave={scheduleClose}
          >
            <HoverCardBody data={data} />
          </div>,
          document.body,
        )}
    </span>
  );
}

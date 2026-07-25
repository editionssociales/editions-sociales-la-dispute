"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FOCUS_RING_DARK } from "@/lib/ui";

/**
 * Feuille de bas d'écran (bottom sheet) TÉLÉPHONE UNIQUEMENT — sort une
 * section du flux pour l'ancrer au bas du viewport, déroulée par défaut,
 * repliable en un bandeau-bouton (« Contribuer ») par GESTE (glissé du doigt
 * sur la poignée) ou par simple appui. Même grammaire que le menu déroulant du
 * header (`site-header.tsx`) : un `<button aria-expanded>` porte l'état, le
 * chevron se retourne, le repli laisse toujours une affordance visible.
 *
 * À `lg` et au-delà, le composant est TRANSPARENT : il rend ses enfants tels
 * quels, sans wrapper — la mise en page desktop de l'appelant (rail sticky de
 * /souscription) est intacte, y compris `display: grid` sur le parent.
 *
 * Fail-open (doctrine `hooks/use-in-view`) : le HTML serveur, et la première
 * frame hydratée, rendent la section EN FLUX, entière et sans JS — la feuille
 * ne s'installe qu'après hydratation, sur les seuls écrans étroits. Un
 * navigateur sans JS (ou un bot) voit la section complète, jamais un bandeau
 * qui ne s'ouvre pas.
 *
 * `anchors` : ids que les CTA d'ancre de la page visent (`#paliers`…). Une
 * fois la section hors du flux, un saut d'ancre ne montrerait plus rien : ces
 * clics sont interceptés pour DÉPLOYER la feuille puis défiler DANS son
 * panneau.
 */

/**
 * Hauteur du bandeau, seule partie visible replié — FIXE, 3.5rem (`h-14`,
 * cible R7 ≥ 44px). La classe de repli, la réserve posée sur `body` et la
 * course de glissé partagent cette valeur et DOIVENT rester en phase.
 *
 * Ne JAMAIS y remettre `env(safe-area-inset-bottom)` (essayé le 26/07, retiré
 * le jour même sur constat client) : iOS Safari renvoie 0 barre d'outils
 * déployée et ~34px une fois qu'elle s'escamote au défilement — le bandeau
 * changeait donc de taille selon l'état « plein écran » du navigateur.
 */
const HANDLE_PX = 56;

/** Sous le point de rupture `lg` de Tailwind (1024px) exclusivement. */
const MOBILE_QUERY = "(max-width: 1023.98px)";

/** Chevron de la poignée — même dessin que la bascule du header (angles droits, R8). */
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

export function BottomSheet({
  label,
  anchors = [],
  autoOpenDelayMs = 0,
  children,
}: {
  /** Libellé du bandeau — c'est aussi le nom accessible du bouton. */
  label: string;
  /** Ids d'ancre de la page qui doivent déplier la feuille (sans `#`). */
  anchors?: string[];
  /** Temps de pose, bandeau replié visible, avant le déroulé automatique. */
  autoOpenDelayMs?: number;
  children: ReactNode;
}) {
  const mobile = useMediaQuery(MOBILE_QUERY);
  // La feuille NAÎT REPLIÉE et se déroule seule après `autoOpenDelayMs` : le
  // chargement montre d'abord le bandeau-bouton « Contribuer », puis le
  // déroulé se joue à l'écran (au lieu d'être déjà fini au premier paint).
  const [open, setOpen] = useState(false);
  // Décalage vertical EN COURS de glissé (px, 0 = déroulée) ; `null` hors
  // geste — la position est alors portée par les classes, donc animée.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Le geste vit dans un ref (`last` = dernier décalage appliqué) : la
  // décision d'aimantation le lit à la levée du doigt sans passer par l'état,
  // dont les mises à jour sont asynchrones.
  const gesture = useRef<{
    startY: number;
    base: number;
    max: number;
    moved: boolean;
    last: number;
  } | null>(null);
  /** Un glissé vient de se terminer → le `click` qui suit ne doit pas rebasculer. */
  const dragged = useRef(false);
  /** L'utilisateur a pris la main → le déroulé automatique est annulé. */
  const userActed = useRef(false);
  const panelId = useId();

  // Déroulé automatique différé. `setState` dans un minuteur, pas dans le corps
  // de l'effet : c'est un événement externe (le temps), pas une dérivation du
  // rendu. Un appui ou un glissé avant l'échéance l'emporte — la feuille ne
  // doit jamais se rouvrir dans le dos de quelqu'un qui vient de la replier.
  useEffect(() => {
    if (!mobile) return;
    const id = window.setTimeout(() => {
      if (!userActed.current) setOpen(true);
    }, autoOpenDelayMs);
    return () => window.clearTimeout(id);
  }, [mobile, autoOpenDelayMs]);

  // Réserve la hauteur du bandeau replié en bas du DOCUMENT : le pied de site
  // vit dans le layout, hors de portée d'un espaceur rendu ici — sans ça, ses
  // derniers liens restent sous la feuille, inatteignables.
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${HANDLE_PX}px`;
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, [mobile]);

  // Fermeture au clic ou au glissé EXTÉRIEUR — sur `pointerdown` (le doigt
  // qui part ailleurs ferme aussitôt, sans attendre la levée) et en phase de
  // CAPTURE, pour fermer même si un composant de la page arrête la
  // propagation. Pas de voile : la page derrière reste lisible et cliquable,
  // c'est le premier appui qui referme.
  useEffect(() => {
    if (!mobile || !open) return;
    const onPointerDown = (event: PointerEvent) => {
      const sheet = sheetRef.current;
      if (!sheet || sheet.contains(event.target as Node)) return;
      userActed.current = true;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [mobile, open]);

  // Chaîne stable (et non le tableau, recréé à chaque rendu de l'appelant) :
  // l'écouteur ne se réabonne pas à chaque frame de glissé.
  const anchorKey = anchors.join(" ");
  useEffect(() => {
    const ids = anchorKey ? anchorKey.split(" ") : [];
    if (!mobile || ids.length === 0) return;
    // Arrivée AVEC l'ancre (cancel_url Stripe, lien externe) : le saut natif a
    // porté sur le HTML EN FLUX, avant que la feuille ne prenne la main — le
    // défilement est rejoué dans le panneau, qui repart sinon de son sommet.
    const landing = window.location.hash.slice(1);
    if (landing && ids.includes(landing)) {
      // Défilement SYNCHRONE (l'effet s'exécute après le commit : la feuille
      // est en place et mesurable) — jamais dans un `requestAnimationFrame`,
      // qui ne se délivre pas dans un onglet qui ne peint pas.
      panelRef.current?.querySelector(`#${CSS.escape(landing)}`)?.scrollIntoView({
        block: "start",
      });
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = (event.target as Element | null)?.closest?.("a[href*='#']");
      if (!(link instanceof HTMLAnchorElement)) return;
      const id = link.hash.slice(1);
      // Ancre de CETTE page seulement (le `cancel_url` Stripe et la page
      // /souscription/erreur pointent vers `/souscription#paliers` : ils
      // arrivent par un chargement, où la feuille est déjà déroulée).
      if (!id || !ids.includes(id) || link.pathname !== window.location.pathname) return;
      event.preventDefault();
      setOpen(true);
      // Défilement immédiat : `scrollTop` d'un conteneur ne dépend ni de sa
      // transformation (feuille encore repliée à cet instant) ni du rendu à
      // venir — inutile d'attendre une frame, qui peut ne jamais venir.
      panelRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "start" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [mobile, anchorKey]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      userActed.current = true;
      // Course utile = tout sauf le bandeau, qui reste toujours visible.
      // Course utile = tout sauf le bandeau, qui reste toujours visible.
      const max = Math.max(0, sheet.offsetHeight - HANDLE_PX);
      const base = open ? 0 : max;
      gesture.current = { startY: event.clientY, base, max, moved: false, last: base };
      // Capture : le doigt peut sortir du bandeau sans perdre le geste.
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragOffset(gesture.current.base);
    },
    [open],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = event.clientY - g.startY;
    // Tolérance : sous 4px c'est un appui, pas un glissé (tremblement du doigt).
    if (Math.abs(dy) > 4) g.moved = true;
    g.last = Math.min(g.max, Math.max(0, g.base + dy));
    setDragOffset(g.last);
  }, []);

  const endGesture = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Aimantation à mi-course : au-delà, la feuille finit de se replier.
    if (g.moved) setOpen(g.last < g.max / 2);
    setDragOffset(null);
    dragged.current = g.moved;
  }, []);

  const onClick = useCallback(() => {
    userActed.current = true;
    // Le `click` de fin de glissé ne doit pas annuler l'aimantation ; l'appui
    // simple (et le clavier, qui n'émet que `click`) bascule.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setOpen((previous) => !previous);
  }, []);

  if (!mobile) return <>{children}</>;

  const dragging = dragOffset !== null;
  return (
    <div
      ref={sheetRef}
      // z-40 : sous le header (z-50), dont le menu déroulant doit rester
      // au-dessus de la feuille.
      // À l'impression, la feuille redevient un bloc en flux, entier et jamais
      // tronqué (même soin que le rail en lg+, `tiers-rail.tsx`).
      // Ombre portée LÉGÈRE vers le haut (retour Youri 26/07) : la feuille
      // flotte au-dessus de la page, le filet ink seul ne la détachait pas.
      // Exception assumée à R8 (aplats durs `shadow-[8px_8px_0_0]`) — une
      // ombre nette ferait une seconde barre au-dessus du bandeau.
      className={`fixed inset-x-0 bottom-0 z-40 flex h-[66.6667svh] flex-col border-t-2 border-ink bg-paper shadow-[0_-10px_24px_-12px_rgba(23,20,15,0.35)] print:static print:h-auto print:translate-y-0 print:shadow-none ${
        dragging
          ? ""
          : // Pas de `motion-reduce:transition-none` : la course de la feuille
            // est l'information (d'où elle sort, où elle repart). Coupée, elle
            // se téléporte — et iOS coupe pour TOUS ses navigateurs à la fois
            // dès que « Réduire les animations » est actif. Exception assumée
            // (arbitrage client 2026-07-26), le reste du site respecte le
            // réglage.
            // Courbe de feuille : départ franc, arrivée très amortie
            // (cubic-bezier(.32,.72,0,1)) — un `ease-out` court donnait
            // une course sèche en fin de trajet. Le chevron suit la MÊME
            // durée et la même courbe.
            "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
      } ${
        !dragging && !open
          ? "translate-y-[calc(100%-3.5rem)]"
          : ""
      }`}
      // Position PENDANT le geste : le doigt mène, aucune transition ne s'interpose.
      style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        // touch-none : le navigateur ne doit pas voler le geste vertical pour
        // défiler la page pendant qu'on tire la feuille.
        className={`flex h-14 w-full shrink-0 touch-none select-none flex-col items-center justify-center gap-1.5 bg-brick text-paper hover:bg-paper hover:text-brick ${FOCUS_RING_DARK} cursor-grab transition-colors duration-200 ease-out active:cursor-grabbing motion-reduce:transition-none`}
      >
        {/* Poignée (grip) — barre pleine aux angles droits (R8), à la couleur
            du texte pour survivre à l'inversion au survol. */}
        <span aria-hidden="true" className="h-1 w-12 bg-current" />
        <span className="flex items-center gap-2 font-sans text-[13px] font-extrabold uppercase leading-none tracking-[.06em]">
          {label}
          {/* Chevron : vers le bas déroulée (tirer pour replier), retourné
              replié — la rotation s'anime sur la même durée que la course de
              la feuille, jamais un basculement sec. */}
          <span
            className={`inline-block transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
              open ? "rotate-0" : "rotate-180"
            }`}
          >
            <ChevronGlyph />
          </span>
        </span>
      </button>

      {/* `inert` replié : le contenu hors écran ne doit être ni focalisable ni
          lu par un lecteur d'écran (il reste dans le DOM, donc indexable). */}
      <div
        id={panelId}
        ref={panelRef}
        inert={!open}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain print:overflow-visible"
      >
        {children}
      </div>
    </div>
  );
}

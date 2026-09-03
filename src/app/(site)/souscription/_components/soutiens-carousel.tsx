"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Container } from "@/components/container";
import { NewTabMark } from "@/components/new-tab-mark";
import { Reveal } from "@/components/reveal";
import { Cover } from "@/lib/cover";
import type { SoutienVisuel } from "@/lib/site-content-core";
import { FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Section « Ils et elles nous soutiennent » — carrousel GRAND FORMAT à
 * défilement automatique (2026-09-03, remplace le rail plat à petites cartes
 * de `soutiens-rail.tsx` : les affiches de campagne 4:5 y étaient illisibles,
 * retour client « les visuels apparaissent minuscules »).
 *
 * Même modèle visuel que le carrousel de l'accueil (`nouveautes-carousel.tsx`
 * — cartes hautes, ombre portée signature, bleed pleine largeur) mais SANS
 * effet de profondeur : une FILE 2D PLATE, en boucle, qui avance seule à une
 * vitesse par défaut lente (`VITESSE_DEFAUT`), tout en restant navigable
 * NATIVEMENT — molette/trackpad/tactile gérés par le navigateur
 * (`overflow-x-auto`), glissé souris façon `scroll-rail.tsx`. Pas de
 * `ScrollRail` ici : la boucle infinie (pas de début/fin, pas de carte
 * active) est étrangère à sa mécanique flèches/centrage — primitive dédiée.
 *
 * BOUCLE par duplication : les visuels sont rendus DEUX fois (copies
 * `aria-hidden`, jamais de lien ni de focus — les lecteurs d'écran et le
 * clavier ne voient que les 13 vrais items) et `scrollLeft` est replié
 * modulo la largeur d'une copie (`onTrackScroll`) — le repli tombe sur un
 * contenu identique au pixel près, donc invisible, dans les deux sens. La
 * boucle ne s'active (`loop`) que si une copie déborde le viewport du rail :
 * en deçà (1 ou 2 visuels saisis), rail statique sans clones ni défilement.
 *
 * PAUSES du défilement automatique — le mouvement s'arrête dès que
 * l'utilisateur s'intéresse au rail, et ne tourne jamais pour personne :
 * survol souris, glissé en cours, toucher (+ 1,5 s après le relâché, le temps
 * de l'inertie), focus clavier dans le rail, bouton pause/lecture explicite
 * (WCAG 2.2.2), section hors viewport (IntersectionObserver), et
 * `prefers-reduced-motion` (aucun défilement automatique du tout — le rail
 * reste une boucle navigable à la main).
 *
 * Contrat de vide inchangé (`mergeSoutiens`, `site-content-core.ts`) :
 * `soutiens` vide ⇒ AUCUN rendu, jamais un titre de section sans rien
 * dessous. L'alt de chaque visuel vient de la légende saisie, sinon de l'alt
 * du média (posé par `scripts/import-soutiens-2026.ts` pour les affiches de
 * campagne) — les affiches portent leur propre texte, aucune légende visible
 * n'est nécessaire.
 */

/** Vitesse de défilement automatique par défaut — lente, ~1 carte/15 s (px/s). */
const VITESSE_DEFAUT = 28;

/** Reprise après un toucher : laisse passer l'inertie du défilement natif (ms). */
const REPRISE_APRES_TOUCHER_MS = 1500;

/**
 * Largeur affichée d'une affiche 4:5 : 0,8 × la hauteur `--soutien-h` du rail
 * (clamp(420px,44vw,560px)) → 336px sous ~955px de viewport, 35vw entre les
 * deux, 448px une fois la hauteur plafonnée (≥ 1273px). Les visuels d'un
 * autre ratio chargent un cran trop large ou trop serré — acceptable.
 */
const SOUTIEN_SIZES = "(min-width: 1280px) 448px, (min-width: 960px) 35vw, 336px";

const ITEM_CLASS = "flex flex-none flex-col items-center";

interface DragState {
  startX: number;
  startScroll: number;
  moved: boolean;
}

/** Affiche + légende éventuelle — même rendu pour l'original et son clone. */
function CarteSoutien({ soutien }: { soutien: SoutienVisuel }) {
  return (
    <>
      <div className="relative h-[var(--soutien-h)] w-fit bg-paper-2 shadow-[8px_8px_0_0_var(--color-ink)] ring-1 ring-ink">
        <Cover
          cover={soutien.image}
          alt={soutien.image.alt}
          fit="height"
          sizes={SOUTIEN_SIZES}
          draggable={false}
          className="block h-full w-auto select-none"
        />
      </div>
      {soutien.legende && (
        <p className="mt-3 text-center font-sans text-xs font-semibold text-ink-soft">
          {soutien.legende}
        </p>
      )}
    </>
  );
}

export function SoutiensCarousel({
  soutiens,
  pxParSeconde = VITESSE_DEFAUT,
}: {
  soutiens: SoutienVisuel[];
  /** Vitesse du défilement automatique (px/s) — lente par défaut. */
  pxParSeconde?: number;
}) {
  const n = soutiens.length;

  const trackRef = useRef<HTMLUListElement>(null);
  /** Largeur d'UNE copie de la file (dernière carte réelle + gap − première). */
  const setWidthRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  /** Reste sub-pixel du défilement automatique (28 px/s ≈ 0,5 px/frame). */
  const carryRef = useRef(0);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const visibleRef = useRef(true);
  /** Horodatage `performance.now()` avant lequel le défilement reste suspendu (toucher récent). */
  const pauseUntilRef = useRef(0);
  const userPausedRef = useRef(false);

  const [loop, setLoop] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    userPausedRef.current = userPaused;
  }, [userPaused]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /**
   * Mesure la largeur d'une copie et décide de la boucle. Clones exclus de la
   * mesure (`data-card="reel"`) : le résultat est le même avec ou sans eux.
   */
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>('[data-card="reel"]');
    if (cards.length === 0) return;
    const first = cards[0];
    const last = cards[cards.length - 1];
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    const w = last.offsetLeft + last.offsetWidth + gap - first.offsetLeft;
    setWidthRef.current = w;
    setLoop(w > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const card of el.querySelectorAll<HTMLElement>('[data-card="reel"]')) {
      ro.observe(card);
    }
    return () => ro.disconnect();
  }, [measure, soutiens]);

  /** Ne défile jamais hors écran — la section vit en bas d'une longue page. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Boucle d'animation — n'existe que si la boucle est active et le mouvement toléré. */
  useEffect(() => {
    if (!loop || reduced || n === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Borné à 100 ms : au retour d'un onglet caché, pas de saut de rattrapage.
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const el = trackRef.current;
      if (
        el &&
        visibleRef.current &&
        !userPausedRef.current &&
        !hoverRef.current &&
        !focusRef.current &&
        !dragRef.current &&
        now >= pauseUntilRef.current
      ) {
        carryRef.current += pxParSeconde * dt;
        const step = Math.floor(carryRef.current);
        if (step >= 1) {
          carryRef.current -= step;
          el.scrollLeft += step;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, reduced, n, pxParSeconde]);

  /**
   * Repli modulo une copie, dans les deux sens — vaut pour TOUTE source de
   * défilement (automatique, molette, tactile, glissé). Pendant un glissé, la
   * base du geste est décalée d'autant pour que le mouvement reste continu.
   * HYSTÉRÉSIS d'un pixel entre les deux bornes : le repli arrière pose
   * `scrollLeft` dans `[w, w+1)` — un seuil avant à `w` exactement s'y
   * redéclencherait aussitôt (ping-pong entre les deux conditions, constaté
   * à la vérification du 2026-09-03) ; à `w + 1`, chaque repli laisse l'autre
   * condition strictement fausse.
   */
  const onTrackScroll = useCallback(() => {
    if (!loop) return;
    const el = trackRef.current;
    const w = setWidthRef.current;
    if (!el || w <= 0) return;
    const sl = el.scrollLeft;
    if (sl >= w + 1) {
      el.scrollLeft = sl - w;
      if (dragRef.current) dragRef.current.startScroll -= w;
    } else if (sl < 1) {
      el.scrollLeft = sl + w;
      if (dragRef.current) dragRef.current.startScroll += w;
    }
  }, [loop]);

  // Glissé souris (le tactile reste 100 % natif) — même mécanique que
  // `scroll-rail.tsx` : capture du pointeur, seuil de 4px avant de considérer
  // le geste comme un drag, suppression du clic qui le suit.
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "touch") {
      pauseUntilRef.current = performance.now() + REPRISE_APRES_TOUCHER_MS;
      return;
    }
    if (e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "touch") {
      pauseUntilRef.current = performance.now() + REPRISE_APRES_TOUCHER_MS;
      return;
    }
    const el = trackRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) el.scrollLeft = drag.startScroll - dx;
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "touch") {
      pauseUntilRef.current = performance.now() + REPRISE_APRES_TOUCHER_MS;
      return;
    }
    const el = trackRef.current;
    const drag = dragRef.current;
    if (el) el.style.cursor = "";
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag?.moved) suppressClickRef.current = true;
    dragRef.current = null;
  }, []);

  const onPointerEnter = useCallback((e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "mouse") hoverRef.current = true;
  }, []);

  const onPointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLUListElement>) => {
      if (e.pointerType === "mouse") hoverRef.current = false;
      onPointerUp(e);
    },
    [onPointerUp],
  );

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      suppressClickRef.current = false;
    }
  }, []);

  const onFocus = useCallback(() => {
    focusRef.current = true;
  }, []);

  const onBlur = useCallback((e: React.FocusEvent<HTMLUListElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      focusRef.current = false;
    }
  }, []);

  if (n === 0) return null;

  return (
    <section aria-label="Ils et elles nous soutiennent" className="mt-12 sm:mt-16">
      <Reveal>
        <Container>
          <div className="mb-4 flex min-h-[clamp(44px,4vw,52px)] items-end justify-between gap-4">
            <h2 className="font-sans text-sm font-extrabold uppercase tracking-[.08em] text-ink">
              Ils et elles nous soutiennent
            </h2>
            {/* Pause/lecture explicite (WCAG 2.2.2) — même chrome que les
                flèches des rails. Inutile (donc absent) sans boucle active ou
                sous `prefers-reduced-motion` : rien ne bouge tout seul. */}
            {loop && !reduced && (
              <button
                type="button"
                aria-pressed={userPaused}
                aria-label={
                  userPaused
                    ? "Relancer le défilement automatique"
                    : "Mettre en pause le défilement automatique"
                }
                onClick={() => setUserPaused((p) => !p)}
                className={`flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] flex-none items-center justify-center border-[1.5px] border-ink bg-paper text-ink transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`}
              >
                {userPaused ? (
                  <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                    <path d="M2.5 1 11 6 2.5 11z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                    <path d="M2 1h3v10H2zM7 1h3v10H7z" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </Container>
      </Reveal>
      <ul
        ref={trackRef}
        role="list"
        onScroll={onTrackScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={onClickCapture}
        onFocus={onFocus}
        onBlur={onBlur}
        className="flex cursor-grab select-none items-start gap-[clamp(20px,3vw,44px)] overflow-x-auto px-5 pb-[clamp(24px,3vw,40px)] pt-2 sm:px-8 [--soutien-h:clamp(420px,44vw,560px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {soutiens.map((soutien, i) => (
          <li key={`reel-${i}`} data-card="reel" className={ITEM_CLASS}>
            {soutien.lien ? (
              // `NewTabMark` en DERNIER enfant du lien (convention
              // `site-footer.tsx`) — un soutien lié reste signalé « nouvel
              // onglet » aux technologies d'assistance.
              <Link
                href={soutien.lien}
                target="_blank"
                rel="noreferrer"
                draggable={false}
                className={`block ${FOCUS_RING_LIGHT}`}
              >
                <CarteSoutien soutien={soutien} />
                <NewTabMark />
              </Link>
            ) : (
              <div>
                <CarteSoutien soutien={soutien} />
              </div>
            )}
          </li>
        ))}
        {/* Copie de boucle — masquée aux lecteurs d'écran, jamais interactive
            (pas de lien : rien de focalisable), largeurs identiques aux
            originaux pour un repli au pixel près. */}
        {loop &&
          soutiens.map((soutien, i) => (
            <li key={`clone-${i}`} aria-hidden="true" data-card="clone" className={ITEM_CLASS}>
              <div>
                <CarteSoutien soutien={soutien} />
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}

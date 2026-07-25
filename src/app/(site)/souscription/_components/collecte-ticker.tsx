"use client";

import { useEffect, useRef } from "react";
import { MASK_STYLE, OVERSHOOT } from "@/components/gauge";
import type { GaugeMarker } from "@/lib/campaign";

/**
 * Durée de la PASSATION (cf. `.rail-handoff`, globals.css) : le HTML serveur
 * peint le niveau réel, l'hydratation rend la barre au scroll — la transition
 * couvre le seul écart entre les deux, puis disparaît (le suivi du scroll doit
 * rester immédiat).
 */
const HANDOFF_MS = 700;

/**
 * Tolérance d'allumage d'un palier : le front calculé n'atteint jamais son
 * abscisse à la virgule près (course de scroll en pixels entiers).
 */
const EPSILON = 0.0004;

/** Opacité d'un trait de palier pas encore franchi (allumé : 1). */
const TICK_DIM = "0.2";

/**
 * Liseré de collecte fixé en haut du viewport, sur /souscription seulement —
 * variante V2 « lecture = lutte » du prototype validé client
 * (`prototypes/liseret-viewport.html`), portée à 10px : le remplissage ocher
 * progresse AVEC le scroll, rescalé sur le niveau réel de la collecte — arrivé
 * au bas de la page, le liseré affiche exactement ce qui est réuni. Lire, ici,
 * c'est mener la collecte à son état vrai.
 *
 * Géométrie reprise TELLE QUELLE de `<Gauge>` (`OVERSHOOT`, `MASK_STYLE`
 * importés) : même empan de demi-droite (objectif × 1,2), mêmes abscisses de
 * paliers, même queue en pointillés dégressifs au-delà de ≈105 % de
 * l'objectif. Le liseré n'est pas une seconde jauge, c'est la même, à
 * l'échelle du viewport.
 *
 * FOND IMPOSÉ (correction client du 26/07) : le prototype masquait le bandeau
 * ENTIER, si bien que la page défilante se voyait dans les coupures de la
 * queue. Ici, un calque `paper` opaque tient toute la largeur et n'est JAMAIS
 * masqué ; le masque ne s'applique qu'au groupe de barre posé dessus (reste à
 * collecter + part collectée + paliers). Les tirets de fin découpent donc la
 * barre sur du paper imposé, jamais sur la section traversée (paper, ink,
 * brick, navy, ocher, bottle). Paper plutôt qu'une autre teinte de jauge :
 * c'est le fond du site, donc ce que le prototype validé montrait déjà sous la
 * queue sur la majorité de la page, et c'est le contraste maximal avec l'aplat
 * ink du reste-à-collecter — la frange de la demi-droite reste lisible sur
 * TOUTES les sections, y compris les bandeaux sombres.
 *
 * Fail-open (contrat des Métriques, `src/components/CLAUDE.md`) : le HTML
 * serveur porte le niveau RÉEL de la collecte — sans JS, le liseré reste un
 * état honnête et statique. Le pilotage par le scroll ne prend la main qu'à
 * l'hydratation, et jamais sous `prefers-reduced-motion` (le niveau réel fait
 * alors foi, comme dans le prototype).
 *
 * Décoration-donnée pure : `aria-hidden` — la jauge du héros porte déjà
 * l'alternative programmatique (`role="img"` + montant) et les paliers en
 * toutes lettres. `print:hidden` : à l'impression, un bandeau fixe se
 * répéterait en tête de chaque page.
 *
 * L'appelant ne le monte PAS en panne Stripe (`outage`) : il n'y a alors aucun
 * total honnête à afficher.
 */
export function CollecteTicker({
  value,
  max,
  markers,
}: {
  value: number;
  max: number;
  markers: GaugeMarker[];
}) {
  // Empan de la demi-droite (120 k€ pour un objectif à 100 k€) : l'objectif
  // tombe à 83,3 %, une collecte au-delà se peint sur le dépassement.
  const span = max * OVERSHOOT;
  const real = Math.min(value / span, 1);

  const fillRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // État allumé/éteint des paliers, initialisé sur le rendu serveur : les
  // écritures suivantes sont différentielles (aucun style réécrit par frame).
  const litRef = useRef<boolean[]>(markers.map((m) => m.reached));

  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    // Mouvement réduit : aucun pilotage, le niveau réel rendu par le serveur
    // reste en place (même sortie que le prototype, qui force scrollP à 1).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let queued = false;
    // Première peinture = la passation : elle éteint les paliers rendus par le
    // serveur, sans les faire clignoter (seul un ALLUMAGE frappe, et jamais
    // celui-là).
    let handover = true;

    const paint = (front: number) => {
      // `scaleX` sur un aplat sans contenu : composité, aucun layout — et le
      // masque, porté par le groupe parent, reste en repère viewport (posé sur
      // la barre elle-même, il se comprimerait avec elle).
      fill.style.transform = `scaleX(${front})`;
      markers.forEach((m, i) => {
        const el = tickRefs.current[i];
        if (!el) return;
        const lit = front >= m.value / span - EPSILON;
        if (lit === litRef.current[i]) return;
        litRef.current[i] = lit;
        el.style.opacity = lit ? "1" : TICK_DIM;
        // Impression du palier au passage du front (réversible : en remontant,
        // il s'éteint sans frapper).
        if (lit && !handover) {
          el.classList.remove("rail-tick-hit");
          void el.offsetWidth; // reflow : rejoue l'animation
          el.classList.add("rail-tick-hit");
        }
      });
      handover = false;
    };

    const read = () => {
      queued = false;
      const course = document.documentElement.scrollHeight - window.innerHeight;
      const p = course > 0 ? Math.min(1, Math.max(0, window.scrollY / course)) : 0;
      paint(p * real);
    };

    // Listener passif + une seule lecture par frame : le scroll ne déclenche
    // jamais de calcul de style en cascade.
    const onScroll = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(read);
    };

    read();
    const handoff = window.setTimeout(() => {
      fill.classList.remove("rail-handoff");
    }, HANDOFF_MS);

    window.addEventListener("scroll", onScroll, { passive: true });
    // La course de scroll change avec la hauteur du viewport (barre d'outils
    // mobile escamotable, rotation) : le front doit se recaler.
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.clearTimeout(handoff);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [markers, real, span]);

  return (
    <div
      aria-hidden="true"
      // Au-dessus du header sticky (z-50) : le liseré n'est jamais recouvert.
      // `pointer-events-none` — 10px de bandeau fixe ne doivent voler aucun
      // clic au haut de page. Hauteur à garder en phase avec la réserve du
      // header (`pt-[10px]`, `site-header.tsx`) et l'ancrage du rail
      // (`lg:top-[10px]`, `tiers-rail.tsx`).
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[10px] print:hidden"
    >
      {/* Fond imposé, JAMAIS masqué : rien de la page ne se voit au travers. */}
      <div className="absolute inset-0 bg-paper" />
      {/* Groupe de barre — le masque vit ICI (et pas sur le bandeau) : lui
          seul se termine en pointillés dégressifs. */}
      <div className="absolute inset-0" style={MASK_STYLE}>
        {/* Reste à collecter. */}
        <div className="absolute inset-0 bg-ink" />
        {/* Part collectée : `origin-left` + scaleX, jamais de `width`. */}
        <div
          ref={fillRef}
          className="rail-handoff absolute inset-0 origin-left bg-ocher"
          style={{ transform: `scaleX(${real})` }}
        />
        {markers.map((m, i) => (
          <span
            key={m.value}
            ref={(el) => {
              tickRefs.current[i] = el;
            }}
            // 2px centrés sur l'abscisse du palier (`-ml-px`) ; `origin-center`
            // pour que l'impression du passage s'épaississe des deux côtés.
            className="absolute inset-y-0 -ml-px w-0.5 origin-center bg-paper"
            style={{ left: `${(m.value / span) * 100}%`, opacity: m.reached ? 1 : TICK_DIM }}
          />
        ))}
      </div>
    </div>
  );
}

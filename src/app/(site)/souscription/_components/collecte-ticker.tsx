"use client";

import { useEffect, useRef } from "react";
import { MASK_STYLE, OVERSHOOT } from "@/components/gauge";
import { TICKER_HEIGHT_CLASS } from "@/components/rail-inset";

/**
 * Durée de la PASSATION (cf. `.rail-handoff`, globals.css) : le HTML serveur
 * peint le niveau réel, l'hydratation rend la barre au scroll — la transition
 * couvre le seul écart entre les deux, puis disparaît (le suivi du scroll doit
 * rester immédiat). Remplissage ET curseur la portent, et la perdent au même
 * timeout : deux courses désynchronisées décrocheraient la pointe du front.
 */
const HANDOFF_MS = 700;

/**
 * Liseré de collecte fixé en haut du viewport, sur /souscription seulement —
 * variante V2 « lecture = lutte » du prototype validé client
 * (`prototypes/liseret-viewport.html`), portée à 10px : le remplissage ocher
 * progresse AVEC le scroll, rescalé sur le niveau réel de la collecte — arrivé
 * au bas de la page, le liseré affiche exactement ce qui est réuni. Lire, ici,
 * c'est mener la collecte à son état vrai.
 *
 * Géométrie reprise TELLE QUELLE de `<Gauge>` (`OVERSHOOT`, `MASK_STYLE`
 * importés) : même empan de demi-droite (objectif × 1,2), même queue en
 * pointillés dégressifs au-delà de ≈105 % de l'objectif. Le liseré n'est pas
 * une seconde jauge, c'est la même, à l'échelle du viewport.
 *
 * AUCUNE marque de palier (retour Youri 26/07 : « enlève les marques de
 * paliers du liseré ») : sur 10px de haut, trois traits allumés/éteints
 * faisaient une graduation illisible que rien n'explique — les paliers se
 * lisent dans la page, pas dans son liseré. Ne restent que le front… et le
 * CURSEUR qui le désigne (même retour : le client voyait « le triangle curseur
 * bloqué à 0 », c'est-à-dire une pointe qui ne suivait pas ; elle suit
 * désormais le remplissage au pixel, dans le même `paint()`). C'est pourquoi
 * `MASK_STYLE` reste la version SANS coupures de la jauge : les démarcations de
 * paliers sont l'affaire de la barre du héros seule.
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
}: {
  value: number;
  max: number;
}) {
  // Empan de la demi-droite (120 k€ pour un objectif à 100 k€) : l'objectif
  // tombe à 83,3 %, une collecte au-delà se peint sur le dépassement.
  const span = max * OVERSHOOT;
  const real = Math.min(value / span, 1);

  const fillRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const cursor = cursorRef.current;
    if (!fill || !cursor) return;
    // Mouvement réduit : aucun pilotage, le niveau réel rendu par le serveur
    // reste en place — remplissage ET curseur (même sortie que le prototype,
    // qui force scrollP à 1).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let queued = false;

    const paint = (front: number) => {
      // `scaleX` sur un aplat sans contenu : composité, aucun layout — et le
      // masque, porté par le groupe parent, reste en repère viewport (posé sur
      // la barre elle-même, il se comprimerait avec elle).
      fill.style.transform = `scaleX(${front})`;
      // Le curseur est peint dans le MÊME appel, jamais dans un second
      // listener : la pointe et le front ne peuvent pas décrocher d'une frame.
      // `translateX` en % (et non `scaleX`) — un triangle ne se comprime pas.
      cursor.style.transform = `translateX(${front * 100}%)`;
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
      cursor.classList.remove("rail-handoff");
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
  }, [real]);

  return (
    <div
      aria-hidden="true"
      // Au-dessus du header sticky (z-50) : le liseré n'est jamais recouvert.
      // `pointer-events-none` — 10px de bandeau fixe ne doivent voler aucun
      // clic au haut de page. Hauteur dérivée de `rail-inset.ts`, source
      // commune avec la réserve du header et l'ancrage du rail.
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] ${TICKER_HEIGHT_CLASS} print:hidden`}
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
      </div>
      {/* Curseur voyageur, FRÈRE du groupe masqué et posé après lui : il ne
          doit être ni rogné par la queue en pointillés (une pointe à demi
          effacée au-delà de 105 k€ ne dirait plus rien) ni comprimé par le
          `scaleX` du remplissage — d'où un calque à part, `inset-x-0`, que la
          course translate de `front × 100 %`, l'enfant se recentrant lui-même
          sur ce point (`-translate-x-1/2`).

          Triangle PAPER pointe en bas, 10×8 en bordures CSS (aplat R8, zéro
          radius), CONTENU dans les 10px du bandeau : au front il chevauche
          l'ocher à sa gauche et l'ink à sa droite — paper est la seule teinte
          lisible sur les deux d'un coup.

          Comme le remplissage : niveau RÉEL au rendu serveur (fail-open), même
          `.rail-handoff` pour rattraper le scroll à l'hydratation, statique au
          réel sous `prefers-reduced-motion`. À 0 € il est simplement posé à
          l'origine — et bouge au premier scroll. */}
      <div
        ref={cursorRef}
        className="rail-handoff absolute inset-x-0 top-0"
        style={{ transform: `translateX(${real * 100}%)` }}
      >
        <span className="absolute left-0 top-0 h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-8 border-l-transparent border-r-transparent border-t-paper" />
      </div>
    </div>
  );
}

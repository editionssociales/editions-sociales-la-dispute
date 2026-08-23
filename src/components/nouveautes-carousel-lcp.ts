/**
 * Index, `sizes` et bootstrap LCP du carrousel des nouveautés — extraits du
 * composant client pour rester testables sans `next/image` (issue #109).
 *
 * L'index centré au premier paint est le 2e livre s'il y en a au moins
 * deux (volontaire : la vitrine ne démarre pas sur le bord du rail).
 * C'est CETTE couverture qui est le LCP, pas l'index 0.
 */

export function nouveautesInitialIndex(count: number): number {
  return count > 1 ? 1 : 0;
}

/**
 * `sizes` de la carte CENTRALE (peinte ~plein zoom, ~127–142px CSS mobile).
 *
 * 32vw (pas 42vw) : sur l'émulateur Lighthouse 412×1,75 le navigateur
 * retient 256w au lieu de 384w (~20 Ko de trop, insight image-delivery) ;
 * sur un iPhone 3× il retient encore 384w (32vw×390×3 ≈ 374 → 384).
 * Le `vw` est requis : sans lui Next génère le srcset complet (32w…1080w).
 */
export const NOUVEAUTES_COVER_SIZES_CENTER = "(max-width: 640px) 32vw, 260px";
/**
 * Cartes latérales downscalées (`scale` jusqu'à 0,72, ~90px CSS) — 16vw
 * retient 128w sur mobile LH au lieu de 256w, pour ne pas concurrencer le LCP.
 */
export const NOUVEAUTES_COVER_SIZES_SIDE = "(max-width: 640px) 16vw, 190px";

export function nouveautesCoverSizes(index: number, initialIndex: number): string {
  return index === initialIndex ? NOUVEAUTES_COVER_SIZES_CENTER : NOUVEAUTES_COVER_SIZES_SIDE;
}

/** `id` du rail — une seule instance par page (accueil ou /catalogue?upcoming=1). */
export const NOUVEAUTES_RAIL_ID = "nouveautes-rail";

/**
 * Script inline exécuté au parse HTML (avant hydratation React) : pose les
 * marges d'extrémité puis centre la couverture LCP. Sans ça, le premier
 * paint montre l'index 0 à gauche et le LCP n'est recentré qu'au `useEffect`.
 */
export function nouveautesBootstrapScript(initialIndex: number): string {
  const i = Number.isFinite(initialIndex) ? Math.max(0, Math.floor(initialIndex)) : 0;
  return `(function(e,i){if(!e)return;var c=e.querySelectorAll("[data-card]");if(!c.length)return;var w=e.clientWidth;var f=c[0].getBoundingClientRect().width;var l=c[c.length-1].getBoundingClientRect().width;e.style.paddingLeft=Math.max(16,(w-f)/2)+"px";e.style.paddingRight=Math.max(16,(w-l)/2)+"px";var t=c[Math.max(0,Math.min(c.length-1,i))];if(!t)return;var r=e.getBoundingClientRect();var b=t.getBoundingClientRect();e.scrollLeft+=b.left+b.width/2-(r.left+r.width/2);})(document.getElementById("${NOUVEAUTES_RAIL_ID}"),${i})`;
}

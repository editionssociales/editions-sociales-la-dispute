"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Vol « ajout au panier » — à l'ajout, un petit carré jaune (même recette que
 * la puce d'ajout : aplat pop-yellow, trait ink, R8) part du bouton cliqué et
 * file en LIGNE DROITE vers la cible panier visible du header, qui encaisse
 * l'atterrissage d'une brève pulsation. Raison d'être : le compteur du header
 * change à l'instant même du clic (contexte partagé), mais rien ne menait
 * l'œil jusqu'à lui — le retour local du bouton (« Ajouté », `✓`) dit que
 * l'action a réussi, pas OÙ la retrouver.
 *
 * Tout le vol vit ici, côté bouton : le header ne fait que MARQUER ses cibles
 * (`cartFlyTarget`), aucun état partagé ni événement custom. Le carré volant
 * est rendu en portail dans `document.body` (le bouton peut vivre sous un
 * ancêtre `overflow-hidden` — vignette de grille — qui tronquerait le trajet).
 */

/**
 * Marqueur des cibles du vol, à étaler sur l'élément du header (`{...cartFlyTarget(…)}`).
 * Deux sortes, parce que la case de droite mobile n'affiche le pictogramme
 * panier que menu déroulé : menu fermé, c'est la bascule du menu (chevron +
 * compteur) qui porte le panier à l'écran — elle est alors la bonne cible du
 * regard. À sortes égales visibles (menu déroulé : panier ET bascule du bas),
 * « panier » prime toujours.
 */
const TARGET_ATTR = "data-cart-fly-target";

export function cartFlyTarget(kind: "panier" | "menu") {
  return { [TARGET_ATTR]: kind };
}

function findTarget(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[${TARGET_ATTR}]`),
  ).filter((el) => {
    // Visible = hors calque `inert` ET boîte rendue. Le croisement panier ↔
    // bascule de la case mobile masque par OPACITÉ sans démonter (le calque
    // sortant doit finir son fondu, cf. `site-header.tsx`) : l'opacité du
    // nœud lui-même ne dit rien, c'est le span parent qui la porte — mais ce
    // même calque porte `inert`, qu'on remonte via `closest`. Les blocs
    // d'autre breakpoint (`lg:hidden` / `hidden lg:grid`) tombent, eux, à
    // une boîte de taille nulle.
    if (el.closest("[inert]")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return (
    candidates.find((el) => el.getAttribute(TARGET_ATTR) === "panier") ??
    candidates[0] ??
    null
  );
}

/**
 * Pulsation d'atterrissage : la cible gonfle d'un cran et flashe pop-yellow
 * (le survol de ces cellules vire déjà au jaune — même vocabulaire). En WAAPI
 * et pas en classe CSS : le compteur re-rend la cible à chaque ajout, et
 * React réécrirait un `className` posé à la main ; `animate()` vit hors de
 * `className` et se nettoie seul. Sur un nœud entre-temps détaché
 * (navigation), l'appel est inoffensif.
 */
function bumpTarget(target: HTMLElement) {
  if (typeof target.animate !== "function") return;
  target.animate(
    [
      { transform: "scale(1)", backgroundColor: "var(--color-pop-yellow)" },
      {
        transform: "scale(1.12)",
        backgroundColor: "var(--color-pop-yellow)",
        offset: 0.4,
      },
      { transform: "scale(1)", backgroundColor: "var(--color-paper)" },
    ],
    { duration: 350, easing: "ease-out" },
  );
}

interface Flight {
  id: number;
  /** Centre de départ (coordonnées viewport — le carré est `fixed`). */
  x: number;
  y: number;
  /** Trajet jusqu'au centre de la cible, porté par `--fly-x`/`--fly-y`. */
  dx: number;
  dy: number;
}

// Durée du vol — DOIT rester égale à celle de `.cart-fly` (`globals.css`) :
// c'est elle qui retire le carré du DOM et déclenche la pulsation, un
// `animationend` serait perdu si l'animation était coupée (garde
// reduced-motion CSS, onglet en arrière-plan).
const FLY_MS = 600;

/**
 * `fly(bouton)` lance un vol depuis le centre de l'élément cliqué ; `flights`
 * est à rendre tel quel par l'appelant (portail — sa place dans l'arbre est
 * indifférente, il reste vide tant qu'aucun vol n'est en cours, donc rien à
 * hydrater côté serveur). Plusieurs clics rapprochés = plusieurs carrés en
 * vol, chacun sa course.
 */
export function useFlyToCart(): {
  fly: (from: HTMLElement) => void;
  flights: ReactNode;
} {
  const [flightList, setFlightList] = useState<Flight[]>([]);
  const nextId = useRef(0);
  const timeouts = useRef(new Set<number>());

  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const fly = useCallback((from: HTMLElement) => {
    // Sous « réduire les animations », ni vol ni pulsation : mouvement
    // décoratif (le retour du bouton et la région live disent déjà le
    // succès), pas fonctionnel comme le croisement du menu mobile — il suit
    // donc le réglage, contrairement à l'exception `LAYER_MORPH`.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = findTarget();
    if (!target) return;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const x = a.left + a.width / 2;
    const y = a.top + a.height / 2;
    const id = nextId.current++;
    setFlightList((fs) => [
      ...fs,
      { id, x, y, dx: b.left + b.width / 2 - x, dy: b.top + b.height / 2 - y },
    ]);
    const t = window.setTimeout(() => {
      timeouts.current.delete(t);
      setFlightList((fs) => fs.filter((f) => f.id !== id));
      bumpTarget(target);
    }, FLY_MS);
    timeouts.current.add(t);
  }, []);

  const flights =
    flightList.length > 0
      ? createPortal(
          // `z-[70]` : au-dessus du header sticky (`z-50`) que le carré doit
          // survoler pour atterrir sur sa cible.
          <span aria-hidden="true">
            {flightList.map((f) => (
              <span
                key={f.id}
                className="cart-fly pointer-events-none fixed z-[70] flex h-8 w-8 items-center justify-center border-2 border-ink bg-pop-yellow font-sans text-base font-black leading-none text-black"
                style={
                  {
                    left: f.x,
                    top: f.y,
                    "--fly-x": `${f.dx}px`,
                    "--fly-y": `${f.dy}px`,
                  } as CSSProperties
                }
              >
                +1
              </span>
            ))}
          </span>,
          document.body,
        )
      : null;

  return { fly, flights };
}

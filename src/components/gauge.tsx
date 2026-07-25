"use client";

import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";

type Marker = { value: number; label: string; reached: boolean };

/** La barre s'étend 20 % au-delà de l'objectif (demi-droite). */
const OVERSHOOT = 1.2;

/**
 * Fraction de l'objectif où la barre part en pointillés (≈ 105 000 € pour un
 * objectif à 100 000 €) : au-delà, l'axe ne promet plus rien, il se prolonge.
 */
const DASH_FROM = 1.05;

/** Part de la barre peinte en plein (le reste = la queue en pointillés). */
const SOLID_PCT = (DASH_FROM / OVERSHOOT) * 100;

/**
 * Masque de la barre : un aplat opaque jusqu'à `SOLID_PCT`, puis une queue de
 * quatre tirets qui raccourcissent ET s'effacent — la demi-droite « se termine
 * en douceur » sans jamais dégrader l'aplat lui-même (R8 : les tirets sont des
 * pleins, c'est leur suite qui s'éteint).
 *
 * Les arrêts de la queue sont en POURCENTAGES de sa propre boîte (posée par
 * `mask-size`) : le nombre de tirets reste le même de 320px à 1200px, seule
 * leur longueur suit. Deux couches de masque (union par défaut) plutôt qu'un
 * `mask-composite`, dont les mots-clés divergent encore entre Safari et le
 * reste.
 */
const DASH_TAIL =
  "linear-gradient(90deg,#000 0 22%,transparent 22% 34%,rgba(0,0,0,.68) 34% 52%,transparent 52% 64%,rgba(0,0,0,.4) 64% 78%,transparent 78% 88%,rgba(0,0,0,.18) 88% 96%,transparent 96%)";

const MASK = `linear-gradient(#000,#000) left top / ${SOLID_PCT}% 100% no-repeat, ${DASH_TAIL} right top / ${100 - SOLID_PCT}% 100% no-repeat`;

/** Le masque s'applique à l'élément ENTIER, box-shadow comprise : l'ombre dure
 *  est donc peinte par un calque jumeau décalé, jamais par `box-shadow` (elle
 *  serait rognée hors de la boîte, donc invisible). */
const MASK_STYLE = { mask: MASK, WebkitMask: MASK } as const;

/**
 * Jauge de collecte : un aplat ocher porte la barre entière ; un cache couleur
 * `line` se retire vers la droite à l'entrée dans le viewport pour révéler la
 * part collectée.
 *
 * Demi-droite (maquette 25/07) : la barre dépasse l'objectif de 20 %
 * (`OVERSHOOT`) — l'axe continue après le sommet, ce qui laisse centrer
 * l'abscisse du 100 000 € sur son trait (plus de chevauchement avec le
 * palier précédent) et donne où peindre un éventuel dépassement de collecte.
 * Passé ≈ 105 000 € (`DASH_FROM`) l'axe part en pointillés dégressifs.
 *
 * Coquille de rendu : toute l'arithmétique de campagne (valeur, max, paliers
 * atteints) est dérivée en amont par `lib/campaign` ; la jauge ne fait que
 * peindre des positions et jouer l'effet de révélation.
 *
 * `tone` recolore le texte et l'ombre (la barre porte ses propres teintes
 * fixes, lisibles sur les deux fonds) : `"light"` (défaut, texte ink, ombre
 * ink) pour une jauge posée sur paper — c'est le cas du héros de
 * `/souscription` depuis l'inversion des fonds du 26/07 ; `"dark"` (texte et
 * ombre paper) pour une jauge posée sur ink.
 */
export function Gauge({
  value,
  max,
  markers,
  className = "",
  tone = "light",
}: {
  value: number;
  max: number;
  markers: Marker[];
  className?: string;
  tone?: "light" | "dark";
}) {
  const [ref, filled] = useInView<HTMLDivElement>({ threshold: 0.4 });
  // Positions en % de la barre ENTIÈRE (objectif + dépassement) : l'objectif
  // tombe à 100/1.2 ≈ 83,3 % ; une collecte au-delà de l'objectif continue
  // de se peindre sur le dépassement (cap au bout de la demi-droite).
  const span = max * OVERSHOOT;
  const pct = Math.min((value / span) * 100, 100);
  const dark = tone === "dark";

  return (
    <div ref={ref} className={className}>
      {/* Réserve mobile : les paliers de rang pair montent AU-DESSUS de la
          barre (voir plus bas), et n'occupent aucune place — le padding la
          leur garde. Dès `sm`, tous les libellés redescendent. */}
      <div className="relative pt-16 sm:pt-0">
        {/* Ombre dure (R8, recette des couvertures de carrousel) peinte par un
            calque jumeau masqué à l'identique : elle épouse donc les
            pointillés de la queue au lieu de s'arrêter net. */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-16 h-4 translate-x-2 translate-y-2 sm:top-0 ${dark ? "bg-paper/30" : "bg-ink"}`}
          style={MASK_STYLE}
        />
        {/* Alternative programmatique (a11y) : la pile de <div> anonymes
            n'expose sinon ni la nature de jauge ni le taux de remplissage. */}
        <div
          role="img"
          aria-label={`${formatInt(value)} € collectés sur un objectif de ${formatInt(max)} €`}
          // Barre ORANGE d'un bout à l'autre (retour Youri 25/07, remplace les
          // quatre blocs navy/bottle/ocher/brick) : ocher est l'orange de la
          // charte (R3, accent d'attente) — lisible sur ink comme sur paper.
          className="relative h-4 overflow-hidden bg-ocher"
          style={MASK_STYLE}
        >
          {/* Cache : recouvre la part non collectée, glisse vers la droite.
              Animé en transform (composité GPU) plutôt qu'en `left`
              (layout+paint à chaque frame) : translateX en % se réfère à la
              largeur propre (= la barre entière), le débordement à droite est
              clippé par l'overflow-hidden du parent. */}
          <div
            className="absolute inset-0 bg-line transition-transform duration-[1600ms] ease-out motion-reduce:transition-none"
            style={{ transform: filled ? `translateX(${pct}%)` : "translateX(0)" }}
          />
          {markers.map((m) => (
            <div
              key={m.value}
              className="absolute inset-y-0 w-0.5 bg-paper"
              // Le sommet (value === max) tombe à ≈83,3 % : plus aucun trait
              // n'approche le bord clippé de la barre.
              style={{ left: `${(m.value / span) * 100}%` }}
            />
          ))}
        </div>
        {/* Libellés des paliers : MÊME disposition à toutes les largeurs —
            chacun centré sur son trait (retour Youri 26/07, remplace la liste
            empilée qui était la vue mobile). Sous `sm`, un palier sur deux
            passe AU-DESSUS de la barre : le décalage vertical, plus une boîte
            étroite au texte qui se replie, évite le chevauchement des voisins
            à 320px. Les items restent dans l'ordre des paliers dans le DOM
            (un seul jeu de nœuds, pas de doublon caché) : l'ordre de lecture
            suit la campagne, pas la bande d'affichage. */}
        <div
          className={`relative mt-3 h-16 text-[11px] leading-tight sm:h-12 sm:text-xs ${
            dark ? "text-paper/80 sm:text-paper/70" : "text-ink-soft"
          }`}
        >
          {markers.map((m, i) => {
            const up = i % 2 === 1;
            return (
              <div
                key={m.value}
                className={`absolute w-24 -translate-x-1/2 text-center sm:top-0 sm:mb-0 sm:w-auto ${
                  up ? "bottom-full mb-10 sm:bottom-auto" : "top-0"
                }`}
                style={{ left: `${(m.value / span) * 100}%` }}
              >
                <span
                  className={`block whitespace-nowrap text-sm font-semibold tabular-nums sm:text-lg ${
                    dark ? "text-paper" : "text-ink"
                  }`}
                >
                  {formatInt(m.value)}
                  {/* Le sommet porte un « + » : la demi-droite en pointillés
                      dit que la collecte peut continuer au-delà. */}
                  {m.value === max && "+"}&nbsp;€
                  {m.reached && (
                    <>
                      <span aria-hidden="true"> ✓</span>
                      <span className="sr-only"> (palier atteint)</span>
                    </>
                  )}
                </span>
                <span className="block sm:whitespace-nowrap">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

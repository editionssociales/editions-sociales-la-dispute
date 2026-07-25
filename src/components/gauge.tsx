"use client";

import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";

type Marker = { value: number; label: string; reached: boolean };

/** La barre s'étend 20 % au-delà de l'objectif (demi-droite). */
const OVERSHOOT = 1.2;

/**
 * Jauge de collecte : le fond porte les quatre couleurs de la palette en
 * blocs plats ; un cache couleur `line` se retire vers la droite à l'entrée
 * dans le viewport pour révéler la part collectée.
 *
 * Demi-droite (maquette 25/07) : la barre dépasse l'objectif de 20 %
 * (`OVERSHOOT`) — l'axe continue après le sommet, ce qui laisse centrer
 * l'abscisse du 100 000 € sur son trait (plus de chevauchement avec le
 * palier précédent) et donne où peindre un éventuel dépassement de collecte.
 *
 * Coquille de rendu : toute l'arithmétique de campagne (valeur, max, paliers
 * atteints) est dérivée en amont par `lib/campaign` ; la jauge ne fait que
 * peindre des positions et jouer l'effet de révélation.
 *
 * `tone` recolore le seul texte (la barre porte déjà ses propres teintes
 * fixes, lisibles sur les deux fonds) : `"light"` (défaut, texte ink) pour
 * une jauge posée sur paper ; `"dark"` (texte paper) pour une jauge posée sur
 * ink — héros de `/souscription`.
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

  return (
    <div ref={ref} className={className}>
      {/* Alternative programmatique (a11y) : la pile de <div> anonymes
          n'expose sinon ni la nature de jauge ni le taux de remplissage. */}
      <div
        role="img"
        aria-label={`${formatInt(value)} € collectés sur un objectif de ${formatInt(max)} €`}
        // Barre ORANGE d'un bout à l'autre (retour Youri 25/07, remplace les
        // quatre blocs navy/bottle/ocher/brick) : ocher est l'orange de la
        // charte (R3, accent d'attente) — lisible sur ink comme sur paper.
        className="relative h-4 overflow-hidden bg-ocher"
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
      {/* Libellés des paliers : tous CENTRÉS sur leur trait — le dépassement
          de la demi-droite laisse au 100 k€ la place de se centrer sans
          chevaucher le 80 k€. Sous `sm`, les mêmes entrées passent en liste
          empilée, lisible à 320px ; l'overlay ne s'affiche qu'à partir de
          `sm`. */}
      {/* Corps de la légende : text-sm sous `sm` (la liste empilée est la
          seule vue mobile des paliers — text-xs y était trop petit, retour
          Youri 25/07), text-xs dès que l'overlay reprend la main. */}
      <div
        className={`mt-2 text-sm sm:text-xs ${tone === "dark" ? "text-paper/80 sm:text-paper/70" : "text-ink-soft"}`}
      >
        {/* role="list" : le preflight Tailwind pose list-style:none, ce qui
            fait retirer la sémantique de liste par Safari/VoiceOver. */}
        {/* Tableau invisible 2 × 3 (retour Youri 26/07) : montants en colonne 1,
            intitulés en colonne 2 — les uns et les autres s'alignent d'une
            ligne à l'autre, ce qu'un texte au fil de l'eau ne faisait pas.
            `grid-cols-subgrid` plutôt que `display: contents` sur le `<li>` :
            l'item garde sa boîte (et son rôle `listitem`, que `contents`
            retire de l'arbre a11y sur WebKit) tout en se calant sur les
            colonnes de la liste. */}
        <ul role="list" className="grid grid-cols-[auto_1fr] gap-y-4 sm:hidden">
          {markers.map((m) => (
            <li
              key={m.value}
              className="col-span-2 grid grid-cols-subgrid items-baseline gap-x-3"
            >
              <span
                className={`whitespace-nowrap text-lg font-semibold tabular-nums ${tone === "dark" ? "text-paper" : "text-ink"}`}
              >
                {formatInt(m.value)}&nbsp;€
                {m.reached && (
                  <>
                    <span aria-hidden="true"> ✓</span>
                    <span className="sr-only"> (palier atteint)</span>
                  </>
                )}
              </span>
              <span>{m.label}</span>
            </li>
          ))}
        </ul>
        <div className="relative hidden h-12 sm:block">
          {markers.map((m) => {
            const left = (m.value / span) * 100;
            return (
              <div
                key={m.value}
                className="absolute top-0 -translate-x-1/2 text-center"
                style={{ left: `${left}%` }}
              >
                <span className={`text-lg font-semibold ${tone === "dark" ? "text-paper" : "text-ink"}`}>
                  {formatInt(m.value)}&nbsp;€
                  {m.reached && (
                    <>
                      <span aria-hidden="true"> ✓</span>
                      <span className="sr-only"> (palier atteint)</span>
                    </>
                  )}
                </span>
                <br />
                <span className="whitespace-nowrap">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

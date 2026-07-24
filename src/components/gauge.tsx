"use client";

import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";

type Marker = { value: number; label: string; reached: boolean };

/**
 * Jauge de collecte : le fond porte les quatre couleurs de la palette en
 * blocs plats ; un cache couleur `line` se retire vers la droite à l'entrée
 * dans le viewport pour révéler la part collectée.
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
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div ref={ref} className={className}>
      {/* Alternative programmatique (a11y) : la pile de <div> anonymes
          n'expose sinon ni la nature de jauge ni le taux de remplissage. */}
      <div
        role="img"
        aria-label={`${formatInt(value)} € collectés sur un objectif de ${formatInt(max)} €`}
        className="relative h-4 overflow-hidden"
        style={{
          background:
            "linear-gradient(90deg, var(--color-navy) 0 25%, var(--color-bottle) 25% 50%, var(--color-ocher) 50% 75%, var(--color-brick) 75% 100%)",
        }}
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
            // Borné : le palier sommet (value === max) tomberait sinon à
            // left:100 %, entièrement clippé par overflow-hidden (0.125rem = w-0.5).
            style={{ left: `min(${(m.value / max) * 100}%, calc(100% - 0.125rem))` }}
          />
        ))}
      </div>
      {/* Libellés des paliers : l'overlay positionné en pourcentages fait se
          chevaucher les derniers paliers (80/100 k€) sur un viewport étroit —
          sous `sm`, les mêmes entrées passent en liste empilée, lisible à
          320px ; l'overlay ne s'affiche qu'à partir de `sm`. */}
      <div className={`mt-2 text-xs ${tone === "dark" ? "text-paper/70" : "text-ink-soft"}`}>
        {/* role="list" : le preflight Tailwind pose list-style:none, ce qui
            fait retirer la sémantique de liste par Safari/VoiceOver. */}
        <ul role="list" className="flex flex-col gap-1 sm:hidden">
          {markers.map((m) => (
            <li key={m.value}>
              <span className={`font-semibold ${tone === "dark" ? "text-paper" : "text-ink"}`}>
                {formatInt(m.value)}&nbsp;€
                {m.reached && (
                  <>
                    <span aria-hidden="true"> ✓</span>
                    <span className="sr-only"> (palier atteint)</span>
                  </>
                )}
              </span>{" "}
              {m.label}
            </li>
          ))}
        </ul>
        <div className="relative hidden h-10 sm:block">
          {markers.map((m) => {
            const left = (m.value / max) * 100;
            return (
              <div
                key={m.value}
                className={`absolute top-0 ${left > 90 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center"}`}
                style={{ left: `${left}%` }}
              >
                <span className={`font-semibold ${tone === "dark" ? "text-paper" : "text-ink"}`}>
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

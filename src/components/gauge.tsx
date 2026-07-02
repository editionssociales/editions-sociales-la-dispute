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
 */
export function Gauge({
  value,
  max,
  markers,
  className = "",
}: {
  value: number;
  max: number;
  markers: Marker[];
  className?: string;
}) {
  const [ref, filled] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div ref={ref} className={className}>
      <div
        className="relative h-4 overflow-hidden rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-navy) 0 25%, var(--color-bottle) 25% 50%, var(--color-ocher) 50% 75%, var(--color-brick) 75% 100%)",
        }}
      >
        {/* Cache : recouvre la part non collectée, glisse vers la droite. */}
        <div
          className="absolute inset-y-0 right-0 bg-line transition-[left] duration-[1600ms] ease-out motion-reduce:transition-none"
          style={{ left: filled ? `${pct}%` : "0%" }}
        />
        {markers.map((m) => (
          <div
            key={m.value}
            className="absolute inset-y-0 w-0.5 bg-paper"
            style={{ left: `${(m.value / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative mt-2 h-10 text-xs text-ink-soft">
        {markers.map((m) => {
          const left = (m.value / max) * 100;
          return (
            <div
              key={m.value}
              className={`absolute top-0 ${left > 90 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center"}`}
              style={{ left: `${left}%` }}
            >
              <span className="font-semibold text-ink">
                {formatInt(m.value)}&nbsp;€{m.reached && " ✓"}
              </span>
              <br />
              <span className="whitespace-nowrap">{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

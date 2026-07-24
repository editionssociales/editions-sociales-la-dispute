"use client";

import { useState, type ReactNode } from "react";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Bascule TEMPORAIRE entre les deux vues des libellés du catalogue (retour
 * client 2026-07-23) : « rectangles simples » (liste uniforme, défaut) vs
 * « cases variables » (liste compacte pondérée). Le client compare les deux
 * en preview et tranche — retirer ce switch (et la vue perdante) une fois
 * l'arbitrage rendu. Les deux vues sont rendues côté serveur et passées en
 * props : ce sliver client ne porte que l'état de bascule.
 */
export function LibelleViewSwitch({
  simple,
  compact,
  className = "",
}: {
  simple: ReactNode;
  compact: ReactNode;
  className?: string;
}) {
  const [variable, setVariable] = useState(false);

  return (
    <div className={className}>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          aria-pressed={variable}
          onClick={() => setVariable((v) => !v)}
          className={`whitespace-nowrap border-2 border-ink px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-[.04em] transition-colors motion-reduce:transition-none ${variable ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(variable)}`}
        >
          Cases variables&nbsp;: {variable ? "on" : "off"}
        </button>
      </div>
      {variable ? compact : simple}
    </div>
  );
}

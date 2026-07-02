"use client";

import type { Accent } from "@/lib/format";
import { ACCENT_BG } from "@/lib/accents";

/** Un filtre actif, affiché en « chip » sous la zone de filtres. */
export interface FilterChip {
  /** Clé du paramètre d'URL à retirer (q, edition, collection, author). */
  param: string;
  /** Type de filtre, annoncé aux lecteurs d'écran. */
  type: string;
  /** Libellé lisible (issu des facettes ou de la liste des maisons). */
  label: string;
  /** Accent de la puce losange — une couleur par type de filtre. */
  accent: Accent;
}

/**
 * Rangée des filtres actifs : une chip par filtre, avec un bouton × pour le
 * retirer, et un lien « Tout effacer » dès qu'au moins un filtre est actif.
 */
export function FilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: FilterChip[];
  onRemove: (param: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <span className="sr-only">Filtres actifs&nbsp;:</span>
      {chips.map((chip) => (
        <span
          key={chip.param}
          className="inline-flex items-center gap-2 border border-line bg-paper-2 py-1 pl-3 pr-1 text-xs font-medium text-ink-soft"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rotate-45 ${ACCENT_BG[chip.accent]}`}
            aria-hidden="true"
          />
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.param)}
            aria-label={`Retirer le filtre ${chip.type} : ${chip.label}`}
            className="grid h-5 w-5 place-items-center text-sm leading-none text-muted transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ocher focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-semibold text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ocher focus-visible:outline-offset-2"
      >
        Tout effacer
      </button>
    </div>
  );
}

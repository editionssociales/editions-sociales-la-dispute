import { FramedGrid } from "@/components/framed-grid";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

/** Un filtre actif, affiché en « chip » sous la grille de thèmes/filtres. */
export interface FilterChip {
  /** Clé du paramètre d'URL à retirer (q, edition, collection, author, upcoming). */
  param: string;
  /** Type de filtre, annoncé aux lecteurs d'écran. */
  type: string;
  /** Libellé lisible (issu des facettes ou de la liste des maisons). */
  label: string;
}

/**
 * Rangée des filtres actifs — grille brutaliste : une cellule blanche par
 * filtre (bouton × pour le retirer), quadrillage noir 2px, cellule « Tout
 * effacer » dès qu'au moins un filtre est actif.
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
    <FramedGrid flow="flex" className="mt-[2px] items-stretch">
      <span className="sr-only">Filtres actifs&nbsp;:</span>
      {chips.map((chip) => (
        <span
          key={chip.param}
          className="inline-flex items-center gap-2 bg-paper py-1.5 pl-3 pr-1 text-[12px] font-bold uppercase tracking-[.03em] text-ink"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.param)}
            aria-label={`Retirer le filtre ${chip.type} : ${chip.label}`}
            className={`grid h-6 w-6 place-items-center border border-ink text-sm leading-none text-ink transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${FOCUS_RING_LIGHT_OUTER}`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={`bg-paper px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-[.03em] text-ink underline decoration-2 underline-offset-4 transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${FOCUS_RING_LIGHT_OUTER}`}
      >
        Tout effacer
      </button>
    </FramedGrid>
  );
}

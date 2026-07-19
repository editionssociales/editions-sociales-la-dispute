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
        <button
          key={chip.param}
          type="button"
          onClick={() => onRemove(chip.param)}
          aria-label={`Retirer le filtre ${chip.type} : ${chip.label}`}
          className={`inline-flex min-h-11 items-center gap-2 bg-paper pl-3.5 pr-3 text-[12px] font-bold uppercase tracking-[.03em] text-ink transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${FOCUS_RING_LIGHT_OUTER}`}
        >
          {chip.label}
          <span aria-hidden="true" className="text-sm leading-none">
            ×
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={`inline-flex min-h-11 items-center bg-paper px-3 text-[12px] font-extrabold uppercase tracking-[.03em] text-ink underline decoration-2 underline-offset-4 transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${FOCUS_RING_LIGHT_OUTER}`}
      >
        Tout effacer
      </button>
    </FramedGrid>
  );
}

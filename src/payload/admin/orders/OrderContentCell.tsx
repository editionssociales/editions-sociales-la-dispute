import { summarizeLines } from '../dashboard/derive.ts'

/**
 * Cellule "Contenu" de la liste Commandes — résumé compact des lignes
 * (`summarizeLines`, cœur pur partagé avec le dashboard : « 2× Titre A + 1×
 * Titre B + 2 autres »). Posée sur un champ `ui` dédié (`contenuResume`,
 * `Orders.ts`) plutôt que sur `lines` lui-même, pour la même raison que
 * `OrderClientCell.tsx` : la colonne doit s'intituler « Contenu » alors que
 * la section du formulaire garde son libellé « Lignes » (`field.label` sert
 * aux deux, un champ ne peut pas porter deux libellés distincts).
 *
 * `rowData` = le document COMPLET de la ligne de tableau (preuve
 * `renderCell.js` du framework), d'où la lecture de `rowData.lines` plutôt
 * que de `cellData` (qui vaudrait `undefined` ici — `contenuResume` n'a pas
 * de valeur en base). Composant serveur simple (aucune interactivité) : pas
 * de `'use client'`.
 */
interface OrderContentCellLine {
  titleSnapshot?: unknown
  quantity?: unknown
}

interface OrderContentCellProps {
  rowData?: {
    lines?: unknown
  }
}

export function OrderContentCell({ rowData }: OrderContentCellProps) {
  const rawLines = Array.isArray(rowData?.lines) ? (rowData.lines as OrderContentCellLine[]) : []
  const lines = rawLines.filter(
    (line): line is { titleSnapshot: string; quantity: number } =>
      typeof line?.titleSnapshot === 'string' && typeof line?.quantity === 'number',
  )
  const summary = summarizeLines(lines)
  return <span>{summary || '—'}</span>
}

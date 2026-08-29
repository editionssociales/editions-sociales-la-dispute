import { linesTooltip, summarizeLines } from '../dashboard/derive.ts'

/**
 * Cellule "Contenu" de la liste Commandes — résumé compact des lignes
 * (`summarizeLines`, cœur pur partagé avec le dashboard : « 2× Titre A + 1×
 * Titre B + 2 autres »), EN LIEN vers la fiche (même contrainte framework que
 * `OrderClientCell.tsx` : une Cell custom doit rendre son lien elle-même),
 * avec le détail COMPLET en infobulle INSTANTANÉE : `data-lignes` +
 * `custom.scss` — le `title` natif attendait ~1 s avant d'apparaître
 * (retour client 2026-08-29).
 *
 * Posée sur un champ `ui` dédié (`contenuResume`, `Orders.ts`) plutôt que sur
 * `lines` lui-même, pour la même raison que `OrderClientCell.tsx` : la
 * colonne doit s'intituler « Contenu » alors que la section du formulaire
 * garde son libellé « Lignes » (`field.label` sert aux deux, un champ ne peut
 * pas porter deux libellés distincts).
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
    id?: number | string
    lines?: unknown
  }
}

export function OrderContentCell({ rowData }: OrderContentCellProps) {
  const rawLines = Array.isArray(rowData?.lines) ? (rowData.lines as OrderContentCellLine[]) : []
  const lines = rawLines.filter(
    (line): line is { titleSnapshot: string; quantity: number } =>
      typeof line?.titleSnapshot === 'string' && typeof line?.quantity === 'number',
  )
  const label = summarizeLines(lines) || '—'
  const tooltip = lines.length > 0 ? linesTooltip(lines) : undefined
  const id = rowData?.id
  if (id == null) {
    return (
      <span className="order-lines-cell" data-lignes={tooltip}>
        {label}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office
    <a className="order-lines-cell" data-lignes={tooltip} href={`/admin/collections/orders/${id}`}>
      {label}
    </a>
  )
}

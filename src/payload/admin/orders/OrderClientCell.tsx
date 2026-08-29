/**
 * Cellule "Client" de la liste Commandes (`/admin/collections/orders`) —
 * affiche `shippingAddress.fullName` de la commande, EN LIEN vers la fiche.
 *
 * Le lien est posé PAR la cellule : Payload n'enveloppe que sa `DefaultCell`
 * dans le lien de première colonne (`renderCell.js` : la prop `link` est
 * transmise à une Cell custom mais jamais rendue à sa place) — depuis que
 * `number` a quitté les colonnes de liste, plus AUCUNE cellule n'ouvrait la
 * fiche (constat client 2026-08-29 : « plus cliquables nulle part »).
 *
 * Posée sur un champ `ui` dédié (`clientResume`, `Orders.ts`) plutôt que sur
 * le groupe `shippingAddress` ou un chemin imbriqué `defaultColumns:
 * ['shippingAddress.fullName']` (les deux fonctionnent, recon 2026-08-21) :
 * les deux donneraient un EN-TÊTE DE COLONNE dérivé du libellé du champ
 * (« Nom complet » ou « Adresse de livraison > Nom complet »), jamais
 * « Client » — le champ `fullName` est aussi partagé avec `billingAddress`
 * (factory `addressFields()`), le renommer casserait ce libellé côté
 * facturation.
 *
 * `rowData` = le document COMPLET de la ligne de tableau (preuve
 * `renderCell.js` du framework — `cellData` vaudrait `undefined` ici,
 * `clientResume` n'a pas de valeur en base). Composant serveur simple
 * (aucune interactivité) : pas de `'use client'`.
 */
interface OrderClientCellProps {
  rowData?: {
    id?: number | string
    shippingAddress?: {
      fullName?: unknown
    }
  }
}

export function OrderClientCell({ rowData }: OrderClientCellProps) {
  const fullName = rowData?.shippingAddress?.fullName
  const label = typeof fullName === 'string' && fullName.trim() ? fullName : '—'
  const id = rowData?.id
  if (id == null) return <span>{label}</span>
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office
    <a href={`/admin/collections/orders/${id}`}>{label}</a>
  )
}

/**
 * Cellule "Client" de la liste Commandes (`/admin/collections/orders`) —
 * affiche `shippingAddress.fullName` de la commande. Posée sur un champ `ui`
 * dédié (`clientResume`, `Orders.ts`) plutôt que directement sur le groupe
 * `shippingAddress` ou via un chemin imbriqué `defaultColumns:
 * ['shippingAddress.fullName']` (les deux fonctionnent, recon 2026-08-21) :
 * les deux donneraient un EN-TÊTE DE COLONNE dérivé du libellé du champ
 * (« Nom complet » ou « Adresse de livraison > Nom complet »), jamais
 * « Client » — le champ `fullName` est aussi partagé avec `billingAddress`
 * (factory `addressFields()`), le renommer casserait ce libellé côté
 * facturation. Un champ `ui` séparé découple entièrement le libellé de
 * colonne du libellé de formulaire (même logique que `OrderContentCell.tsx`
 * pour « Contenu »/« Lignes »).
 *
 * `rowData` = le document COMPLET de la ligne de tableau (preuve
 * `renderCell.js` du framework — `cellData` vaudrait `undefined` ici,
 * `clientResume` n'a pas de valeur en base). Composant serveur simple
 * (aucune interactivité) : pas de `'use client'`.
 */
interface OrderClientCellProps {
  rowData?: {
    shippingAddress?: {
      fullName?: unknown
    }
  }
}

export function OrderClientCell({ rowData }: OrderClientCellProps) {
  const fullName = rowData?.shippingAddress?.fullName
  return <span>{typeof fullName === 'string' && fullName.trim() ? fullName : '—'}</span>
}

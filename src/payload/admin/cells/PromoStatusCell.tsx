import { Pill } from '@payloadcms/ui'

import { isPromoExpired } from '../../../lib/promo-core.ts'

/**
 * Cellule « État » de la liste des codes promo (audit UX — manque n°1 :
 * aucune colonne ne dit « en cours en ce moment »). Posée comme champ `ui`
 * en tête de `PromoCodes.fields` ; croise `active`/`expiresAt` via
 * `isPromoExpired` (`src/lib/promo-core.ts`) — LE MÊME prédicat que le
 * checkout (`evaluatePromoCode`) et le dashboard (`derive.ts:splitPromos`),
 * jamais une réimplémentation locale du jour-inclusif.
 *
 * Composant serveur pur (aucune interaction) : `Pill` (`@payloadcms/ui`) est
 * un composant client, mais un composant serveur peut le rendre directement
 * — même motif que `Dashboard.tsx`/`HealthPage.tsx`.
 */
export function PromoStatusCell({
  rowData,
}: {
  rowData?: { active?: boolean | null; expiresAt?: string | null }
}) {
  const active = rowData?.active === true

  if (!active) {
    return (
      <Pill pillStyle="light-gray" size="small">
        Inactif
      </Pill>
    )
  }

  if (isPromoExpired(rowData?.expiresAt, new Date())) {
    return (
      <Pill pillStyle="error" size="small">
        Expiré
      </Pill>
    )
  }

  return (
    <Pill pillStyle="success" size="small">
      En cours
    </Pill>
  )
}

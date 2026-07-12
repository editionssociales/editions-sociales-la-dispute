'use client'

import { useState } from 'react'

/**
 * Panneau « Export CSV » au-dessus de la liste des commandes (mission
 * « exports compta + livraison de la PR », plan §4 étape 10). Les deux
 * profils sont de simples liens de téléchargement `GET` — la session admin
 * est déjà portée par le cookie Payload, pas besoin de fetch+blob (même
 * principe qu'un lien natif Payload).
 *
 * Bornes de dates optionnelles (`AAAA-MM-JJ`, `<input type="date">`) : vides
 * = toutes les commandes. Cf. `order-export-handler.ts` pour le détail des
 * deux profils.
 */
export function OrderExportPanel() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function href(profile: 'preparation' | 'compta'): string {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return `/api/orders/export/${profile}${qs ? `?${qs}` : ''}`
  }

  return (
    <div
      style={{
        margin: '1rem 0',
        padding: '1rem',
        border: '1px solid var(--theme-border-color, #ccc)',
        borderRadius: 4,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Export CSV des commandes</h3>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Du{' '}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Au{' '}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <a href={href('preparation')}>Télécharger « préparation »</a>
        <a href={href('compta')}>Télécharger « compta »</a>
      </div>
      <p style={{ marginBottom: 0, color: 'var(--theme-elevation-500, #666)' }}>
        Bornes vides = toutes les commandes. « Préparation » : décalque du profil Advanced Order
        Export historique (statuts « payée »/« préparée » uniquement). « Compta » : toutes
        commandes, TVA 5,5 % ventilée — colonnes des deux profils encore à valider avec la
        personne compta du client (décision n°5, plan §4).
      </p>
    </div>
  )
}

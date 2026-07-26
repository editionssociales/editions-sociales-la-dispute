'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { Button, toast } from '@payloadcms/ui'

import styles from './dashboard.module.css'

/**
 * Îlot client « désactiver en un clic » d'un code promo expiré encore actif
 * (complément 3.11 du dashboard v2) : `PATCH /api/promo-codes/:id`
 * (`active: false`, cookie Payload, access `update: isAdminOrEditor`) puis
 * `router.refresh()` — la ligne disparaît du RSC rechargé. Aucun nouveau
 * champ : le calcul « expiré » vit côté panneau (`derive.ts`).
 *
 * `Button`/`toast` de `@payloadcms/ui` (issue #89) : un `<button>` brut
 * n'héritait d'aucun style admin, et l'échec ne remontait qu'en paragraphe
 * muet — `toast.error` porte une région live (annoncée aux lecteurs d'écran).
 */
export function PromoDeactivateButton({ id }: { id: number }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function deactivate() {
    setPending(true)
    try {
      const res = await fetch(`/api/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: false }),
      })
      if (!res.ok) {
        toast.error('Échec de la désactivation.')
        return
      }
      router.refresh()
    } catch {
      toast.error('Échec de la désactivation (réseau).')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={styles.pushRight}>
      <Button type="button" buttonStyle="secondary" size="small" onClick={deactivate} disabled={pending}>
        {pending ? 'Désactivation…' : 'Désactiver'}
      </Button>
    </span>
  )
}

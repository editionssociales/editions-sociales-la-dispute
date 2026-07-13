'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import styles from './dashboard.module.css'

/**
 * Îlot client « désactiver en un clic » d'un code promo expiré encore actif
 * (complément 3.11 du dashboard v2) : `PATCH /api/promo-codes/:id`
 * (`active: false`, cookie Payload, access `update: isAdminOrEditor`) puis
 * `router.refresh()` — la ligne disparaît du RSC rechargé. Aucun nouveau
 * champ : le calcul « expiré » vit côté panneau (`derive.ts`).
 */
export function PromoDeactivateButton({ id }: { id: number }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deactivate() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: false }),
      })
      if (!res.ok) {
        setError('Échec de la désactivation.')
        return
      }
      router.refresh()
    } catch {
      setError('Échec de la désactivation (réseau).')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={styles.pushRight}>
      <button type="button" onClick={deactivate} disabled={pending}>
        {pending ? 'Désactivation…' : 'Désactiver'}
      </button>
      {error && <span className={styles.errorText}> {error}</span>}
    </span>
  )
}

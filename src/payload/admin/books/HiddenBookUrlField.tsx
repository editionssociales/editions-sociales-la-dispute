'use client'

import { useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useEffect, useRef, useState } from 'react'

import { bookFichePath } from '../../../lib/book-fiche-path.ts'
import { SITE_URL } from '../../../lib/mail-shell.ts'

/**
 * Adresse EXACTE d'une fiche masquée, affichée sous la case « Masquer du
 * catalogue » dès qu'elle est cochée (champ `ui` de `Books.ts`, `condition`
 * sur `masque`). Un livre masqué n'est joignable que par cette adresse : on la
 * donne à copier au moment même où l'équipe le masque, avec le domaine
 * canonique du site (`SITE_URL`, celui vers lequel tous les anciens domaines
 * redirigent) — jamais l'hôte de l'admin, qui peut être un déploiement
 * intermédiaire. Le chemin vient de `bookFichePath`, la règle unique des
 * fiches (maison → `/catalogue/<maison>/<slug>`, boutique → `/boutique/<slug>`).
 */
export const HiddenBookUrlField: UIFieldClientComponent = () => {
  const path = useFormFields(([fields]) =>
    bookFichePath({
      slug: fields.slug?.value as string | undefined,
      edition: fields.edition?.value as string | undefined,
      origin: fields.origin?.value as string | undefined,
    }),
  )
  const status = useFormFields(([fields]) => fields._status?.value as string | undefined)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  const url = path ? `${SITE_URL}${path}` : null

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current != null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Presse-papiers refusé : l'adresse reste affichée et sélectionnable.
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        padding: '12px',
        marginBottom: 'var(--base)',
        fontSize: '13px',
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: '0 0 8px' }}>
        <strong>Masqué.</strong> Ce livre n’apparaît plus nulle part sur le site (catalogue,
        recherche, accueil, plan du site) mais reste <strong>achetable</strong> et son adresse
        ne change pas : seule cette adresse y mène.
      </p>
      {url ? (
        <>
          <code
            style={{
              display: 'block',
              padding: '6px 8px',
              background: 'var(--theme-bg)',
              border: '1px solid var(--theme-elevation-150)',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {url}
          </code>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
            <button type="button" className="btn btn--style-secondary btn--size-small" onClick={copy}>
              <span className="btn__content">{copied ? 'Adresse copiée ✓' : 'Copier l’adresse'}</span>
            </button>
            <a href={url} target="_blank" rel="noreferrer">
              Ouvrir la fiche ↗
            </a>
          </div>
          {status === 'draft' && (
            <p style={{ margin: '8px 0 0', color: 'var(--theme-warning-500)' }}>
              Fiche en brouillon : l’adresse ne fonctionnera qu’une fois la fiche publiée.
            </p>
          )}
        </>
      ) : (
        <p style={{ margin: 0 }}>
          L’adresse s’affichera ici dès que le slug (et la maison, ou l’origine « Boutique »)
          seront renseignés.
        </p>
      )}
    </div>
  )
}

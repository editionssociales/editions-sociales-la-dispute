'use client'

import { useEffect, useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import styles from '../dashboard/dashboard.module.css'

interface AuthorOption {
  id: number
  name: string
}

const EDITIONS: { value: string; label: string }[] = [
  { value: 'editions-sociales', label: 'Éditions sociales' },
  { value: 'la-dispute', label: 'La Dispute' },
]

/**
 * Formulaire client de la création guidée (issue #26, vue
 * `/admin/nouveau-livre`) — 7 champs au plus (titre, maison, auteur·rice·s,
 * couverture, date de parution, prix et stock optionnels). Soumission en
 * deux temps :
 *
 * 1. `POST /api/media` (multipart, convention REST Payload : fichier sous la
 *    clé `file`, reste des données sous `_payload` en JSON — cf.
 *    `addDataAndFileToRequest.js`) pour obtenir l'id de la couverture
 *    fraîchement créée (`Media.ts` : `alt` posé au titre saisi).
 * 2. `POST /api/books/create-draft` (`book-draft-handler.ts`) référençant cet
 *    id, puis redirection vers la fiche (`router.push`) — jamais publiée
 *    directement (`_status: 'draft'` posé côté serveur).
 *
 * Auteur·rice·s chargé·e·s au montage (`GET /api/authors?limit=200&sort=
 * name&depth=0`) plutôt que côté serveur : la vue reste un simple wrapper de
 * chrome (`NewBookView.tsx`), tout l'état du formulaire vit ici.
 */
export function NewBookForm() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [edition, setEdition] = useState('')
  const [authorOptions, setAuthorOptions] = useState<AuthorOption[]>([])
  const [authorsLoadError, setAuthorsLoadError] = useState<string | null>(null)
  const [selectedAuthors, setSelectedAuthors] = useState<number[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [dateParution, setDateParution] = useState('')
  const [prix, setPrix] = useState('')
  const [stock, setStock] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadAuthors() {
      try {
        const res = await fetch('/api/authors?limit=200&sort=name&depth=0', {
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !Array.isArray(json?.docs)) throw new Error()
        if (!cancelled) {
          setAuthorOptions(
            (json.docs as { id: number; name: string }[]).map((doc) => ({
              id: doc.id,
              name: doc.name,
            })),
          )
        }
      } catch {
        if (!cancelled) setAuthorsLoadError('Liste des auteur·rice·s indisponible — réessayez.')
      }
    }
    loadAuthors()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleAuthor(id: number) {
    setSelectedAuthors((current) =>
      current.includes(id) ? current.filter((a) => a !== id) : [...current, id],
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Le titre est obligatoire.')
      return
    }
    if (!edition) {
      setError('La maison est obligatoire.')
      return
    }
    if (selectedAuthors.length === 0) {
      setError('Au moins un·e auteur·rice est requis·e.')
      return
    }
    if (!coverFile) {
      setError('La couverture est obligatoire.')
      return
    }
    if (!dateParution) {
      setError('La date de parution est obligatoire.')
      return
    }

    setPending(true)
    try {
      const coverBody = new FormData()
      coverBody.append('file', coverFile)
      coverBody.append('_payload', JSON.stringify({ alt: trimmedTitle }))
      const coverRes = await fetch('/api/media', {
        method: 'POST',
        body: coverBody,
        credentials: 'include',
      })
      const coverJson = await coverRes.json()
      if (!coverRes.ok || typeof coverJson?.doc?.id !== 'number') {
        setError(
          typeof coverJson?.errors?.[0]?.message === 'string'
            ? coverJson.errors[0].message
            : 'Échec de l’envoi de la couverture.',
        )
        return
      }

      const res = await fetch('/api/books/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: trimmedTitle,
          edition,
          authors: selectedAuthors,
          coverId: coverJson.doc.id,
          dateParution,
          ...(prix ? { prix: Number(prix) } : {}),
          ...(stock ? { stock: Number(stock) } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Échec de la création du brouillon.')
        return
      }
      router.push(`/admin/collections/books/${json.id}`)
    } catch {
      setError('Échec de la création (réseau).')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.formRow}>
        <label>
          Titre{' '}
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
      </div>

      <div className={styles.formRow}>
        <label>
          Maison{' '}
          <select value={edition} onChange={(event) => setEdition(event.target.value)} required>
            <option value="">Choisir…</option>
            {EDITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className={styles.muted}>Auteur·rice·s</p>
        {authorsLoadError && <p className={styles.errorText}>{authorsLoadError}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {authorOptions.map((author) => (
            <label key={author.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={selectedAuthors.includes(author.id)}
                onChange={() => toggleAuthor(author.id)}
              />
              {author.name}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.formRow}>
        <label>
          Couverture{' '}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
            required
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label>
          Date de parution{' '}
          <input
            type="date"
            value={dateParution}
            onChange={(event) => setDateParution(event.target.value)}
            required
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label>
          Prix (€){' '}
          <input
            type="number"
            min="0"
            step="0.01"
            value={prix}
            onChange={(event) => setPrix(event.target.value)}
          />
        </label>
        <label>
          Stock{' '}
          <input
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(event) => setStock(event.target.value)}
          />
        </label>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.actions}>
        <button type="submit" disabled={pending}>
          {pending ? 'Création en cours…' : 'Créer le brouillon'}
        </button>
      </div>
    </form>
  )
}

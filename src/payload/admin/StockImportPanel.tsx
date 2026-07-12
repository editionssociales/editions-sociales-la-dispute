'use client'

import { useState, type FormEvent } from 'react'

/** Forme de la réponse `POST /api/books/import-stock` (cf. `StockImportResult`, `stock-import.ts`). */
interface StockImportReport {
  matched: { bookId: number; slug: string; title: string; stock: number }[]
  routerRowsWithoutBook: number
  missingOnlineBooks: { id: number; slug: string; title: string; isbn: string | null }[]
  updatedCount: number
}

/**
 * Vue/composant admin « Import stock » (mission point 1) : dépose le
 * classeur .xls du routeur, poste en multipart vers l'endpoint custom de la
 * collection `books`, affiche le rapport (X mis à jour · Y lignes routeur
 * sans fiche · Z fiches en ligne absentes du fichier — listées, c'est
 * l'alerte qui compte).
 */
export function StockImportPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<StockImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return

    setPending(true)
    setError(null)
    setReport(null)

    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/books/import-stock', {
        method: 'POST',
        body,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Échec de l’import.')
        return
      }
      setReport(json as StockImportReport)
    } catch {
      setError('Échec de l’import (réseau).')
    } finally {
      setPending(false)
    }
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
      <h3 style={{ marginTop: 0 }}>Import stock routeur</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="file"
          accept=".xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={!file || pending}>
          {pending ? 'Import en cours…' : 'Importer'}
        </button>
      </form>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {report && (
        <div style={{ marginTop: '1rem' }}>
          <p>
            <strong>{report.updatedCount}</strong> mis à jour ·{' '}
            <strong>{report.routerRowsWithoutBook}</strong> ligne(s) routeur sans fiche en ligne
            (normal, backlist) · <strong>{report.missingOnlineBooks.length}</strong> fiche(s) vendue(s)
            en ligne absente(s) du fichier
          </p>
          {report.missingOnlineBooks.length > 0 && (
            <>
              <p>
                <strong>Fiches en ligne absentes du fichier routeur (à vérifier) :</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {report.missingOnlineBooks.map((book) => (
                  <li key={book.id}>
                    {book.title} {book.isbn ? `(ISBN ${book.isbn})` : '(sans ISBN)'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

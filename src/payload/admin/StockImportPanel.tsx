'use client'

import { useState, type FormEvent } from 'react'

/** Forme de la réponse `POST /api/books/import-stock` (cf. `StockImportResult`, `stock-import.ts`). */
interface StockImportReport {
  matched: { bookId: number; slug: string; title: string; stock: number }[]
  routerRowsWithoutBook: number
  manualBooksNotInFile: { id: number; slug: string; title: string; isbn: string | null }[]
  routerBooksMissingFromFile: { id: number; slug: string; title: string; isbn: string | null }[]
  updatedCount: number
}

/**
 * Vue/composant admin « Import stock » (mission point 1) : dépose le
 * classeur .xls du routeur, poste en multipart vers l'endpoint custom de la
 * collection `books`, affiche le rapport en quatre sections (décision client
 * du 12/07) : mises à jour (suivi routeur) · lignes routeur sans fiche en
 * ligne (backlist, normal) · fiches en suivi manuel absentes du fichier
 * (normal, informatif) · fiches anciennement suivies routeur absentes du
 * nouveau fichier (LA vraie alerte — titre disparu du routeur).
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
            <strong>{report.updatedCount}</strong> mise(s) à jour (suivi routeur) ·{' '}
            <strong>{report.routerRowsWithoutBook}</strong> ligne(s) routeur sans fiche en ligne
            (backlist, normal) · <strong>{report.manualBooksNotInFile.length}</strong> fiche(s) en
            suivi manuel absente(s) du fichier (normal) ·{' '}
            <strong>{report.routerBooksMissingFromFile.length}</strong> fiche(s) suivie(s) routeur
            disparue(s) du fichier
          </p>

          {report.routerBooksMissingFromFile.length > 0 && (
            <>
              <p style={{ color: '#b00020' }}>
                <strong>
                  ⚠️ Fiches suivies routeur absentes du nouveau fichier (titre disparu du routeur —
                  stock conservé tel quel, alerte reconduite à chaque import tant que non résolue) :
                </strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#b00020' }}>
                {report.routerBooksMissingFromFile.map((book) => (
                  <li key={book.id}>
                    {book.title} {book.isbn ? `(ISBN ${book.isbn})` : '(sans ISBN)'}
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.manualBooksNotInFile.length > 0 && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary>
                Fiches en suivi manuel absentes du fichier — normal, à titre informatif (
                {report.manualBooksNotInFile.length})
              </summary>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {report.manualBooksNotInFile.map((book) => (
                  <li key={book.id}>
                    {book.title} {book.isbn ? `(ISBN ${book.isbn})` : '(sans ISBN)'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

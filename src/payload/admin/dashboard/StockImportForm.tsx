'use client'

import { useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import styles from './dashboard.module.css'

/** Forme de la réponse `POST /api/books/import-stock` (cf. `StockImportResult`, `stock-import.ts`). */
interface StockImportReport {
  matched: { bookId: number; slug: string; title: string; stock: number }[]
  routerRowsWithoutBook: number
  manualBooksNotInFile: { id: number; slug: string; title: string; isbn: string | null }[]
  routerBooksMissingFromFile: { id: number; slug: string; title: string; isbn: string | null }[]
  updatedCount: number
}

/**
 * Îlot client du panneau « Import routeur » (3.7, admin) : dépose le classeur
 * .xls du routeur, poste en multipart vers l'endpoint custom de `books`,
 * affiche le rapport en quatre sections (décision client du 12/07) — mises à
 * jour · lignes routeur sans fiche (backlist, normal) · fiches en suivi
 * manuel absentes (normal) · fiches anciennement suivies routeur disparues
 * (LA vraie alerte). Après succès, `router.refresh()` recharge le RSC : le
 * bloc « dernier import » du panneau reflète le run tout juste persisté
 * (`import-runs`).
 */
export function StockImportForm() {
  const router = useRouter()
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
      router.refresh()
    } catch {
      setError('Échec de l’import (réseau).')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className={styles.formRow}>
        <input
          type="file"
          accept=".xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={!file || pending}>
          {pending ? 'Import en cours…' : 'Importer'}
        </button>
      </form>

      {error && <p className={styles.errorText}>{error}</p>}

      {report && (
        <div>
          <p className={styles.kbdNote}>
            <strong>{report.updatedCount}</strong> mise(s) à jour (suivi routeur) ·{' '}
            <strong>{report.routerRowsWithoutBook}</strong> ligne(s) routeur sans fiche en ligne
            (backlist, normal) · <strong>{report.manualBooksNotInFile.length}</strong> fiche(s) en
            suivi manuel absente(s) du fichier (normal) ·{' '}
            <strong>{report.routerBooksMissingFromFile.length}</strong> fiche(s) suivie(s) routeur
            disparue(s) du fichier
          </p>

          {report.routerBooksMissingFromFile.length > 0 && (
            <>
              <p className={styles.alertText}>
                <strong>
                  ⚠️ Fiches suivies routeur absentes du nouveau fichier (titre disparu du routeur —
                  stock conservé tel quel, alerte reconduite à chaque import tant que non résolue) :
                </strong>
              </p>
              <ul className={`${styles.reportList} ${styles.alertText}`}>
                {report.routerBooksMissingFromFile.map((book) => (
                  <li key={book.id}>
                    {book.title} {book.isbn ? `(ISBN ${book.isbn})` : '(sans ISBN)'}
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.manualBooksNotInFile.length > 0 && (
            <details className={styles.detailsBlock}>
              <summary>
                Fiches en suivi manuel absentes du fichier — normal, à titre informatif (
                {report.manualBooksNotInFile.length})
              </summary>
              <ul className={styles.reportList}>
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

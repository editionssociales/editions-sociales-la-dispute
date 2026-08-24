'use client'

import { useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import { Button, toast } from '@payloadcms/ui'

import styles from '../dashboard/dashboard.module.css'

/** Forme de la réponse `POST /api/virements-souscription/import` (cf. `VirementsImportResult`, `virements-import.ts`). */
interface VirementsImportReport {
  lues: number
  creees: number
  misesAJour: number
  inchangees: number
  ignorees: { ligne: number; raison: string }[]
  orphelines: { id: number; nom: string; montantEUR: number; date: string }[]
  totalEUR: number
}

/** Euros à la française, sans dépendre d'un helper front (le back-office n'importe pas `src/lib/format`). */
function euros(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
}

/**
 * Panneau « Import du fichier Excel » au-dessus de la liste des virements
 * (slot `beforeListTable` de `VirementsSouscription.ts` — la clé d'importMap
 * `chemin#export` de ce fichier ne doit pas changer). Même geste que l'import
 * routeur (`dashboard/StockImportForm.tsx`) : dépôt multipart, rapport
 * affiché sur place, `router.refresh()` pour que la liste sous le panneau
 * reflète l'import.
 *
 * Le rapport dit TOUT ce que l'import a fait, y compris ce qu'il n'a pas su
 * lire : les lignes écartées sortent avec leur NUMÉRO DE LIGNE Excel, pour
 * que l'équipe corrige son fichier et réimporte (l'import est idempotent).
 */
export function VirementsImportPanel() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<VirementsImportReport | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return

    setPending(true)
    setReport(null)

    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/virements-souscription/import', {
        method: 'POST',
        body,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(typeof json?.error === 'string' ? json.error : 'Échec de l’import.')
        return
      }
      setReport(json as VirementsImportReport)
      router.refresh()
    } catch {
      toast.error('Échec de l’import (réseau).')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Import du fichier de suivi (Excel)</h3>

      <form onSubmit={handleSubmit} className={styles.formRow}>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button type="submit" buttonStyle="secondary" size="small" disabled={!file || pending}>
          {pending ? 'Import en cours…' : 'Importer'}
        </Button>
      </form>

      <p className={styles.muted}>
        Colonnes attendues : <strong>date</strong>, <strong>nom</strong>,{' '}
        <strong>montant</strong>, <strong>choix de la souscription</strong> (l’ordre n’a pas
        d’importance ; les colonnes e-mail et notes sont facultatives). Réimportez le fichier
        entier après chaque ajout : les lignes déjà présentes ne sont jamais dupliquées, et
        rien n’est supprimé.
      </p>

      {report && (
        <div>
          <p className={styles.kbdNote}>
            <strong>{report.lues}</strong> ligne(s) lue(s) · <strong>{report.creees}</strong>{' '}
            ajoutée(s) · <strong>{report.misesAJour}</strong> mise(s) à jour ·{' '}
            <strong>{report.inchangees}</strong> déjà à jour · total des virements :{' '}
            <strong>{euros(report.totalEUR)}</strong>
          </p>

          {report.ignorees.length > 0 && (
            <>
              <p className={styles.alertText}>
                <strong>
                  ⚠️ Ligne(s) non importée(s) — corrigez le fichier puis réimportez-le :
                </strong>
              </p>
              <ul className={`${styles.reportList} ${styles.alertText}`}>
                {report.ignorees.map((issue) => (
                  <li key={issue.ligne}>
                    Ligne {issue.ligne} — {issue.raison}
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.orphelines.length > 0 && (
            <details className={styles.detailsBlock}>
              <summary>
                Virement(s) déjà en base absent(s) du fichier — conservé(s) et toujours comptés
                dans la jauge ({report.orphelines.length})
              </summary>
              <ul className={styles.reportList}>
                {report.orphelines.map((doc) => (
                  <li key={doc.id}>
                    {doc.nom} — {euros(doc.montantEUR)} {doc.date ? `(${doc.date})` : ''}
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

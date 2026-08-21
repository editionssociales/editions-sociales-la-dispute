import { Pill } from '@payloadcms/ui'

/**
 * Cellule « Live » de la liste des mises en avant — dit si LA bannière
 * serait affichée aujourd'hui sur la page d'accueil : `actif` coché ET la
 * date du jour comprise dans `[dateDebut, dateFin]` (comparaison en JOUR,
 * `YYYY-MM-DD`, pas à l'horodatage exact — mêmes bornes `dayOnly` que la
 * fiche, cf. `Highlight.ts`).
 *
 * Duplique VOLONTAIREMENT le prédicat de fenêtre déjà inline dans
 * `src/lib/highlight.ts:getActiveHighlight` (son `docs.find`) : ce module
 * est un lecteur I/O `server-only` (Local API Payload, `@payload-config`),
 * pas un cœur pur exporté — l'importer proprement dans une cellule d'admin
 * qui doit rester un affichage synchrone n'est pas possible sans tirer toute
 * la Local API dans le rendu de liste. Si la fenêtre de `getActiveHighlight`
 * change un jour, répercuter le même changement ici (deux endroits, un seul
 * concept — pas d'autre duplication ailleurs dans le repo).
 */
function isLiveToday(actif: boolean, dateDebut?: string | null, dateFin?: string | null): boolean {
  if (!actif || !dateDebut || !dateFin) return false
  const today = new Date().toISOString().slice(0, 10)
  return dateDebut.slice(0, 10) <= today && dateFin.slice(0, 10) >= today
}

export function HighlightLiveCell({
  rowData,
}: {
  rowData?: { actif?: boolean | null; dateDebut?: string | null; dateFin?: string | null }
}) {
  const live = isLiveToday(rowData?.actif === true, rowData?.dateDebut, rowData?.dateFin)

  return live ? (
    <Pill pillStyle="success" size="small">
      Live aujourd’hui
    </Pill>
  ) : (
    <Pill pillStyle="light-gray" size="small">
      Non
    </Pill>
  )
}

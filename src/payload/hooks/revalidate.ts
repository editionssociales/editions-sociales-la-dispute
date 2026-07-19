import { revalidatePath, revalidateTag } from 'next/cache'

import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/**
 * Invalidation du cache Next à la sauvegarde back-office (E6 du plan).
 *
 * Choix de mécanisme (à confirmer dans node_modules/next/dist/docs/01-app/
 * 02-guides au moment de coder, cf. AGENTS.md — fait) : les pages `(site)`
 * ne lisent jamais Payload en direct, elles passent par la façade
 * `src/lib/catalogue.ts`, elle-même consommée par des pages en ISR
 * classique — `export const revalidate = 3600` (voir chaque page.tsx), pas
 * Les pages ISR classiques s'appuient sur `revalidatePath` (soft tags de
 * route). En plus, `getAllBooks` pose un data-cache tagué `catalogue`
 * (`unstable_cache`) — indispensable pour les vues catalogue dynamiques
 * (`searchParams` → `no-store`) qui sinon rechargeraient Postgres à chaque
 * MISS. Les deux leviers sont donc nécessaires.
 *
 * `revalidatePath(pattern, 'page')` cible **tous** les rendus d'un même
 * fichier de page, quel que soit le paramètre dynamique (édition, slug) —
 * le premier argument doit alors reprendre le chemin de fichier réel sous
 * `src/app`, groupe de routes inclus (`(site)`), comme documenté par
 * l'exemple officiel `revalidatePath('/(main)/blog/[slug]', 'page')`.
 * Les chemins littéraux (page d'accueil, listes) n'ont pas besoin du
 * groupe : ils correspondent à l'URL réellement visitée.
 */
const CATALOGUE_LITERAL_PATHS = ['/', '/catalogue', '/editions']
const CATALOGUE_PAGE_PATTERNS = [
  '/(site)/catalogue/[edition]',
  '/(site)/catalogue/[edition]/[slug]',
  '/(site)/editions/[slug]',
]

/** Revalide toutes les pages qui peuvent afficher un livre/auteur/collection/média. */
function revalidateCatalogueRoutes(): void {
  revalidateTag('catalogue', 'max')
  for (const path of CATALOGUE_LITERAL_PATHS) revalidatePath(path)
  for (const pattern of CATALOGUE_PAGE_PATTERNS) revalidatePath(pattern, 'page')
}

/** Revalide la seule page d'accueil (bandeau de mise en avant, E6bis). */
function revalidateHome(): void {
  revalidatePath('/')
}

/**
 * Hooks `books`/`authors`/`libelles`/`media` : toute fiche de ces
 * collections peut apparaître sur n'importe quelle page catalogue (listes,
 * facettes, fiche détail) — on revalide donc large plutôt que de tenter un
 * ciblage fin par relation inverse (hors budget de cette étape, 0,5 j).
 *
 * Garde **en tête** de chaque hook : neutralisé pendant l'import de
 * migration (`context.disableRevalidate`, posé par
 * `scripts/migrate-catalogue`, E3) — sans quoi le premier import réel
 * (295 fiches) déclencherait ~295 revalidations en série depuis un script
 * `payload run` hors requête HTTP (et lèverait l'invariant Next
 * « static generation store missing », faute de contexte de rendu).
 */
export const revalidateCatalogueAfterChange: CollectionAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateCatalogueRoutes()
}

export const revalidateCatalogueAfterDelete: CollectionAfterDeleteHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateCatalogueRoutes()
}

/** Hooks `highlight` (E6bis) : seule la page d'accueil affiche le bandeau. */
export const revalidateHomeAfterChange: CollectionAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateHome()
}

export const revalidateHomeAfterDelete: CollectionAfterDeleteHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateHome()
}

/*
 * Hooks des globals « Contenus du site » (spec « éditeur de contenus ») :
 * chaque global ne nourrit que des chemins littéraux connus d'avance — on
 * revalide exactement ceux-là, avec la même garde `disableRevalidate` que
 * les hooks de collections (aucun import de masse prévu sur ces globals,
 * mais le contrat d'écriture Payload du repo reste uniforme).
 */

/** Pages nourries par le global `pages-legales` — trois chemins littéraux. */
const LEGAL_PATHS = ['/cgv', '/mentions-legales', '/confidentialite']

/** Hook `pages-legales` : seules les trois pages légales lisent ce global. */
export const revalidatePagesLegalesAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  for (const path of LEGAL_PATHS) revalidatePath(path)
}

/**
 * Hook `reglages-site` : metadata par défaut + pied de page sont rendus par
 * le layout racine `(site)` — toutes les pages du site sont concernées, on
 * revalide le layout entier (`revalidatePath('/', 'layout')`).
 */
export const revalidateSiteLayoutAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/', 'layout')
}

/** Hook `page-a-propos` : seule la page À propos lit ce global. */
export const revalidateAProposAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/a-propos')
}

/** Hook `page-souscription` : seule la page Souscription lit ce global. */
export const revalidateSouscriptionAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/souscription')
}

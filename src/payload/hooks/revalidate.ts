import { revalidatePath } from 'next/cache'

import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/**
 * Invalidation ISR (purge par chemin) à la sauvegarde back-office (E6 du
 * plan).
 *
 * Choix de mécanisme (à confirmer dans node_modules/next/dist/docs/01-app/
 * 02-guides au moment de coder, cf. AGENTS.md — fait) : les pages `(site)`
 * ne lisent jamais Payload en direct, elles passent par la façade
 * `src/lib/catalogue.ts`, elle-même consommée par des pages en ISR
 * classique — `export const revalidate = 3600` (voir chaque page.tsx). Les
 * pages ISR classiques s'appuient sur `revalidatePath` (soft tags de
 * route) — ce fichier ne gère QUE ce levier ; l'autre (`getAllBooks`/
 * `getBook` posent un data-cache tagué `catalogue`, `unstable_cache`,
 * indispensable pour les vues catalogue dynamiques — `searchParams` →
 * `no-store` — qui sinon rechargeraient Postgres à chaque MISS) vit dans
 * `revalidate-catalogue.ts`. Les deux leviers sont nécessaires en parallèle,
 * aucun ne recouvre l'autre.
 *
 * `revalidatePath(pattern, 'page')` cible **tous** les rendus d'un même
 * fichier de page, quel que soit le paramètre dynamique (édition, slug) —
 * le premier argument doit alors reprendre le chemin de fichier réel sous
 * `src/app`, groupe de routes inclus (`(site)`), comme documenté par
 * l'exemple officiel `revalidatePath('/(main)/blog/[slug]', 'page')`.
 * Les chemins littéraux (page d'accueil, listes) n'ont pas besoin du
 * groupe : ils correspondent à l'URL réellement visitée.
 */
const CATALOGUE_LITERAL_PATHS = ['/', '/catalogue', '/editions', '/boutique']
// Motifs en ESPACE D'URL, sans le groupe de routes : la référence Next 16
// (`revalidatePath.md` : « a route pattern with dynamic segments like
// `/product/[slug]` ») ne préfixe jamais par le groupe — la forme
// `/(site)/...` héritée d'un ancien exemple ne matchait RIEN (constat live :
// fiches jamais purgées après édition back-office). Les deux formes sont
// émises par prudence, l'appel excédentaire est inoffensif.
const CATALOGUE_PAGE_PATTERNS = [
  '/catalogue/[edition]',
  '/catalogue/[edition]/[slug]',
  '/editions/[slug]',
  '/boutique/[slug]',
  '/(site)/catalogue/[edition]',
  '/(site)/catalogue/[edition]/[slug]',
  '/(site)/editions/[slug]',
  '/(site)/boutique/[slug]',
]

/**
 * Revalide toutes les pages qui peuvent afficher un livre/auteur/collection/
 * média (purge ISR par chemin uniquement — le data-cache tagué `catalogue`
 * est invalidé séparément par `revalidate-catalogue.ts`, attaché aux mêmes
 * collections).
 */
function revalidateCatalogueRoutes(): void {
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
export const revalidateCatalogueAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  if (req.context?.disableRevalidate) return
  revalidateCatalogueRoutes()
  // Purge LITTÉRALE de la fiche modifiée (books uniquement — les autres
  // collections n'ont pas de page propre) : constat live (boucle 3 de
  // l'audit), la purge par motif `[edition]/[slug]` ne débloque pas les
  // entrées ISR sur Vercel, seuls les chemins littéraux sont fiables.
  // L'éditeur doit voir SA fiche à jour immédiatement ; les fiches voisines
  // (bandeaux « même libellé ») suivent à l'expiration ISR (1 h).
  if (typeof doc?.slug === 'string') {
    if (typeof doc.edition === 'string') {
      revalidatePath(`/catalogue/${doc.edition}/${doc.slug}`)
    } else if (doc.origin === 'boutique') {
      revalidatePath(`/boutique/${doc.slug}`)
    }
  }
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

/** Hooks `rencontres` (agenda) : seule `/rencontres` lit cette collection. */
export const revalidateRencontresAfterChange: CollectionAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/rencontres')
}

export const revalidateRencontresAfterDelete: CollectionAfterDeleteHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/rencontres')
}

/*
 * Hooks des globals « Contenus du site » (spec « éditeur de contenus ») :
 * chaque global ne nourrit que des chemins littéraux connus d'avance — on
 * revalide exactement ceux-là, avec la même garde `disableRevalidate` que
 * les hooks de collections (aucun import de masse prévu sur ces globals,
 * mais le contrat d'écriture Payload du repo reste uniforme).
 */

/** Pages légales nourries par le global `pages-legales`. */
const LEGAL_PATHS = ['/cgv', '/mentions-legales', '/confidentialite']

/**
 * Hook `pages-legales` (Pages) : pages légales + layout (pied de page /
 * metadata — ex-`reglages-site`).
 */
export const revalidatePagesLegalesAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  for (const path of LEGAL_PATHS) revalidatePath(path)
  revalidatePath('/', 'layout')
}

/** Hook `page-a-propos` : lu par les pages maisons `/editions/[slug]`
 *  (l'ex-page commune `/a-propos` est une redirection sans contenu). */
export const revalidateAProposAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/editions/editions-sociales')
  revalidatePath('/editions/la-dispute')
}

/** Hook `page-souscription` : seule la page Souscription lit ce global. */
export const revalidateSouscriptionAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/souscription')
}

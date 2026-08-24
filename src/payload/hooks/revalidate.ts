import { revalidatePath } from 'next/cache'

import { invalidateCatalogueTag } from './revalidate-catalogue.ts'

import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  Where,
} from 'payload'

/**
 * Invalidation ISR (purge par chemin) à la sauvegarde back-office (E6 du
 * plan).
 *
 * Choix de mécanisme (à confirmer dans node_modules/next/dist/docs/01-app/
 * 02-guides au moment de coder, cf. AGENTS.md — fait) : les pages `(site)`
 * ne lisent jamais Payload en direct, elles passent par la façade
 * `src/lib/catalogue.ts`, elle-même consommée par des pages en ISR
 * classique — `export const revalidate = 86400` (voir chaque page.tsx). Les
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
// `/panier` (suggestions goodies), `/sitemap.xml` (liste des fiches),
// `/rencontres` (livre lié : titre/couverture, `Rencontres.image`) et
// `/souscription` (étagère `getNewReleases`) lisent aussi le catalogue ou des
// médias : ajoutés à l'allongement de la fenêtre ISR 1 h → 24 h (audit coûts
// Vercel 2026-08-23 + revue) — sans purge à l'édition, ils resteraient
// jusqu'à 24 h en retard.
const CATALOGUE_LITERAL_PATHS = [
  '/',
  '/catalogue',
  '/editions',
  '/boutique',
  '/panier',
  '/sitemap.xml',
  '/rencontres',
  '/souscription',
]
// Motifs en ESPACE D'URL, sans le groupe de routes : la référence Next 16
// (`revalidatePath.md` : « a route pattern with dynamic segments like
// `/product/[slug]` ») ne préfixe jamais par le groupe — la forme
// `/(site)/...` héritée d'un ancien exemple ne matchait RIEN (constat live :
// fiches jamais purgées après édition back-office). Les deux formes sont
// émises par prudence, l'appel excédentaire est inoffensif. Réservés aux
// SUPPRESSIONS et au repli d'erreur depuis l'audit coûts 2026-08-23 : sur un
// save ordinaire, la purge est CIBLÉE (listes + fiches réellement liées, cf.
// `revalidateCatalogueAfterChange`) — purger ~330 fiches par save nourrissait
// les ISR writes pour un motif de toute façon peu fiable sur Vercel.
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

/** Purge les seules LISTES du catalogue (accueil, archives, panier, sitemap). */
function revalidateCatalogueLists(): void {
  for (const path of CATALOGUE_LITERAL_PATHS) revalidatePath(path)
}

/**
 * Purge LARGE (listes + motifs de fiches) — réservée aux suppressions et au
 * repli d'erreur du ciblage : une fiche supprimée peut apparaître n'importe
 * où, et un ciblage qui a échoué ne doit jamais laisser du contenu périmé.
 */
function revalidateCatalogueWide(): void {
  revalidateCatalogueLists()
  for (const pattern of CATALOGUE_PAGE_PATTERNS) revalidatePath(pattern, 'page')
}

/** Chemin public de la fiche d'un livre — `null` si le doc n'en a pas (brouillon sans slug). */
function bookFichePath(doc: {
  slug?: unknown
  edition?: unknown
  origin?: unknown
}): string | null {
  if (typeof doc.slug !== 'string' || doc.slug === '') return null
  if (typeof doc.edition === 'string') return `/catalogue/${doc.edition}/${doc.slug}`
  if (doc.origin === 'boutique') return `/boutique/${doc.slug}`
  return null
}

/**
 * Fiches à purger quand un doc `authors`/`libelles`/`media` change : relation
 * INVERSE résolue en une requête `books` (depth 0, champs du chemin
 * uniquement) — remplace la purge catalogue-entière historique (« hors budget
 * de l'étape E6 », depuis arbitrée par l'audit coûts Vercel 2026-08-23 : un
 * simple upload d'image purgait ~330 fiches). Un média fraîchement téléversé
 * n'est encore référencé par personne → zéro fiche, c'est le cas nominal.
 */
async function fichePathsReferencing(
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
  where: Where,
): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'books',
    where,
    depth: 0,
    limit: 0,
    pagination: false,
    select: { slug: true, edition: true, origin: true },
    overrideAccess: true,
    // Réutilise la connexion/transaction du save en cours — sans `req`, le
    // find sortirait de la transaction et consommerait une connexion pg
    // supplémentaire à chaque save admin (pool Neon contraint, cf. scope doc).
    req,
  })
  return docs.flatMap((doc) => {
    const path = bookFichePath(doc)
    return path ? [path] : []
  })
}

/** Revalide la seule page d'accueil (bandeau de mise en avant, E6bis). */
function revalidateHome(): void {
  revalidatePath('/')
}

/**
 * Revalidation à la demande, HORS hooks — écritures en lot ou opérationnelles
 * qui posent `context.disableRevalidate` fiche par fiche mais exigent une
 * prise d'effet immédiate : import stock routeur (fin de run) et décrément de
 * stock au paiement (webhook Stripe, `order-handler.ts` — le stock EST la
 * disponibilité, et la fenêtre ISR est passée à 24 h). Ordre : tag d'abord
 * (read-your-writes du data-cache, même invariant que les paires de hooks),
 * puis listes, puis chemins LITTÉRAUX des fiches touchées (seuls fiables sur
 * Vercel, cf. constat live plus haut — les motifs n'y débloquent rien, ils ne
 * sont plus émis ici). Try/catch global : hors d'une requête Next (test
 * Vitest, script `payload run`), l'invariant « static generation store
 * missing » jette — avertir, jamais casser, le TTL 24 h du data-cache
 * rattrape.
 */
export function revalidateCatalogueNow(fichePaths: string[] = []): void {
  try {
    invalidateCatalogueTag()
    revalidateCatalogueLists()
    for (const path of fichePaths) revalidatePath(path)
  } catch (err) {
    console.warn('[revalidate] revalidation catalogue impossible (hors requête Next ?)', err)
  }
}

/**
 * Hooks `books`/`authors`/`libelles`/`media` — purge CIBLÉE par collection
 * (audit coûts Vercel 2026-08-23, remplace la purge catalogue-entière
 * historique) : toujours les listes (un livre/auteur/libellé/média peut
 * apparaître sur accueil, archives, panier, sitemap), plus les seules fiches
 * réellement liées au doc sauvé — la fiche elle-même pour `books`, la
 * relation inverse résolue pour les trois autres. Les fiches « voisines »
 * (bandeaux même libellé, hover-cards) suivent à l'expiration ISR (24 h) ou à
 * la prochaine édition — compromis assumé, identique à l'ancien pour tout ce
 * que les motifs ne purgeaient de toute façon pas sur Vercel. Toute erreur du
 * ciblage retombe sur la purge large : jamais de contenu périmé pour économiser
 * une requête.
 *
 * Garde **en tête** de chaque hook : neutralisé pendant l'import de
 * migration (`context.disableRevalidate`, posé par
 * `scripts/migrate-catalogue`, E3) — sans quoi le premier import réel
 * (295 fiches) déclencherait ~295 revalidations en série depuis un script
 * `payload run` hors requête HTTP (et lèverait l'invariant Next
 * « static generation store missing », faute de contexte de rendu).
 */
export const revalidateCatalogueAfterChange: CollectionAfterChangeHook = async ({
  collection,
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.disableRevalidate) return
  try {
    switch (collection?.slug) {
      case 'books': {
        // Purge LITTÉRALE de la fiche modifiée : constat live (boucle 3 de
        // l'audit E6), la purge par motif `[edition]/[slug]` ne débloque pas
        // les entrées ISR sur Vercel, seuls les chemins littéraux sont
        // fiables. L'éditeur doit voir SA fiche à jour immédiatement.
        revalidateCatalogueLists()
        const path = doc ? bookFichePath(doc) : null
        if (path) revalidatePath(path)
        // Slug/édition/origine changés : l'ANCIEN chemin garde sinon une
        // entrée ISR servie jusqu'à 24 h (revue 2026-08-23).
        const previousPath = previousDoc ? bookFichePath(previousDoc) : null
        if (previousPath && previousPath !== path) revalidatePath(previousPath)
        return
      }
      case 'authors': {
        revalidateCatalogueLists()
        for (const path of await fichePathsReferencing(req, { authors: { in: [doc.id] } })) {
          revalidatePath(path)
        }
        return
      }
      case 'libelles': {
        revalidateCatalogueLists()
        for (const path of await fichePathsReferencing(req, { libelles: { in: [doc.id] } })) {
          revalidatePath(path)
        }
        return
      }
      case 'media': {
        // Cas nominal : média fraîchement téléversé, encore référencé par
        // aucune fiche → zéro chemin, seules les listes sont purgées (un
        // upload ne coûte plus ~330 réécritures ISR). `/rencontres`
        // (`Rencontres.image`) est couvert par les listes. Limite assumée :
        // un média EMBARQUÉ dans un richText lexical (UploadFeature par
        // défaut) échappe à la relation inverse — sa fiche hôte suit la
        // fenêtre ISR (24 h).
        revalidateCatalogueLists()
        const where: Where = {
          or: [
            { cover: { equals: doc.id } },
            { tablePdf: { equals: doc.id } },
            { extraitPdf: { equals: doc.id } },
          ],
        }
        for (const path of await fichePathsReferencing(req, where)) {
          revalidatePath(path)
        }
        return
      }
      default:
        // Collection inattendue câblée sur ce hook : purge large, jamais du
        // contenu périmé par surprise.
        revalidateCatalogueWide()
    }
  } catch (err) {
    console.warn('[revalidate] ciblage impossible — repli purge large', err)
    revalidateCatalogueWide()
  }
}

/**
 * Suppression : purge LARGE (listes + motifs) — une fiche supprimée peut être
 * référencée n'importe où et l'événement est rare, le ciblage n'y vaut pas sa
 * complexité (les relations inverses sont déjà détricotées au moment du hook).
 * Le chemin LITTÉRAL du doc supprimé est purgé en plus : les motifs étant peu
 * fiables sur Vercel (constat live plus haut), sans lui la fiche d'un livre
 * supprimé resterait servie jusqu'à 24 h (revue 2026-08-23).
 */
export const revalidateCatalogueAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  if (req.context?.disableRevalidate) return
  revalidateCatalogueWide()
  const path = doc ? bookFichePath(doc) : null
  if (path) revalidatePath(path)
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

/**
 * Purge immédiate de `/souscription` — levier partagé par les hooks de la
 * collection `virements-souscription` (une contribution par virement change
 * la jauge et le compteur de contributeur·rices, cf.
 * `VirementsSouscription.ts`) et par l'import de classeur, qui purge UNE fois
 * pour tout le run plutôt qu'une fois par ligne écrite
 * (`virements-import.ts`, même parti pris que `revalidateCatalogueNow`).
 * Try/catch global, même parti pris que `revalidateCatalogueNow` : hors d'une
 * requête Next (test Vitest, script `payload run`), l'invariant « static
 * generation store missing » JETTE — avertir, jamais casser un import qui a
 * déjà écrit en base ; le filet ISR 24 h rattrape.
 */
export function revalidateSouscriptionNow(): void {
  try {
    revalidatePath('/souscription')
  } catch (err) {
    console.warn('[revalidate] revalidation souscription impossible (hors requête Next ?)', err)
  }
}

/** Hook `virements-souscription` (écriture back-office ligne à ligne). */
export const revalidateSouscriptionCollectionAfterChange: CollectionAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateSouscriptionNow()
}

/** Hook `virements-souscription` (suppression back-office). */
export const revalidateSouscriptionCollectionAfterDelete: CollectionAfterDeleteHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidateSouscriptionNow()
}

/** Hook `page-contact` : seule la page /contact lit ce global. */
export const revalidatePageContactAfterChange: GlobalAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  revalidatePath('/contact')
}

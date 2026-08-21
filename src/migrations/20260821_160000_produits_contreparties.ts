import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Fiches produits servies UNIQUEMENT en contrepartie de don (client
 * 2026-08-21) : la planche de stickers et les deux packs du palier 1000 €
 * (composés par la maison). Créées via la Local API — `books` est versionnée
 * (drafts), un INSERT SQL brut sauterait la mécanique de versions — publiées
 * mais NON VENDABLES (`sellable: false`, pas de prix) : invisibles de la
 * boutique et du panier, résolues par slug par `contreparties-core.ts`.
 * Le totebag n'est PAS créé ici : la fiche `totebag` existe déjà en prod
 * (article boutique réel, 5 €).
 *
 * Idempotente par slug (rejouable, et CI la joue sur un Postgres vierge).
 */
const PRODUITS = [
  {
    slug: 'planche-de-stickers',
    title: 'Planche de stickers',
    presentation: 'Planche de stickers de la campagne de souscription 2026.',
  },
  {
    slug: 'selection-15-decouvrir',
    title: 'Sélection de 15 Découvrir',
    presentation: 'Sélection de 15 titres de la collection Découvrir, composée par les éditions sociales.',
  },
  {
    slug: 'pack-5-geme',
    title: 'Pack de 5 livres de la GEME',
    presentation: 'Pack de 5 livres de la Grande Édition Marx & Engels, composé par les éditions sociales.',
  },
] as const

/** Document lexical minimal (un paragraphe) — même forme que les fixtures de `site-content-core.test.ts`. */
function lexicalDoc(text: string) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [{ type: 'text', format: 0, style: '', mode: 'normal', detail: 0, text, version: 1 }],
        },
      ],
    },
  }
}

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  for (const produit of PRODUITS) {
    const { docs } = await payload.find({
      collection: 'books',
      where: { slug: { equals: produit.slug } },
      draft: true,
      overrideAccess: true,
      limit: 1,
      req,
    })
    if (docs.length > 0) continue

    await payload.create({
      collection: 'books',
      data: {
        title: produit.title,
        slug: produit.slug,
        origin: 'boutique',
        presentation: lexicalDoc(produit.presentation),
        // Dates requises par le schéma — l'ouverture de la campagne fait foi
        // pour ces articles qui n'ont pas de parution réelle.
        dateParution: '2026-08-20',
        sortDate: '2026-08-20',
        aParaitre: false,
        commerce: { sellable: false, stock: null, stockSuivi: 'manuel' },
      },
      // Publiée d'emblée (pas un brouillon) — c'est `draft: false` qui le dit
      // à la Local API sur une collection versionnée, pas `_status` en data.
      draft: false,
      overrideAccess: true,
      context: { migration: true, disableRevalidate: true },
      req,
    })
  }
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  // Best-effort : une fiche déjà référencée par une ligne de commande de don
  // n'est pas supprimable proprement — le down ne force rien.
  for (const produit of PRODUITS) {
    await payload.delete({
      collection: 'books',
      where: { slug: { equals: produit.slug } },
      overrideAccess: true,
      context: { migration: true, disableRevalidate: true },
      req,
    })
  }
}

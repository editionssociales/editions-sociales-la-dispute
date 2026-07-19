/**
 * Passe d'enrichissement des libellés catalogue.
 *
 *   node scripts/tag-libelles.mjs --dry-run
 *   node scripts/tag-libelles.mjs --apply
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from '../node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const DRY = !APPLY

function norm(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Teste un motif : string = includes, RegExp = test sur blob normalisé. */
function matches(blob, pattern) {
  if (pattern instanceof RegExp) return pattern.test(blob)
  return blob.includes(norm(pattern))
}

function anyMatch(blob, patterns) {
  return patterns.some((p) => matches(blob, p))
}

/**
 * Règles en deux niveaux :
 * - title : titre + auteurs seulement (fort)
 * - any   : titre + auteurs + extrait (ok si motifs assez spécifiques)
 */
const RULES = {
  'marxisme-economie-politique': {
    title: [
      /\bmarx\b/,
      /\bengels\b/,
      /le capital/,
      /marxisme/,
      /marxiste/,
      /economie politique/,
      /critique de l'?economie/,
      /\bluxem?bourg\b/,
      /\bgramsci\b/,
      /\blenin\b/,
      /\blenine\b/,
      /\btrotsk/,
      /\balthusser\b/,
      /\bpoulantzas\b/,
      /\bfriot\b/,
      /plus-value/,
      /theorie de la valeur/,
      /monnaie chez marx/,
      /theorie des besoins/,
      /essai sur l'?economie de marx/,
    ],
    any: [
      /marx et /,
      /chez marx/,
      /de marx/,
      /karl marx/,
      /friedrich engels/,
      /pensee marxiste/,
      /tradition marxiste/,
      /critique marxiste/,
    ],
  },
  histoire: {
    title: [
      /\bhistoire\b/,
      /revolution francaise/,
      /commune de paris/,
      /front populaire/,
      /guerre des paysans/,
      /1914|1917|1936|1968/,
      /mai 68/,
      /revolution chilienne/,
      /revolution des oeillets/,
      /guerre d'?algerie/,
      /premiere guerre/,
      /seconde guerre/,
      /resistants?\b/,
      /\bcnr\b/,
      /historiographie/,
    ],
    any: [
      /histoire du /,
      /histoire de /,
      /historiographie/,
      /deuxieme republique/,
      /troisieme republique/,
      /premiere guerre mondiale/,
      /seconde guerre mondiale/,
    ],
  },
  philosophie: {
    title: [
      /philosophie/,
      /\bhegel\b/,
      /\bdescartes\b/,
      /\bbeauvoir\b/,
      /\bfoucault\b/,
      /\blukacs\b/,
      /\bmarcuse\b/,
      /\bmachiavel\b/,
      /saint-just/,
      /\bfreud\b/,
      /psychanalyse/,
      /dialectique/,
      /materialisme/,
      /idealisme/,
      /feuerbach/,
      /epistemolog/,
    ],
    any: [
      /philosophie allemande/,
      /philosophie du droit/,
      /theorie sociale/,
      /pensee de /,
    ],
  },
  'travail-salariat': {
    title: [
      /\btravail\b/,
      /salariat/,
      /\bsalaire/,
      /ouvrier/,
      /\busine\b/,
      /\bempoi\b/,
      /chomage/,
      /syndical/,
      /classes? populaires/,
      /precarite/,
      /metier/,
    ],
    any: [
      /monde du travail/,
      /rapport salarial/,
      /classe ouvriere/,
      /conditions de travail/,
      /division du travail/,
      /experience et connaissance du travail/,
    ],
  },
  'ecole-education': {
    title: [
      /\becole\b/,
      /education/,
      /enseigner/,
      /enseignant/,
      /pedagog/,
      /\blycee\b/,
      /scolaire/,
      /descolarisation/,
      /diplomes/,
      /vygotski/,
      /vygotsky/,
      /apprentissage/,
      /apprenti/,
      /universit/,
      /savoirs? scolaires?/,
    ],
    any: [
      /systeme educatif/,
      /lycees professionnels/,
      /esprit d'entreprise a l'ecole/,
      /eleves de /,
    ],
  },
  'genre-sexualites': {
    title: [
      /\bfemmes?\b/,
      /\bgenre\b/,
      /feminis/,
      /sexualit/,
      /sexisme/,
      /patriarcat/,
      /masculinit/,
      /\blgbt/,
      /lesbienne/,
      /\bqueer\b/,
      /maternit/,
      /\bbeauvoir\b/,
      /arrangement des sexes/,
    ],
    any: [
      /mouvement feministe/,
      /etudes de genre/,
      /rapports sociaux de sexe/,
      /domination masculine/,
    ],
  },
  'racisme-colonialisme': {
    title: [
      /racisme/,
      /raciste/,
      /racial/,
      /colonial/,
      /colonisation/,
      /decolon/,
      /esclavage/,
      /\besclave/,
      /\bfanon\b/,
      /immigration/,
      /immigre/,
      /postcolonial/,
      /\bmaghreb\b/,
      /banlieue/,
      /antill/,
    ],
    any: [
      /question coloniale/,
      /empire colonial/,
      /traite negriere/,
      /discrimination raciale/,
      /quartiers populaires/,
    ],
  },
  'etat-droit-institutions': {
    title: [
      /\betat\b/,
      /\bdroit\b/,
      /\bjustice\b/,
      /\bjuges?\b/,
      /\bpolice\b/,
      /\bprison\b/,
      /institution/,
      /democratie/,
      /republique/,
      /parlement/,
      /criminologie/,
      /securitaire/,
      /corruption/,
      /lobby/,
      /controle social/,
      /neoliberal/,
      /gouverner/,
      /pouvoir/,
    ],
    any: [
      /institutions politiques/,
      /etat social/,
      /appareil d'etat/,
      /politique penale/,
    ],
  },
  'mouvements-sociaux': {
    title: [
      /\bluttes?\b/,
      /\bgreve\b/,
      /manifeste/,
      /manifestation/,
      /mobilisation/,
      /antifascist/,
      /\bemeute\b/,
      /\brevolte\b/,
      /syndicat/,
      /militant/,
      /parti communiste/,
    ],
    any: [
      /mouvements sociaux/,
      /lutte des classes/,
      /luttes de classes/,
      /action collective/,
      /syndicalisme/,
    ],
  },
  'entretiens-temoignages': {
    title: [
      /entretien/,
      /temoignage/,
      /correspondance/,
      /\blettres?\b/,
      /autobiograph/,
      /memoires/,
    ],
    any: [/a la premiere personne/, /recit de vie/, /recits de /],
  },
  'actualite-interventions': {
    title: [/actualite/, /intervention/, /pamphlet/, /urgence/],
    any: [/conjoncture actuelle/, /depuis 20\d\d/],
  },
  'documents-archives': {
    title: [/archive/, /inedit/, /manuscrit/, /anthologie/, /documents?/],
    any: [/textes inedits/, /archives de /],
  },
  ecologie: {
    title: [
      /ecolog/,
      /climat/,
      /environnement/,
      /agriculture/,
      /\bpaysan/,
      /megabassine/,
      /\bgorz\b/,
      /extractiv/,
      /nucleaire/,
      /biodiversit/,
      /marxisme ecologique/,
    ],
    any: [
      /crise ecologique/,
      /transition ecologique/,
      /luttes ecologiques/,
      /civilisation ecologique/,
    ],
  },
  'international-geopolitique': {
    title: [
      /international/,
      /geopolit/,
      /\bgaza\b/,
      /palestine/,
      /\bisrael\b/,
      /ukraine/,
      /\bchine\b/,
      /imperialisme/,
      /tiers-monde/,
      /mondialisation/,
      /\bexil\b/,
      /europe,/,
      /^europe /,
      / algérie/,
      / algerie/,
    ],
    any: [
      /relations internationales/,
      /conflit israelo/,
      /peuple palestinien/,
      /puissances occidentales/,
      /guerre froide/,
    ],
  },
  'culture-critique': {
    title: [
      /cinema/,
      /litterature/,
      /\broman\b/,
      /poesie/,
      /\bartistes?\b/,
      /esthetique/,
      /\bcirque\b/,
      /theatre/,
      /musique/,
      /\bjazz\b/,
      /\brimbaud\b/,
      /\bhugo\b/,
      /semiotique/,
      /critique litteraire/,
      /ecriture/,
      /programmation culturelle/,
      /fabrique de la programmation/,
      /pouvoir des mots/,
      /imaginaires/,
    ],
    any: [
      /creation artistique/,
      /industrie culturelle/,
      /champ litteraire/,
      /oeuvres litteraires/,
    ],
  },
}

/** Associations manuelles titre exact → libellés (complément ciblé). */
const MANUAL = [
  { re: /peril bollore/, tags: ['actualite-interventions', 'culture-critique'] },
  { re: /politiser la haine/, tags: ['racisme-colonialisme', 'mouvements-sociaux'] },
  { re: /gouverner les juges/, tags: ['etat-droit-institutions'] },
  { re: /enfants des bidonvilles/, tags: ['racisme-colonialisme', 'mouvements-sociaux'] },
  { re: /force collective de l'individu/, tags: ['mouvements-sociaux', 'philosophie'] },
  { re: /s'asseoir et se regarder passer/, tags: ['entretiens-temoignages', 'culture-critique'] },
  { re: /la trace/, tags: ['philosophie', 'culture-critique'] },
  { re: /djoliba|fleuve niger/, tags: ['international-geopolitique', 'ecologie'] },
  { re: /politiques du squat/, tags: ['mouvements-sociaux', 'etat-droit-institutions'] },
  { re: /mesure de l'art/, tags: ['culture-critique'] },
  { re: /etre en surete/, tags: ['etat-droit-institutions'] },
  { re: /migration comme metaphore/, tags: ['racisme-colonialisme', 'international-geopolitique'] },
  { re: /aides a domicile/, tags: ['travail-salariat', 'genre-sexualites'] },
  { re: /culture du risque/, tags: ['etat-droit-institutions'] },
  { re: /penser l'emancipation/, tags: ['philosophie', 'mouvements-sociaux'] },
  { re: /gange, miroir social/, tags: ['international-geopolitique', 'racisme-colonialisme'] },
  { re: /troubles en psychiatrie/, tags: ['philosophie', 'etat-droit-institutions'] },
  { re: /fabrique des footballeurs/, tags: ['culture-critique', 'travail-salariat'] },
  { re: /autres voix de l'eau/, tags: ['ecologie'] },
  { re: /gabriel peri/, tags: ['histoire', 'mouvements-sociaux'] },
  { re: /autour d'etienne balibar/, tags: ['philosophie', 'mouvements-sociaux'] },
  { re: /metamorphoses du controle social/, tags: ['etat-droit-institutions'] },
]

const SERIES_KEEP = new Set([
  'introduction',
  'essentiels',
  'geme',
  'documents-archives',
  'actualite-interventions',
  'entretiens-temoignages',
])

function inferLibelles(book) {
  const titleBlob = norm(`${book.title} ${book.authors}`)
  const anyBlob = norm(`${book.title} ${book.authors} ${book.excerpt}`)
  const tags = new Set(book.libelles || [])

  for (const [slug, { title = [], any = [] }] of Object.entries(RULES)) {
    if (anyMatch(titleBlob, title) || anyMatch(anyBlob, any)) {
      tags.add(slug)
    }
  }

  // Renforts structurels
  if (/decouvrir /.test(titleBlob)) tags.add('introduction')
  if (/\bvygotski\b|\bvygotsky\b/.test(titleBlob)) tags.add('ecole-education')
  if (/\bfanon\b/.test(titleBlob)) {
    tags.add('racisme-colonialisme')
    tags.add('philosophie')
  }
  if (/\bbeauvoir\b/.test(titleBlob)) {
    tags.add('genre-sexualites')
    tags.add('philosophie')
  }
  if (/\bbourdieu\b/.test(titleBlob)) tags.add('culture-critique')
  if (/\b(marx|engels)\b/.test(titleBlob) && tags.has('geme')) {
    tags.add('marxisme-economie-politique')
  }

  for (const { re, tags: manualTags } of MANUAL) {
    if (re.test(titleBlob)) {
      for (const t of manualTags) tags.add(t)
    }
  }

  const series = [...tags].filter((t) => SERIES_KEEP.has(t))
  const thematic = [...tags].filter((t) => !SERIES_KEEP.has(t)).sort()
  // Max 5 thématiques en plus des tags série déjà présents
  return [...new Set([...series, ...thematic.slice(0, 5)])].sort()
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL(_UNPOOLED) manquant')

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const { rows: libelleRows } = await client.query('SELECT id, slug FROM payload.libelles')
  const idBySlug = Object.fromEntries(libelleRows.map((r) => [r.slug, r.id]))

  const { rows: books } = await client.query(`
    SELECT b.id, b.edition::text AS edition, b.title, b.slug,
      COALESCE(
        (SELECT array_agg(l.slug ORDER BY l.slug)
         FROM payload.books_rels r
         JOIN payload.libelles l ON l.id = r.libelles_id
         WHERE r.parent_id = b.id AND r.path = 'libelles'),
        ARRAY[]::text[]
      ) AS libelles,
      LEFT(regexp_replace(COALESCE(b.presentation_legacy_html, ''), E'<[^>]+>', ' ', 'g'), 900) AS excerpt,
      COALESCE(
        (SELECT string_agg(a.name, ', ' ORDER BY br."order")
         FROM payload.books_rels br
         JOIN payload.authors a ON a.id = br.authors_id
         WHERE br.parent_id = b.id AND br.path = 'authors'),
        ''
      ) AS authors
    FROM payload.books b
    WHERE b._status = 'published'
    ORDER BY b.id
  `)

  const plan = []
  for (const book of books) {
    const next = inferLibelles(book)
    const current = [...(book.libelles || [])].sort()
    // Jamais de retrait : on n'ajoute que
    const final = [...new Set([...current, ...next])].sort()
    const added = final.filter((t) => !current.includes(t))
    if (added.length > 0) {
      plan.push({
        id: book.id,
        title: book.title.replace(/<[^>]+>/g, ''),
        edition: book.edition,
        before: current,
        after: final,
        added,
      })
    }
  }

  const byTag = {}
  for (const p of plan) {
    for (const t of p.added) byTag[t] = (byTag[t] || 0) + 1
  }

  const stillBare = books.filter((b) => {
    const p = plan.find((x) => x.id === b.id)
    const n = (b.libelles?.length || 0) + (p?.added.length || 0)
    return n === 0
  })

  const report = {
    mode: DRY ? 'dry-run' : 'apply',
    booksTotal: books.length,
    booksTouched: plan.length,
    tagsAdded: plan.reduce((n, p) => n + p.added.length, 0),
    stillBare: stillBare.length,
    byTag,
    stillBareSample: stillBare.slice(0, 25).map((b) => b.title.replace(/<[^>]+>/g, '')),
    sample: plan.slice(0, 40).map((p) => ({
      id: p.id,
      title: p.title,
      added: p.added,
      after: p.after,
    })),
  }

  const outPath = path.join(__dirname, '..', 'tmp-tag-libelles-report.json')
  fs.writeFileSync(outPath, JSON.stringify({ ...report, plan }, null, 2))
  console.log(JSON.stringify({ ...report, reportFile: outPath }, null, 2))

  if (DRY) {
    console.log('\n[dry-run] Relancer avec --apply pour écrire.')
    await client.end()
    return
  }

  await client.query('BEGIN')
  try {
    let inserts = 0
    for (const p of plan) {
      const { rows: existing } = await client.query(
        `SELECT libelles_id FROM payload.books_rels
         WHERE parent_id = $1 AND path = 'libelles' AND libelles_id IS NOT NULL`,
        [p.id],
      )
      const have = new Set(existing.map((r) => r.libelles_id))
      let order = existing.length
      for (const slug of p.added) {
        const lid = idBySlug[slug]
        if (!lid || have.has(lid)) continue
        await client.query(
          `INSERT INTO payload.books_rels ("order", parent_id, path, libelles_id)
           VALUES ($1, $2, 'libelles', $3)`,
          [order++, p.id, lid],
        )
        inserts++
        have.add(lid)
      }
    }
    await client.query('COMMIT')
    console.log(`\n[apply] ${inserts} relations ajoutées sur ${plan.length} livres.`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

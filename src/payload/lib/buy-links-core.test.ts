import { describe, expect, it } from 'vitest'

import {
  classifyBuyLinkValue,
  extractLalibrairieToken,
  isParisLibrairiesFicheUrl,
  normalizeLalibrairieFicheUrl,
  parisLibrairiesProbeUrl,
  planBackfillForBook,
  planBuyLinksAutofill,
} from './buy-links-core.ts'

const EAN = '9782353671281'
const PARIS_FICHE = `https://www.parislibrairies.fr/livre/${EAN}-ludwig-feuerbach-et-la-fin-de-la-philosophie-allemande-classique-friedrich-engels/`
const PARIS_RECHERCHE = 'https://www.parislibrairies.fr/listeliv.php?base=paper&mots_recherche=engels'
const LALIBRAIRIE_FICHE = `https://www.lalibrairie.com/livres/decouvrir-hegel_0-12610404_${EAN}.html`

describe('parisLibrairiesProbeUrl', () => {
  it('construit la sonde /livre/{ean13}', () => {
    expect(parisLibrairiesProbeUrl(EAN)).toBe(`https://www.parislibrairies.fr/livre/${EAN}`)
  })
})

describe('isParisLibrairiesFicheUrl', () => {
  it('accepte la fiche canonique de cet EAN', () => {
    expect(isParisLibrairiesFicheUrl(PARIS_FICHE, EAN)).toBe(true)
  })

  it('accepte les variantes avec ancre ou query', () => {
    expect(isParisLibrairiesFicheUrl(`${PARIS_FICHE}#targetDetail`, EAN)).toBe(true)
    expect(isParisLibrairiesFicheUrl(`${PARIS_FICHE}?utm_source=x`, EAN)).toBe(true)
  })

  it("refuse la fiche d'un autre EAN", () => {
    expect(isParisLibrairiesFicheUrl(PARIS_FICHE, '9782353670369')).toBe(false)
  })

  it('refuse une page de recherche (pas /livre/)', () => {
    expect(isParisLibrairiesFicheUrl(PARIS_RECHERCHE, EAN)).toBe(false)
  })

  it('refuse un hostname étranger', () => {
    expect(isParisLibrairiesFicheUrl(`https://evil.example/livre/${EAN}`, EAN)).toBe(false)
  })

  it('refuse une URL invalide', () => {
    expect(isParisLibrairiesFicheUrl('pas une url', EAN)).toBe(false)
  })
})

describe('extractLalibrairieToken', () => {
  it('trouve le jeton quel que soit l’ordre des attributs', () => {
    const html = `<form action="/livres/recherche.html"><input type="hidden" name="token" value="abc123"></form>`
    expect(extractLalibrairieToken(html)).toBe('abc123')
  })

  it('tolère un ordre value avant name', () => {
    const html = `<input value="xyz789" type="hidden" name="token" />`
    expect(extractLalibrairieToken(html)).toBe('xyz789')
  })

  it('ignore les autres champs input', () => {
    const html = `<input name="searchLang" value="fra"><input name="token" value="ok">`
    expect(extractLalibrairieToken(html)).toBe('ok')
  })

  it('renvoie null si aucun jeton', () => {
    expect(extractLalibrairieToken('<html><body>rien ici</body></html>')).toBeNull()
  })
})

describe('normalizeLalibrairieFicheUrl', () => {
  it('absolutise une Location relative et matche la fiche de cet EAN', () => {
    expect(normalizeLalibrairieFicheUrl(`/livres/decouvrir-hegel_0-12610404_${EAN}.html`, EAN)).toBe(
      `https://www.lalibrairie.com/livres/decouvrir-hegel_0-12610404_${EAN}.html`,
    )
  })

  it('retire le préfixe /index.php', () => {
    expect(
      normalizeLalibrairieFicheUrl(`/index.php/livres/decouvrir-hegel_0-12610404_${EAN}.html`, EAN),
    ).toBe(`https://www.lalibrairie.com/livres/decouvrir-hegel_0-12610404_${EAN}.html`)
  })

  it('retire query et fragment', () => {
    expect(
      normalizeLalibrairieFicheUrl(`/livres/decouvrir-hegel_0-12610404_${EAN}.html?ctx=abc#frag`, EAN),
    ).toBe(`https://www.lalibrairie.com/livres/decouvrir-hegel_0-12610404_${EAN}.html`)
  })

  it("renvoie null si le motif de l'EAN n'y est pas (livre absent — 200 sans redirection ou redirection hors fiche)", () => {
    expect(normalizeLalibrairieFicheUrl('/livres/recherche.html', EAN)).toBeNull()
    expect(normalizeLalibrairieFicheUrl(`/livres/autre-livre_0-999_9782353670369.html`, EAN)).toBeNull()
  })

  it('renvoie null pour une Location invalide', () => {
    expect(normalizeLalibrairieFicheUrl('http://[', EAN)).toBeNull()
  })
})

describe('classifyBuyLinkValue', () => {
  it('classe vide/null comme empty', () => {
    expect(classifyBuyLinkValue(null)).toBe('empty')
    expect(classifyBuyLinkValue(undefined)).toBe('empty')
    expect(classifyBuyLinkValue('   ')).toBe('empty')
  })

  it('classe une fiche ParisLibrairies', () => {
    expect(classifyBuyLinkValue(PARIS_FICHE)).toBe('paris-fiche')
  })

  it('classe une recherche ParisLibrairies legacy (listeliv.php)', () => {
    expect(classifyBuyLinkValue(PARIS_RECHERCHE)).toBe('paris-recherche')
  })

  it('classe une fiche LaLibrairie', () => {
    expect(classifyBuyLinkValue(LALIBRAIRIE_FICHE)).toBe('lalibrairie-fiche')
  })

  it('classe une fiche LaLibrairie avec préfixe /index.php', () => {
    expect(classifyBuyLinkValue(`https://www.lalibrairie.com/index.php/livres/x_0-1_${EAN}.html`)).toBe(
      'lalibrairie-fiche',
    )
  })

  it('classe autre chose (hostname étranger, page d’accueil LaLibrairie) en autre', () => {
    expect(classifyBuyLinkValue('https://exemple.fr/quelquechose')).toBe('autre')
    expect(classifyBuyLinkValue('https://www.lalibrairie.com/')).toBe('autre')
    expect(classifyBuyLinkValue('pas une url')).toBe('autre')
  })
})

describe('planBuyLinksAutofill', () => {
  it('aucun besoin sans ISBN', () => {
    expect(
      planBuyLinksAutofill({ isbn: null, previousIsbn: null, parislibrairies: null, lalibrairie: null }),
    ).toEqual({ ean13: null, needParis: false, needLalibrairie: false })
  })

  it('aucun besoin avec un ISBN invalide', () => {
    expect(
      planBuyLinksAutofill({
        isbn: '978-0-000-00000-0',
        previousIsbn: null,
        parislibrairies: null,
        lalibrairie: null,
      }).ean13,
    ).toBeNull()
  })

  it('les deux champs vides → besoin des deux', () => {
    const plan = planBuyLinksAutofill({
      isbn: '978-2-35367-128-1',
      previousIsbn: null,
      parislibrairies: '',
      lalibrairie: null,
    })
    expect(plan).toEqual({ ean13: EAN, needParis: true, needLalibrairie: true })
  })

  it('champs déjà remplis (valeurs non liées à l’ancien EAN) → aucun besoin', () => {
    const plan = planBuyLinksAutofill({
      isbn: '978-2-35367-128-1',
      previousIsbn: '978-2-35367-128-1',
      parislibrairies: PARIS_FICHE,
      lalibrairie: LALIBRAIRIE_FICHE,
    })
    expect(plan).toEqual({ ean13: EAN, needParis: false, needLalibrairie: false })
  })

  it('ISBN changé et lien courant contenant l’ancien EAN → re-besoin', () => {
    const oldEan = '9782353670369'
    const plan = planBuyLinksAutofill({
      isbn: '978-2-35367-128-1',
      previousIsbn: '978-2-35367-036-9',
      parislibrairies: `https://www.parislibrairies.fr/livre/${oldEan}-ancien-titre/`,
      lalibrairie: LALIBRAIRIE_FICHE.replace(EAN, oldEan),
    })
    expect(plan).toEqual({ ean13: EAN, needParis: true, needLalibrairie: true })
  })

  it('ISBN changé mais lien courant ne contient pas l’ancien EAN (saisi à la main) → pas touché', () => {
    const plan = planBuyLinksAutofill({
      isbn: '978-2-35367-128-1',
      previousIsbn: '978-2-35367-036-9',
      parislibrairies: 'https://exemple.fr/mon-lien-manuel',
      lalibrairie: LALIBRAIRIE_FICHE,
    })
    expect(plan).toEqual({ ean13: EAN, needParis: false, needLalibrairie: false })
  })

  it('changement de mise en forme seule (tirets) ne compte pas comme un changement d’ISBN', () => {
    const plan = planBuyLinksAutofill({
      isbn: '9782353671281',
      previousIsbn: '978-2-35367-128-1',
      parislibrairies: PARIS_FICHE,
      lalibrairie: LALIBRAIRIE_FICHE,
    })
    expect(plan).toEqual({ ean13: EAN, needParis: false, needLalibrairie: false })
  })
})

describe('planBackfillForBook', () => {
  it('les deux champs vides → résolution des deux', () => {
    const plan = planBackfillForBook({ isbn: '978-2-35367-128-1', parislibrairies: '', lalibrairie: null })
    expect(plan.ean13).toBe(EAN)
    expect(plan.parislibrairies).toEqual({ classification: 'empty', action: { kind: 'resolve' } })
    expect(plan.lalibrairie).toEqual({ classification: 'empty', action: { kind: 'resolve' } })
  })

  it('un seul champ vide → résolution du seul champ vide', () => {
    const plan = planBackfillForBook({
      isbn: '978-2-35367-128-1',
      parislibrairies: PARIS_FICHE,
      lalibrairie: '',
    })
    expect(plan.parislibrairies).toEqual({ classification: 'paris-fiche', action: { kind: 'none' } })
    expect(plan.lalibrairie).toEqual({ classification: 'empty', action: { kind: 'resolve' } })
  })

  it('inversion des deux champs → échange sans réseau', () => {
    const plan = planBackfillForBook({
      isbn: '978-2-35367-128-1',
      parislibrairies: LALIBRAIRIE_FICHE,
      lalibrairie: PARIS_FICHE,
    })
    expect(plan.parislibrairies).toEqual({
      classification: 'lalibrairie-fiche',
      action: { kind: 'swap', value: PARIS_FICHE },
    })
    expect(plan.lalibrairie).toEqual({
      classification: 'paris-fiche',
      action: { kind: 'swap', value: LALIBRAIRIE_FICHE },
    })
  })

  it('doublon : une fiche ParisLibrairies collée aussi dans le champ lalibrairie (pas une inversion) → re-résolution du seul champ lalibrairie', () => {
    const plan = planBackfillForBook({
      isbn: '978-2-35367-128-1',
      parislibrairies: PARIS_FICHE,
      lalibrairie: PARIS_FICHE,
    })
    expect(plan.parislibrairies).toEqual({ classification: 'paris-fiche', action: { kind: 'none' } })
    expect(plan.lalibrairie).toEqual({ classification: 'paris-fiche', action: { kind: 'resolve' } })
  })

  it('recherche legacy listeliv.php dans parislibrairies → re-résolution', () => {
    const plan = planBackfillForBook({
      isbn: '978-2-35367-128-1',
      parislibrairies: PARIS_RECHERCHE,
      lalibrairie: LALIBRAIRIE_FICHE,
    })
    expect(plan.parislibrairies).toEqual({ classification: 'paris-recherche', action: { kind: 'resolve' } })
    expect(plan.lalibrairie).toEqual({ classification: 'lalibrairie-fiche', action: { kind: 'none' } })
  })

  it('valeur "autre" intacte (jamais touchée, seulement classifiée pour le rapport)', () => {
    const plan = planBackfillForBook({
      isbn: '978-2-35367-128-1',
      parislibrairies: 'https://exemple.fr/mon-lien-particulier',
      lalibrairie: `${LALIBRAIRIE_FICHE}?ctx=abc#frag`,
    })
    expect(plan.parislibrairies).toEqual({ classification: 'autre', action: { kind: 'none' } })
    // Query/fragment n'empêchent pas la classification de fiche valide (choix cliente : jamais retouché).
    expect(plan.lalibrairie.classification).toBe('lalibrairie-fiche')
    expect(plan.lalibrairie.action).toEqual({ kind: 'none' })
  })

  it('ISBN invalide/absent → signalé (aucun champ résolu, même vide)', () => {
    const plan = planBackfillForBook({ isbn: null, parislibrairies: '', lalibrairie: '' })
    expect(plan.ean13).toBeNull()
    expect(plan.parislibrairies.action).toEqual({ kind: 'none' })
    expect(plan.lalibrairie.action).toEqual({ kind: 'none' })
  })
})

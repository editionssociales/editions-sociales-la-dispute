import type { Field, GlobalConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  defaultMailCommandeLot,
  mergePageAPropos,
  mergePageContact,
  mergePageNosMaisons,
  mergePageSouscription,
  mergePagesLegales,
  mergeReglagesSite,
} from '../../lib/site-content-core'
import { MailCommandeLot } from './MailCommandeLot.ts'
import { PageAPropos } from './PageAPropos.ts'
import { PageContact } from './PageContact.ts'
import { PageNosMaisons } from './PageNosMaisons.ts'
import { PageSouscription } from './PageSouscription.ts'
import { PagesLegales } from './PagesLegales.ts'

/**
 * Le texte affiché EN TRANSPARENCE dans un champ vide du back-office doit être
 * exactement celui que le site sert quand le champ est vide (retour client
 * 2026-11 : « savoir ce qu'on édite ») — ce test compare chaque placeholder à
 * la valeur fusionnée d'un global VIDE, pour qu'un défaut modifié d'un côté
 * seulement rougisse la suite.
 */
function walk(fields: Field[], prefix: string[], out: Map<string, Field>) {
  for (const f of fields) {
    const name = 'name' in f && typeof f.name === 'string' ? f.name : null
    const here = name ? [...prefix, name] : prefix
    if (name && f.type !== 'tabs' && f.type !== 'row') out.set(here.join('.'), f)
    if ('fields' in f && Array.isArray(f.fields)) walk(f.fields, here, out)
    if ('tabs' in f) for (const t of f.tabs) walk(t.fields, here, out)
  }
}

function placeholders(global: GlobalConfig): Map<string, unknown> {
  const all = new Map<string, Field>()
  walk(global.fields, [], all)
  return new Map([...all].map(([k, f]) => [k, (f as { admin?: { placeholder?: unknown } }).admin?.placeholder]))
}

describe('placeholders du back-office = défauts réellement servis', () => {
  it('pages-legales : pied de page, SEO, délai et informations de livraison', () => {
    const p = placeholders(PagesLegales)
    const site = mergeReglagesSite(null)
    const legales = mergePagesLegales(null)
    expect(p.get('footer.adresse')).toBe(site.footer.adresse)
    expect(p.get('seo.titreParDefaut')).toBe(site.seo.titre)
    expect(p.get('seo.descriptionParDefaut')).toBe(site.seo.description)
    expect(p.get('livraisonDelai')).toBe(legales.livraisonDelai)
    expect(p.get('livraisonInfos')).toBe(legales.livraisonInfos)
  })

  it('page-contact et page-nos-maisons', () => {
    const contact = mergePageContact(null)
    expect(placeholders(PageContact).get('titre')).toBe(contact.titre)
    expect(placeholders(PageContact).get('intro')).toBe(contact.intro)
    expect(placeholders(PageNosMaisons).get('titre')).toBe(mergePageNosMaisons(null).titre)
  })

  it('page-souscription : titre, récit, objectifs', () => {
    const p = placeholders(PageSouscription)
    const s = mergePageSouscription(null)
    expect(p.get('titre')).toBe(s.titre.titre)
    expect(p.get('sousTitre')).toBe(s.titre.sousTitre)
    expect(p.get('demande')).toBe(s.titre.demande)
    for (const k of ['danger', 'guerre', 'maisons', 'appel'] as const) {
      expect(p.get(`${k}.titre`)).toBe(s.recit[k].titre)
      expect(p.get(`${k}.titreItalique`) ?? null).toBe(s.recit[k].titreItalique)
    }
    for (const k of ['titre50', 'titre80', 'titre100', 'descriptif50', 'descriptif80', 'descriptif100'] as const) {
      expect(p.get(`objectifs.${k}`)).toBe(s.objectifs[k])
    }
  })

  it('page-a-propos : équipe, e-mail de dépôt, et défauts par maison', () => {
    const p = placeholders(PageAPropos)
    const a = mergePageAPropos(null)
    expect(p.get('maisons.nom')).toBeUndefined() // porté par MaisonDefaultField (table par maison)
    expect(p.get('equipe.permanente')).toBe(a.equipePermanente)
    expect(p.get('depotManuscrit.email')).toBe(a.depotManuscrit.email)
    const all = new Map<string, Field>()
    walk(PageAPropos.fields, [], all)
    for (const champ of ['nom', 'tagline', 'description'] as const) {
      const defaults = (all.get(`maisons.${champ}`) as { admin: { custom: { defaults: Record<string, string> } } }).admin
        .custom.defaults
      for (const maison of a.maisons) {
        const attendu = champ === 'nom' ? maison.name : champ === 'tagline' ? maison.tagline : maison.description
        expect(defaults[maison.slug]).toBe(attendu)
      }
    }
  })

  it('mail-commande-lot', () => {
    const p = placeholders(MailCommandeLot)
    const d = defaultMailCommandeLot()
    expect(p.get('message')).toBe(d.message)
    expect(p.get('recommandationsTitre')).toBe(d.recommandationsTitre)
    expect(typeof p.get('objet')).toBe('string')
  })
})

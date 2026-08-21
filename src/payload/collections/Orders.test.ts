import { describe, expect, it } from 'vitest'

import type { Access, Field } from 'payload'

import { Orders } from './Orders.ts'

/**
 * Verrouille le contrat écrit dans `src/payload/CLAUDE.md` (Local Contracts,
 * puce `Orders`) : `create` fermé partout (seul le webhook Stripe écrit, via
 * la Local API en `overrideAccess: true` — aucune voie REST/GraphQL/back-
 * office ne peut créer de commande), et tous les champs verrouillés en
 * écriture après création SAUF `status`. Test de CONFIG pur — aucune I/O,
 * aucune base réelle : `Orders` est un simple objet de config Payload,
 * inspecté ici pour ses fonctions d'accès et ses définitions de champ.
 */

const noUser = { req: { user: null } } as Parameters<Access>[0]
const adminUser = { req: { user: { role: 'admin' } } } as Parameters<Access>[0]
const editorUser = { req: { user: { role: 'editor' } } } as Parameters<Access>[0]

describe('Orders.access — create fermé, quel que soit le rôle', () => {
  it('create renvoie toujours false (aucune voie API/back-office, seul le webhook écrit en overrideAccess)', () => {
    const create = Orders.access?.create as Access
    expect(create(noUser)).toBe(false)
    expect(create(adminUser)).toBe(false)
    expect(create(editorUser)).toBe(false)
  })
})

describe('Orders.fields — verrouillage en écriture après création', () => {
  const STATUS_FIELD = 'status'

  function topLevelFields(): (Field & { name?: string })[] {
    return Orders.fields as (Field & { name?: string })[]
  }

  it('`status` est le SEUL champ sans `access.update` verrouillé (`lockedAfterCreate`)', () => {
    const unlockedFields = topLevelFields()
      .filter((field) => field.name !== undefined)
      .filter((field) => {
        const access = (field as { access?: { update?: Access } }).access
        // Un champ verrouillé expose `access.update` renvoyant toujours `false`.
        // `status` n'a explicitement AUCUNE clé `access` : reste modifiable par
        // la policy de collection (`isAdminOrEditor`).
        return access?.update === undefined
      })
      .map((field) => field.name)

    expect(unlockedFields).toEqual([STATUS_FIELD])
  })

  it('chaque champ verrouillé a un `access.update` qui renvoie toujours false, quel que soit le rôle', () => {
    const lockedFields = topLevelFields().filter(
      (field) => field.name !== undefined && field.name !== STATUS_FIELD,
    )
    expect(lockedFields.length).toBeGreaterThan(0)

    for (const field of lockedFields) {
      const update = (field as { access?: { update?: Access } }).access?.update
      expect(update, `champ "${field.name}" doit avoir access.update`).toBeTypeOf('function')
      expect(update!(noUser)).toBe(false)
      expect(update!(adminUser)).toBe(false)
      expect(update!(editorUser)).toBe(false)
    }
  })

  it('les champs des groupes adresse (livraison/facturation) sont eux aussi verrouillés (au niveau du groupe)', () => {
    const shipping = topLevelFields().find((field) => field.name === 'shippingAddress')
    const billing = topLevelFields().find((field) => field.name === 'billingAddress')
    // `Field` est une union dont `UIField` ne porte pas `access` : on lit la
    // clé derrière le même cast local que la boucle ci-dessus.
    const updateOf = (field?: Field) =>
      (field as { access?: { update?: Access } } | undefined)?.access?.update
    expect(updateOf(shipping)).toBeTypeOf('function')
    expect(updateOf(billing)).toBeTypeOf('function')
    expect(updateOf(shipping)!(adminUser)).toBe(false)
    expect(updateOf(billing)!(adminUser)).toBe(false)
  })
})

describe('Orders.fields — marqueurs techniques `stockDecremented`/`confirmationSent` (issue #64)', () => {
  function findField(name: string): (Field & { name?: string }) | undefined {
    return (Orders.fields as (Field & { name?: string })[]).find((field) => field.name === name)
  }

  for (const name of ['stockDecremented', 'confirmationSent'] as const) {
    it(`"${name}" est lockedAfterCreate ET admin.readOnly (jamais éditable à la main, mais écrit par le webhook en overrideAccess)`, () => {
      const field = findField(name)
      expect(field).toBeDefined()
      // Même cast local que plus haut : `admin.readOnly` et `access` ne sont
      // pas portés par toutes les branches de l'union `Field` (dont `UIField`).
      const shape = field as { admin?: { readOnly?: boolean }; access?: { update?: Access } }
      expect(shape.admin?.readOnly).toBe(true)
      const update = shape.access?.update
      expect(update).toBeTypeOf('function')
      expect(update!(adminUser)).toBe(false)
      expect(update!(editorUser)).toBe(false)
    })
  }
})

describe('Orders.fields — `orderType` (scission commande/précommande, client 2026-08-20)', () => {
  function findField(name: string): (Field & { name?: string }) | undefined {
    return (Orders.fields as (Field & { name?: string })[]).find((field) => field.name === name)
  }

  it('existe, verrouillé après création (marqueur posé UNE fois par le webhook, jamais retouché)', () => {
    const field = findField('orderType')
    expect(field).toBeDefined()
    const shape = field as {
      type?: string
      defaultValue?: unknown
      access?: { update?: Access }
      options?: { value: string }[]
    }
    expect(shape.type).toBe('select')
    expect(shape.defaultValue).toBe('commande')
    expect(shape.options?.map((o) => o.value)).toEqual(['commande', 'precommande', 'don'])
    expect(shape.access?.update).toBeTypeOf('function')
    expect(shape.access!.update!(adminUser)).toBe(false)
  })
})

describe('Orders.indexes — idempotence webhook sur `(stripeSessionId, orderType)`', () => {
  it('index composite unique déclaré — une session peut porter DEUX commandes (une par type), jamais deux du même type', () => {
    expect(Orders.indexes).toEqual([{ fields: ['stripeSessionId', 'orderType'], unique: true }])
  })

  it('`stripeSessionId` n\'est plus unique seul (le couple avec `orderType` l\'est)', () => {
    const field = (Orders.fields as (Field & { name?: string })[]).find(
      (f) => f.name === 'stripeSessionId',
    ) as { unique?: boolean } | undefined
    expect(field?.unique).toBeFalsy()
  })
})

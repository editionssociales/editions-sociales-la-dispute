import { EventEmitter } from 'node:events'

import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { attachPoolErrorHandler } from './pool-error-handler.ts'

/**
 * Verrouille le correctif du crash prod du 2026-08-07 : un client idle du
 * pool `pg` dont le serveur (autosuspend Neon) a coupé le socket émet
 * `error` sur le pool ; sans listener, Node transforme l'événement en
 * exception non gérée et le process tombe. Le premier test matérialise ce
 * comportement Node de référence ; le second verrouille le contrat du seam :
 * après `attachPoolErrorHandler`, le même événement est absorbé et logué.
 */

function fakePayload(pool: EventEmitter) {
  const warn = vi.fn()
  return {
    payload: { db: { pool }, logger: { warn } } as unknown as Payload,
    warn,
  }
}

describe('attachPoolErrorHandler', () => {
  it("référence : sans listener, un événement `error` de pool est fatal (comportement Node d'EventEmitter)", () => {
    const pool = new EventEmitter()
    expect(() =>
      pool.emit('error', new Error('Connection terminated unexpectedly')),
    ).toThrow('Connection terminated unexpectedly')
  })

  it('après attache, le même événement est absorbé et logué en warn', () => {
    const pool = new EventEmitter()
    const { payload, warn } = fakePayload(pool)
    attachPoolErrorHandler(payload)
    expect(() =>
      pool.emit('error', new Error('Connection terminated unexpectedly')),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('Connection terminated unexpectedly')
  })

  it('tolère un adaptateur sans pool (adaptateur mémoire des tests)', () => {
    const payload = {
      db: {},
      logger: { warn: vi.fn() },
    } as unknown as Payload
    expect(() => attachPoolErrorHandler(payload)).not.toThrow()
  })
})

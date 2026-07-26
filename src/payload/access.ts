import type { Access } from 'payload'
import type { User } from '@/payload-types'

/**
 * Rôles applicatifs du back-office — alias lisible du type généré et commité
 * (`payload-types.ts:586`, `role: 'admin' | 'editor'`). Les comparaisons
 * `user?.role` ci-dessous SONT vérifiées par le compilateur : `req.user` est
 * typé `TypedUser` (= `PayloadTypes['user']`), résolu depuis ces mêmes types
 * générés — plus le fallback `any` d'avant leur génération.
 *
 * @public — exporté comme alias nommé, sans importeur pour l'instant
 * (marqueur lu par knip).
 */
export type Role = User['role']

/** Accès réservé aux administrateur·rice·s (config, utilisateurs, suppression de livres…). */
export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'

/** Accès ouvert aux administrateur·rice·s ET aux éditrice·eur·s (CRUD catalogue courant). */
export const isAdminOrEditor: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

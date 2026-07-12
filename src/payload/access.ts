import type { Access } from 'payload'

/**
 * Rôles applicatifs du back-office.
 *
 * NB : tant que `payload-types.ts` n'est pas généré (première exécution de
 * `payload migrate`/`payload generate:types`), `req.user` est typé `any` par
 * le fallback `UntypedUser` de Payload — les comparaisons `user?.role` ci-
 * dessous ne sont donc pas vérifiées par le compilateur contre ce type `Role`.
 * À resserrer une fois les types générés (`CollectionConfig<'users'>` etc.).
 *
 * @public — exporté comme point d'ancrage de ce resserrement, sans importeur
 * pour l'instant (marqueur lu par knip).
 */
export type Role = 'admin' | 'editor'

/** Accès réservé aux administrateur·rice·s (config, utilisateurs, suppression de livres…). */
export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'

/** Accès ouvert aux administrateur·rice·s ET aux éditrice·eur·s (CRUD catalogue courant). */
export const isAdminOrEditor: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

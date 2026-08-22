import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access.ts'

/**
 * Utilisateur·rice·s du back-office. Pas d'auto-inscription : seul un `admin`
 * peut créer un compte (le premier admin s'amorce hors API — seed/CLI).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Utilisateur·rice',
    plural: 'Utilisateur·rice·s',
  },
  admin: {
    group: 'Administration & technique',
    useAsTitle: 'name',
    description:
      'Comptes du back-office (administrateur·rice ou éditrice·eur) — à créer ou modifier seulement pour donner ou retirer un accès à l’équipe.',
    // Invisible pour les non-admins (recette n°4 du plan : un compte editor
    // « ne voit pas Users ») — leur propre compte reste accessible via
    // /admin/account, l'access control reste la vraie barrière.
    hidden: ({ user }) => user?.role !== 'admin',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600000,
  },
  access: {
    create: isAdmin,
    // Un utilisateur peut lire sa propre fiche ; un admin les lit toutes.
    read: ({ req: { user } }) => {
      if (!user) {
        return false
      }
      if (user.role === 'admin') {
        return true
      }
      return {
        id: {
          equals: user.id,
        },
      }
    },
    update: isAdmin,
    delete: isAdmin,
    unlock: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      label: 'Rôle',
      options: [
        { value: 'admin', label: 'Administrateur·rice' },
        { value: 'editor', label: 'Éditrice·eur' },
      ],
    },
  ],
}

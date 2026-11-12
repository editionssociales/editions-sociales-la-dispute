import { lexicalEditor } from '@payloadcms/richtext-lexical'
import type { GlobalConfig } from 'payload'

import { EDITION_LIST } from '../../lib/editions.ts'
import { EQUIPE_PERMANENTE_DEFAUT, MANUSCRITS_EMAIL_DEFAUT } from '../../lib/site-defaults.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidateAProposAfterChange } from '../hooks/revalidate.ts'

/**
 * Pages des maisons éditables (`/editions/editions-sociales`,
 * `/editions/la-dispute`) — nom/tagline/description + bureau éditorial PAR
 * maison (`EDITION_LIST`, `src/lib/editions.ts` — les couleurs d'accent
 * restent en code), plus deux blocs partagés entre les deux pages : l'équipe
 * permanente et le dépôt de manuscrit (ni l'un ni l'autre n'est gardé par
 * `maison` dans le JSX — cf. `editions/[slug]/page.tsx`). Chaque champ vide
 * retombe sur le texte actuel codé en dur (`src/lib/site-content-core.ts`) —
 * iso-rendu strict à global vide.
 *
 * Le slug `page-a-propos` est conservé pour ne pas casser les documents déjà
 * en base (ancien nom de l'ex-page commune `/a-propos`, aujourd'hui une
 * redirection sans contenu) ; seul le libellé admin a changé pour refléter ce
 * que le global édite réellement.
 *
 * Onglets UI sans `name` (même pattern que `PagesLegales` / fiche Livre) :
 * chemins de données inchangés.
 */
const MAISON_FIELD = '/payload/admin/MaisonDefaultField.tsx#MaisonDefaultField'

/** Table `{ slug de maison → texte par défaut }` d'un champ de `EDITIONS` — la même source que le rendu public. */
function defautsParMaison(champ: 'name' | 'tagline' | 'description'): Record<string, string> {
  return Object.fromEntries(EDITION_LIST.map((e) => [e.slug, e[champ]]))
}

export const PageAPropos: GlobalConfig = {
  slug: 'page-a-propos',
  label: 'Pages des maisons',
  typescript: {
    // Sans quoi `generate:types` singulariserait le slug en « PageAPropo ».
    interface: 'PageAPropos',
  },
  admin: {
    group: 'Pages du site',
    description: 'Textes des pages /editions/editions-sociales et /editions/la-dispute.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateAProposAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Maisons',
          fields: [
            {
              name: 'maisons',
              type: 'array',
              label: 'Les deux maisons',
              maxRows: 2,
              labels: {
                singular: 'Maison',
                plural: 'Maisons',
              },
              admin: {
                description: 'Textes propres à chaque maison. Maison absente ou champ vide = texte actuel.',
              },
              fields: [
                {
                  name: 'maison',
                  type: 'select',
                  required: true,
                  label: 'Maison',
                  options: [
                    { label: 'Les Éditions sociales', value: 'editions-sociales' },
                    { label: 'La Dispute', value: 'la-dispute' },
                  ],
                },
                // Défaut propre à la maison de la ligne : affiché en transparence
                // par `MaisonDefaultField` (même source que le front, `EDITIONS`).
                {
                  name: 'nom',
                  type: 'text',
                  label: 'Nom affiché',
                  admin: { custom: { defaults: defautsParMaison('name') }, components: { Field: MAISON_FIELD } },
                },
                {
                  name: 'tagline',
                  type: 'text',
                  label: 'Sous-titre',
                  admin: { custom: { defaults: defautsParMaison('tagline') }, components: { Field: MAISON_FIELD } },
                },
                {
                  name: 'description',
                  type: 'textarea',
                  label: 'Description',
                  admin: { custom: { defaults: defautsParMaison('description') }, components: { Field: MAISON_FIELD } },
                },
                {
                  name: 'bureau',
                  type: 'array',
                  label: 'Bureau éditorial',
                  labels: {
                    singular: 'Membre',
                    plural: 'Membres',
                  },
                  admin: {
                    description:
                      'Une ligne par personne, listée dans cet ordre. Aucune ligne = liste actuelle de cette maison.',
                  },
                  fields: [
                    {
                      name: 'nom',
                      type: 'text',
                      required: true,
                      label: 'Nom',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Équipe',
          fields: [
            {
              name: 'equipe',
              type: 'group',
              label: 'Équipe permanente',
              fields: [
                {
                  name: 'permanente',
                  type: 'text',
                  label: 'Noms',
                  admin: {
                    placeholder: EQUIPE_PERMANENTE_DEFAUT,
                    description:
                      'Liste des noms séparés par des virgules (ex. « A, B et C »), affichée à l’identique sur les deux pages maisons. Vide = liste actuelle.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Dépôt de manuscrit',
          fields: [
            {
              name: 'depotManuscrit',
              type: 'group',
              label: 'Dépôt de manuscrit',
              admin: {
                description:
                  'Bloc identique sur les deux pages maisons (pas de bureau éditorial concerné ici).',
              },
              fields: [
                {
                  name: 'email',
                  type: 'text',
                  label: 'Adresse e-mail de dépôt',
                  admin: {
                    placeholder: MANUSCRITS_EMAIL_DEFAUT,
                    description:
                      'Utilisée dans la phrase d’accroche par défaut ci-dessous. Vide = adresse actuelle.',
                  },
                },
                {
                  name: 'texte',
                  type: 'richText',
                  label: 'Texte du bloc',
                  editor: lexicalEditor({
                    admin: {
                      placeholder:
                        'Texte actuel du bloc affiché sur les pages maisons tant que ce champ est vide — écrivez ici pour le remplacer entièrement.',
                    },
                  }),
                  admin: {
                    description: 'Remplace entièrement le texte par défaut, adresse e-mail comprise. Vide = texte actuel.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

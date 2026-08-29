import type { Field, GlobalConfig } from 'payload'

import { DONATION_TIERS } from '../../lib/donation-tiers.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidateSouscriptionAfterChange } from '../hooks/revalidate.ts'

/**
 * Page Souscription éditable — refonte sobre (maquette client, 2026-08-21) :
 * en plus du bloc `contreparties` (inchangé, cf. plus bas), le récit devient
 * éditable — titre de l'ask, quatre sections narratives NOMMÉES ET FIXES
 * (`danger`/`guerre`/`maisons`/`appel` — couleurs et ordre figés par le
 * design, donc pas un `array`) et les trois descriptions des paliers de
 * jauge. Séparation stricte présentation / mécanique de paiement partout :
 * les contreparties référencent un palier de `DONATION_TIERS`
 * (`src/lib/donation-tiers.ts`) par un select dont les options sont dérivées
 * de la table importée, et les descriptions d'objectifs ne portent JAMAIS le
 * montant ni l'intitulé du palier (dérivés de `CAMPAIGN_2026_PALIERS`,
 * `src/lib/donation-tiers.ts`) — texte d'accompagnement uniquement. Chaque
 * champ vide retombe sur le texte actuel codé en dur
 * (`src/lib/site-content-core.ts`) — iso-rendu strict à global vide.
 *
 * Onglets sans `name` (même pattern que `PageAPropos`/`PagesLegales`) : les
 * champs qu'ils contiennent écrivent directement sur le document, chemin de
 * données inchangé pour `contreparties` (juste déplacé dans l'onglet
 * « Contreparties », même `name` qu'avant).
 */

const CONTREPARTIE_OPTIONS = DONATION_TIERS.map((tier) => ({
  label: `${tier.amount.toLocaleString("fr-FR")} € — ${tier.title}`,
  value: tier.id,
}))

/**
 * Une section du récit : titre, 2e ligne italique optionnelle, corps riche.
 * Fabrique plutôt que 4 littéraux recopiés — seul `name`/`label` varient.
 */
function champsRecit(
  name: 'danger' | 'guerre' | 'maisons' | 'appel',
  label: string,
): Field {
  return {
    name,
    type: 'group',
    label,
    fields: [
      {
        name: 'titre',
        type: 'text',
        label: 'Titre',
        admin: { description: 'Vide = titre actuel.' },
      },
      {
        name: 'titreItalique',
        type: 'text',
        label: 'Titre — 2ᵉ ligne (italique)',
        admin: {
          description:
            'Optionnel, affichée en italique sous le titre. Vide = pas de 2ᵉ ligne (ou la 2ᵉ ligne actuelle).',
        },
      },
      {
        name: 'corps',
        type: 'richText',
        label: 'Texte',
        admin: {
          description:
            'Vide = texte actuel. Le gras est repris sur le site ; le souligné, lui, n’a AUCUN effet visuel sur le site (utilisez le gras à la place).',
        },
      },
    ],
  }
}

export const PageSouscription: GlobalConfig = {
  slug: 'page-souscription',
  label: 'Page Souscription',
  typescript: {
    interface: 'PageSouscription',
  },
  admin: {
    group: 'Vie du site',
    description:
      'Titre, récit et contreparties de la page /souscription. Un champ vide = le contenu actuel du site ; les montants des paliers restent pilotés par le code (paiement Stripe).',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateSouscriptionAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Titre',
          fields: [
            {
              name: 'titre',
              type: 'text',
              label: 'Titre principal',
              admin: { description: 'Vide = « 100 ans ».' },
            },
            {
              name: 'sousTitre',
              type: 'text',
              label: 'Sous-titre',
              admin: { description: 'Vide = « d’édition marxiste : ».' },
            },
            {
              name: 'demande',
              type: 'text',
              label: 'Demande',
              admin: {
                description: 'Vide = « aidez-nous à poursuivre l’histoire. ».',
              },
            },
          ],
        },
        {
          label: 'Récit',
          fields: [
            champsRecit('danger', '1. Édition indépendante et critique (orange)'),
            champsRecit('guerre', '2. La guerre culturelle (bleu)'),
            champsRecit('maisons', '3. Les éditions sociales et La Dispute (jaune)'),
            champsRecit('appel', '4. Nous avons besoin de vous (rose)'),
          ],
        },
        {
          label: 'Objectifs',
          fields: [
            {
              name: 'objectifs',
              type: 'group',
              label: 'Objectifs de la jauge',
              admin: {
                description:
                  'Les montants et intitulés des trois paliers restent calés sur la jauge de collecte — seule la description qui les accompagne se modifie ici.',
              },
              fields: [
                {
                  name: 'descriptif50',
                  type: 'textarea',
                  label: 'Description — 50 000 €',
                  admin: { description: 'Vide = texte actuel.' },
                },
                {
                  name: 'descriptif80',
                  type: 'textarea',
                  label: 'Description — 80 000 €',
                  admin: { description: 'Vide = texte actuel.' },
                },
                {
                  name: 'descriptif100',
                  type: 'textarea',
                  label: 'Description — 100 000 €',
                  admin: { description: 'Vide = texte actuel.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Contreparties',
          fields: [
            {
              name: 'contreparties',
              type: 'array',
              label: 'Contreparties',
              labels: {
                singular: 'Contrepartie',
                plural: 'Contreparties',
              },
              admin: {
                description:
                  'Une entrée par palier à modifier : son « Contenu du lot » remplace celui de LA carte de ce palier, les huit autres cartes restant inchangées (rien à faire pour les garder). Une entrée sans aucune ligne saisie est ignorée. Le même palier saisi deux fois : la dernière entrée du tableau l’emporte. L’ordre des neuf cartes sur la page ne dépend jamais de l’ordre de ce tableau. Montant et intitulé viennent du palier choisi — ils pilotent le paiement et ne s’éditent pas ici.',
              },
              fields: [
                {
                  name: 'tierId',
                  type: 'select',
                  required: true,
                  label: 'Palier',
                  options: CONTREPARTIE_OPTIONS,
                },
                {
                  name: 'items',
                  type: 'array',
                  label: 'Contenu du lot',
                  labels: {
                    singular: 'Élément',
                    plural: 'Éléments',
                  },
                  admin: {
                    description:
                      'Une ligne par élément. Une ligne commençant par « ou » devient une alternative à la précédente (affichée « ou … », sans séparateur « + »).',
                  },
                  fields: [
                    {
                      name: 'texte',
                      type: 'text',
                      required: true,
                      label: 'Texte',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

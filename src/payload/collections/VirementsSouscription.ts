import type { CollectionConfig } from 'payload'

import { DONATION_TIERS } from '../../lib/donation-tiers.ts'
import { isAdmin, isAdminOrEditor } from '../access.ts'
import {
  revalidateSouscriptionCollectionAfterChange,
  revalidateSouscriptionCollectionAfterDelete,
} from '../hooks/revalidate.ts'
import { importVirementsHandler } from '../lib/virements-import.ts'

/**
 * Virements de souscription (client 2026-08-24, Clara) — les contributions
 * encaissées HORS Stripe, par virement sur le compte bancaire. Elles comptent
 * dans la jauge et le compteur de contributeur·rices de `/souscription`
 * exactement comme un don par carte (`src/lib/virements.ts` les additionne
 * aux charges Stripe) : c'est TOUTE la raison d'être de cette collection.
 *
 * Source : le classeur Excel tenu par l'équipe (colonnes convenues dans le
 * fil : nom · montant · choix de la souscription · date), réimporté à chaque
 * ajout par le panneau au-dessus de la liste — l'import est idempotent
 * (`cleImport`), donc réimporter le fichier entier ne duplique rien. La
 * saisie à la main reste ouverte pour un cas isolé.
 *
 * Ce que ces lignes ne sont PAS : ni un `Order` (aucune expédition
 * automatique — l'équipe connaît ces personnes et pilote l'envoi des
 * contreparties à la main, arbitrage du fil : ni adresse ni e-mail ne sont
 * demandés dans le classeur), ni une vente (étanchéité comptable des dons,
 * cf. `Orders.ts` § « don »). Aucun objet Stripe ne leur correspond.
 */
export const VirementsSouscription: CollectionConfig = {
  slug: 'virements-souscription',
  labels: {
    singular: 'Virement',
    plural: 'Virements (souscription)',
  },
  defaultSort: '-date',
  admin: {
    group: 'Quotidien',
    useAsTitle: 'nom',
    defaultColumns: ['nom', 'montantEUR', 'palier', 'date'],
    listSearchableFields: ['nom', 'email'],
    description:
      'Contributions à la souscription reçues par virement bancaire (hors ' +
      'site) — elles s’ajoutent au montant collecté et au nombre de ' +
      'contributeur·rices affichés sur la page Souscription. Importez le ' +
      'fichier Excel de suivi ci-dessous : le réimporter en entier après ' +
      'chaque ajout ne crée jamais de doublon.',
    components: {
      beforeListTable: [
        '/payload/admin/virements/VirementsImportPanel.tsx#VirementsImportPanel',
      ],
    },
  },
  access: {
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    // La page /souscription est en ISR 24 h (filet) : sans purge, un virement
    // importé n'apparaîtrait dans la jauge qu'au bout d'une journée.
    afterChange: [revalidateSouscriptionCollectionAfterChange],
    afterDelete: [revalidateSouscriptionCollectionAfterDelete],
  },
  // `POST /api/virements-souscription/import` — dépôt du classeur Excel
  // (authentifié admin/éditeur, cf. `virements-import.ts`).
  endpoints: [
    {
      path: '/import',
      method: 'post',
      handler: importVirementsHandler,
    },
  ],
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
      label: 'Date du virement',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' },
        description:
          'Jour du virement (demandé au client « pour l’analyse plus tard ») — ' +
          'jamais une heure.',
      },
    },
    {
      name: 'nom',
      type: 'text',
      required: true,
      label: 'Nom',
    },
    {
      name: 'montantEUR',
      type: 'number',
      required: true,
      min: 0,
      label: 'Montant (€)',
      admin: {
        step: 0.01,
        description: 'En euros, comme les montants des commandes (ex. 50 ou 37,50).',
      },
    },
    {
      name: 'palier',
      type: 'select',
      label: 'Choix de la souscription',
      options: [
        ...DONATION_TIERS.map((tier) => ({
          value: tier.id,
          label: `${tier.amount} € — ${tier.title}`,
        })),
        { value: 'autre', label: 'Autre / montant libre' },
      ],
      admin: {
        description:
          'Reconnu automatiquement à l’import depuis la colonne « choix de la ' +
          'souscription » (intitulé du palier ou montant) ; « Autre » quand la ' +
          'colonne est remplie sans correspondre à un palier. Jamais deviné ' +
          'depuis le montant versé.',
      },
    },
    {
      name: 'choixSaisi',
      type: 'text',
      label: 'Choix (texte du fichier)',
      admin: {
        description:
          'Cellule « choix de la souscription » telle qu’elle est écrite dans le ' +
          'classeur — conservée même quand le palier est reconnu.',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'E-mail (facultatif)',
    },
    {
      name: 'reference',
      type: 'text',
      label: 'Référence / notes',
      admin: {
        description: 'Libellé du virement, commentaire de l’équipe — informatif.',
      },
    },
    {
      name: 'cleImport',
      type: 'text',
      unique: true,
      index: true,
      label: 'Clé d’import',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'Empreinte date + nom + montant de la ligne du classeur — c’est elle ' +
          'qui évite les doublons quand le fichier est réimporté. Vide pour une ' +
          'ligne saisie à la main (elle ne sera jamais écrasée par un import).',
      },
    },
  ],
}

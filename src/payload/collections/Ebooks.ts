import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'
import { revalidateCatalogueAfterChange, revalidateCatalogueAfterDelete } from '../hooks/revalidate.ts'
import {
  revalidateCatalogueTagAfterChange,
  revalidateCatalogueTagAfterDelete,
} from '../hooks/revalidate-catalogue.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Fichiers numériques vendus avec un livre (client 2026-08-24 : « pour les
 * Notes sur Mill, on pouvait télécharger l'epub après achat ») — un ePub (ou
 * PDF) par titre, servi après paiement via un lien signé envoyé dans
 * l'e-mail de confirmation (`src/lib/ebook-token.ts`, route
 * `/telechargement/[token]`).
 *
 * Collection SÉPARÉE de `media`, et c'est tout l'intérêt : `media` est en
 * lecture publique et, depuis l'audit coûts du 2026-08-23, ses URLs SONT les
 * URLs Blob publiques (`disablePayloadAccessControl`) — y déposer un livre
 * numérique payant reviendrait à le publier. Ici l'access control Payload
 * reste ACTIF. Le téléchargement des acheteur·euses ne passe d'ailleurs même
 * pas par la route Payload : la route publique relit le fichier côté serveur
 * et le renvoie elle-même (`src/lib/ebook-download.ts`), l'adresse de
 * stockage ne sort jamais.
 *
 * Le lien vers le titre est porté ICI (`livre`), et surtout PAS par un champ
 * de `Books` : les migrations de seed de contreparties
 * (`20260821_160000_produits_contreparties`) écrivent `books` par la Local
 * API, donc avec le schéma COURANT — toute colonne ajoutée à `books`
 * aujourd'hui casse leur rejeu sur une base neuve (build hermétique de la CI,
 * cf. `DEVOPS.md`). Une colonne sur `ebooks` n'a pas ce défaut. Le sens de la
 * relation est de toute façon le bon : un fichier appartient à un titre, un
 * titre n'a pas besoin de savoir qu'un fichier existe.
 *
 * Jamais d'`imageSizes` ni de vignette : ce ne sont pas des images.
 *
 * `numeriqueSeul` (client 2026-09-09, « Notes sur James Mill » n'existe qu'en
 * ePub) est un SECOND fait, indépendant du précédent : « a un fichier » (ce
 * champ `livre`, toujours vrai ici) déclenche le lien de téléchargement après
 * achat ; « vendu uniquement en numérique » (`numeriqueSeul`) déclenche en
 * plus l'absence d'envoi — pas de port, pas d'adresse demandée au checkout,
 * stock ignoré (`src/lib/sellability.ts`). Un livre papier accompagné d'un
 * ePub a le premier fait sans le second (il reste expédié).
 */
export const Ebooks: CollectionConfig = {
  slug: 'ebooks',
  labels: {
    singular: 'Fichier numérique',
    plural: 'Fichiers numériques',
  },
  admin: {
    group: 'Catalogue',
    useAsTitle: 'filename',
    defaultColumns: ['livre', 'filename', 'filesize', 'updatedAt'],
    description:
      'Téléversez le fichier, choisissez le titre concerné : toute commande payée contenant ce ' +
      'titre reçoit ensuite un lien de téléchargement dans son e-mail de confirmation. Pour ' +
      'remplacer un fichier, ouvrez sa fiche et téléversez le nouveau — les liens déjà envoyés restent valables.',
  },
  upload: {
    // ePub d'abord ; PDF toléré (certains titres numériques n'existent qu'en
    // PDF). `application/octet-stream` : certains navigateurs n'attribuent
    // aucun type MIME à un .epub au moment du téléversement — le refuser
    // ferait échouer l'upload du cas nominal.
    mimeTypes: [
      'application/epub+zip',
      // Un ePub est un ZIP : selon le navigateur et le fichier, il peut être
      // annoncé comme zip générique plutôt qu'en type ePub — refuser ces
      // deux-là ferait échouer l'upload du cas nominal.
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      // Certains titres numériques n'existent qu'en PDF.
      'application/pdf',
    ],
    staticDir: path.resolve(dirname, '../../../ebooks'),
  },
  access: {
    // JAMAIS `() => true` (contrairement à `media`) : un livre numérique
    // payant ne se lit pas sans achat. Le back-office y accède, le public
    // passe par la route de téléchargement signée.
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  // Même paire que `books`/`authors`/`libelles`/`media` (revalidate.ts) —
  // relation DIRECTE ici (`livre` pointe VERS un livre, cf. le `case 'ebooks'`
  // dédié dans `revalidateCatalogueAfterChange`) : `numeriqueSeul` change le
  // port/l'adresse demandés au panier/checkout et le fichier lui-même
  // conditionne le bloc téléchargement de la fiche — toute écriture ici doit
  // purger la fiche liée comme si elle avait été éditée directement. Tag
  // d'abord (`revalidateCatalogueTagAfterChange`), toujours avant la purge
  // ISR par chemin — même ordre que les autres collections catalogue.
  hooks: {
    afterChange: [revalidateCatalogueTagAfterChange, revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueTagAfterDelete, revalidateCatalogueAfterDelete],
  },
  fields: [
    {
      name: 'livre',
      type: 'relationship',
      relationTo: 'books',
      required: true,
      // UN seul fichier par titre : la commande dit « ce titre a été acheté »,
      // pas « lequel des deux fichiers envoyer ». Remplacer un fichier =
      // rouvrir cette fiche et téléverser le nouveau.
      unique: true,
      index: true,
      label: 'Titre concerné',
      admin: {
        description:
          'Un seul fichier par titre — pour le remplacer, téléversez le nouveau ici plutôt que de créer une seconde fiche.',
      },
    },
    {
      // Drapeau du commerce natif (client 2026-09-09, cf. CLAUDE.md racine
      // § « Livre numérique après achat ») — vit ICI et jamais sur `books`,
      // même raison que `livre` ci-dessus (rejeu de
      // `20260821_160000_produits_contreparties` sur base neuve). Lu par
      // `catalogue-pg.ts`/`commerce-source.ts` (`CommerceInfo.digital`,
      // `CheckoutBookLookup.digital`) via une requête `ebooks` dédiée
      // (`ebooks-source.ts`) — jamais un champ de plus sur `Books.ts`.
      name: 'numeriqueSeul',
      type: 'checkbox',
      defaultValue: false,
      label: 'Titre vendu uniquement en numérique',
      admin: {
        description:
          'Coché : ce fichier EST le produit — rien à expédier, pas de port, pas d’adresse ' +
          'demandée au paiement, le stock du livre est ignoré. Décoché (défaut) : ce fichier ' +
          'accompagne le livre papier, qui reste expédié normalement.',
      },
    },
  ],
}

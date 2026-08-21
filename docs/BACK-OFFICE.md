# Le back-office, en une page

Aide-mémoire pour l'équipe éditoriale (Floée). Pas besoin de savoir coder :
tout se passe dans votre navigateur, à l'adresse `/admin` du site (ex. :
`https://editionssociales.fr/admin`).

## Se connecter

Ouvrez `/admin`, entrez votre email et votre mot de passe. Deux types de
comptes existent :

- **Administrateur·rice** : accès à tout, y compris la gestion des comptes et
  la suppression de fiches.
- **Éditrice·eur** : accès à l'édition du catalogue, des contenus du site,
  des commandes et des codes promo — mais pas à la gestion des comptes, et
  vous ne pouvez pas supprimer une fiche livre (seul un compte administrateur
  le peut).

Après 5 tentatives de mot de passe ratées, le compte se bloque 10 minutes
(sécurité automatique) — patientez, ou demandez à un administrateur de le
débloquer.

## Éditer une fiche livre

Menu de gauche → **Livres**. Cliquez sur un titre pour l'ouvrir, modifiez ce
qui doit l'être, cliquez sur **Enregistrer**. La modification est visible sur
le site public en moins d'une minute.

**Le parachute à connaître.** Chaque fiche importée depuis l'ancien site
affiche un texte de présentation « d'origine ». Tant que personne n'y a
touché dans le back-office, c'est ce texte d'origine qui s'affiche sur le
site — même si le champ « Présentation » a l'air vide ou différent ici. **Dès
que vous enregistrez la fiche une première fois**, le texte que vous voyez
dans le champ « Présentation » devient la version affichée sur le site, pour
toujours. Autrement dit : si vous ouvrez une fiche et que vous voulez juste
corriger l'ISBN ou le prix, allez-y sans crainte pour ces champs-là — mais si
vous touchez au champ « Présentation », relisez-le avant d'enregistrer,
c'est lui qui compte désormais.

Quelques règles pour cette fiche :

- **Un livre ne disparaît jamais du catalogue** faute d'être en vente : une
  fiche reste visible même « à paraître » ou « indisponible en ligne ». Pour
  retirer un livre de la vente en ligne sans le faire disparaître du site,
  décochez « Vendable nativement » dans le bloc « Commerce natif » (une fois
  la vente en ligne ouverte).
- **La couverture est obligatoire** pour créer une nouvelle fiche (pas pour
  modifier une fiche existante qui en a déjà une).
- **Le slug** (bout d'adresse dans l'URL) ne se change pas après publication
  — ça casserait les liens déjà partagés.
- **Le stock** : un seul champ « Stock » sert à la fois pour les livres et
  pour les articles boutique. 0 = épuisé, affiché comme tel sur le site sans
  que la fiche disparaisse. Le stock est rempli automatiquement chaque mois
  par l'import du routeur (voir plus bas) sauf si vous avez choisi le suivi
  « Manuel » pour ce titre.
- **Les libellés** (onglet Édition de la fiche) : thèmes du catalogue
  (Introduction, Travail & salariat, Genre & sexualités…). Un livre peut en
  porter **plusieurs**. Ce n'est plus une « collection » éditoriale unique
  par maison.

## Gérer les libellés du catalogue

Menu de gauche → groupe **Catalogue** → **Libellés**. C'est la liste des
thèmes affichés en filtres sur `/catalogue`. Une première série d'une
vingtaine de libellés majeurs est déjà en place ; vous pouvez en ajouter,
renommer ou retirer. Le **slug** sert dans l'URL (`?libelle=…`) — ne le
changez pas à la légère une fois publié.

## Éditer les contenus du site

Menu de gauche → groupe **Site**. Chaque page listée là a un principe
commun : **un champ laissé vide affiche le texte actuel du site** (rien ne
casse si vous ne remplissez rien). Vous ne risquez donc jamais de « vider »
une page par erreur.

- **Pages** : textes des pages CGV & dons, Mentions légales et
  Confidentialité ; pied de page (adresse, diffusion) ; liens réseaux
  sociaux (pied de page seulement — jamais en haut de page — s'il y en a au
  moins un) ; titre et description par défaut utilisés par Google.
- **Pages des maisons** (pages `/editions/editions-sociales` et
  `/editions/la-dispute`, ex-page À propos) :
  - un onglet **Maisons** avec, pour chaque maison, le nom affiché, le
    sous-titre, la description, et le **bureau éditorial** — une ligne par
    personne (ajoutez, retirez ou réordonnez les lignes librement, chaque
    maison garde le sien) ;
  - un onglet **Équipe** avec la liste des noms de l'équipe permanente —
    affichée à l'identique sur les deux pages ;
  - un onglet **Dépôt de manuscrit**, lui aussi identique sur les deux
    pages : l'adresse e-mail à laquelle les manuscrits sont envoyés, et un
    champ de texte qui, si vous le remplissez, remplace entièrement le
    paragraphe par défaut (adresse comprise — dans ce cas, pensez à inclure
    l'adresse dans votre texte).
- **Page Contact** : le titre et le texte d'introduction affichés en haut de
  `/contact`. Le reste de la page (formulaire ou message d'indisponibilité de
  l'envoi) n'est pas éditable ici.
- **Page Souscription** a quatre onglets :
  - **Titre** : les trois lignes du grand titre en haut de page (« 100 ans »,
    « d'édition marxiste : » et la phrase d'appel).
  - **Récit** : les quatre sections du texte de campagne (« Édition
    indépendante et critique », « La guerre culturelle », « Les éditions
    sociales et La Dispute », « Nous avons besoin de vous »). Pour chacune :
    un titre, une 2ᵉ ligne facultative affichée en italique juste dessous, et
    le texte de la section. Dans le texte, le **gras** est repris tel quel
    sur le site ; **le souligné, lui, ne fait rien de visible sur le site** —
    utilisez le gras si vous voulez mettre un passage en valeur.
  - **Objectifs** : la phrase qui accompagne chacun des trois paliers de la
    jauge (50 000 €, 80 000 € et 100 000 €). **Les montants et les intitulés
    ne se modifient pas ici** : ils sont calés sur les paliers de la jauge de
    collecte, vous ne touchez que le texte qui les accompagne.
  - **Contreparties** : le contenu des neuf cartes de contreparties (15 à
    1 000 €) — le lot associé à chaque palier. **Les montants ne se modifient
    pas ici** non plus : ils sont calés sur les paliers de paiement définis
    ailleurs, vous ne touchez que le texte qui les accompagne.

- **Mise en avant** (bandeau ponctuel sur l'accueil, menu **Mises en avant**) :
  donnez un titre, un texte court, des dates de début/fin, cochez « Actif ».
  Le bandeau n'apparaît sur l'accueil que si la case est cochée ET que la
  date du jour est dans la période choisie — pratique pour préparer une
  annonce à l'avance sans qu'elle sorte trop tôt.

## Gérer l'agenda des rencontres

Menu de gauche → groupe **Site** → **Rencontres**. Chaque entrée est une
rencontre, débat ou présentation affiché sur `/rencontres`, triée
automatiquement entre « à venir » et « passées » selon la date du jour — vous
n'avez rien à faire pour qu'une rencontre bascule d'une section à l'autre.

Champs : titre, date (+ heure en texte libre, ex. « 15h-16h30 »), lieu et
ville, un livre lié (facultatif), les intervenant·e·s (texte libre) et une
description. **L'image affichée sur `/rencontres` est facultative** : si vous
en téléversez une, elle est utilisée ; sinon, et si un livre est lié, c'est sa
couverture qui sert d'image par défaut. Sans image ni livre lié, la rencontre
s'affiche sans colonne image — pas de vignette grise. Aucune contrainte de
format pour l'image de rencontre (contrairement à la couverture d'un livre).

Une fois enregistrée, une rencontre est visible sur le site en moins d'une
minute, comme le reste du back-office.

Le **Seuil stock** (alerte stock bas du tableau de bord / page Stock) vit
dans le groupe **Boutique**, à côté des codes promo. Les comptes
(**Utilisateur·rice·s**) forment le groupe **Administration**, visible des
admins uniquement.

## Suivre les commandes et les remboursements

Menu de gauche → **Commandes** (visible une fois la vente en ligne ouverte —
avant cette date, cette page reste vide, c'est normal). Une commande est
créée automatiquement au paiement ; vous ne créez jamais de commande à la
main ici.

Le seul champ que vous changez est le **statut** : Payée → Préparée →
Expédiée, ou Annulée/Remboursée si besoin. Les remboursements se font dans
l'interface Stripe (le prestataire de paiement) ; le statut ici ne fait que
refléter ce qui a été décidé.

Le tableau de bord de la page d'accueil du back-office (première page après
connexion) montre en un coup d'œil : les commandes en attente de traitement,
les titres en stock bas, les ventes du mois, les remboursements pas encore
reflétés dans les statuts.

## Import du stock (routeur)

Chaque mois, le distributeur (le « routeur ») envoie un fichier de stock.
Panneau **Import routeur** du tableau de bord (réservé aux administrateurs) :
déposez le fichier `.xls`, cliquez sur **Importer**. Le rapport affiché vous
dit :

- combien de fiches ont été mises à jour ;
- combien de lignes du fichier ne correspondent à aucune fiche en ligne
  (normal pour la « backlist » pas encore reprise) ;
- combien de fiches en suivi manuel ne sont pas dans le fichier (normal, ce
  sont des titres suivis à la main) ;
- **la seule vraie alerte à regarder** : les fiches qui étaient suivies par
  le routeur et qui ont disparu du nouveau fichier — un titre qui « sort du
  routeur » sans explication. Le stock affiché reste celui du dernier import
  connu jusqu'à ce que ce soit résolu.

## Codes promo

Menu de gauche → **Codes promo**. Deux types disponibles : un montant fixe
retranché du panier, ou la livraison offerte (avec un panier minimum
optionnel). Le code est automatiquement mis en MAJUSCULES à l'enregistrement
— le client peut le taper en minuscules, ça marche quand même. Un code promo
expiré mais resté « actif » par erreur est signalé sur le tableau de bord
(vous pouvez le désactiver en un clic depuis là).

## Exports comptables

Tableau de bord → panneau **Export compta / préparation**, ou depuis la liste
des commandes. Deux fichiers téléchargeables (format tableur, ouvrable dans
Excel) :

- **Export préparation** : les commandes à préparer/expédier (statuts payée
  et préparée uniquement).
- **Export compta** : toutes les commandes sur la période choisie, avec le
  détail de la TVA.

Laissez les dates « Du » / « Au » vides pour tout exporter, ou choisissez une
période précise.

## En cas de blocage

- Vous ne trouvez plus une fiche que vous avez modifiée : vérifiez le filtre
  de la liste (statut « brouillon » vs « publié ») avant de vous inquiéter.
- Le site public n'a pas l'air à jour après un enregistrement : patientez une
  minute, la mise à jour n'est pas instantanée.
- Tout le reste (comptes, panne, doute technique) : contactez le développeur
  — voir `OPERATIONS.md` pour la procédure d'incident.

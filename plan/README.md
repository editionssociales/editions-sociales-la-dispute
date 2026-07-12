# Plan directeur — refonte complète (option B, bascule unique — ex-« B phasé »)

*Établi le 2026-07-09 à partir du mandat (`../IMPLEMENTATION-PROMPT.md`), du devis validé
(`devis/DEVIS-MULTI-OPTIONS.md`, hors repo) et d'une reconnaissance complète (code, dumps
SQL, infra live, engagements). Les sept plans de phase de ce dossier ont chacun subi une
relecture adversariale puis une passe de cohérence croisée ; les contradictions
d'interface relevées sont **déjà corrigées** dans les documents. **Révisé le 12/07** :
le client a abandonné la variante « B phasé » (commerce reporté en septembre) pour une
**bascule unique** — voir l'encart ci-dessous. Ce README est le point d'entrée : il fixe
ce qui est transverse — stack, calendrier, contrats d'interface, budget, décisions
client — et renvoie aux plans pour le détail d'exécution.*

> **Mise à jour du 12/07 — bascule unique décidée.** Le client abandonne la
> cohabitation longue durée : plus de swap catalogue isolé (20/07) suivi de flips DNS
> étalés (21 puis 24/07) puis d'un commerce reporté en septembre. **Une seule fenêtre**
> fait basculer ensemble le site, le catalogue (`CATALOGUE_SOURCE=pg`) et le commerce
> (`COMMERCE_NATIVE=1`) — 24 h de coupure **autorisées** par le client en marge de
> réparation, déroulé visé de quelques minutes réelles (gel édition WP → migration
> finale → `compare-sources` 0 bloquant → déploiement pg → flips DNS). Fenêtre
> proposée : **24–28/07** (butée = campagne dons du 15/08). Ce qui a permis d'avancer
> la date : le catalogue (phase 3) et le commerce (lots 1 et 2, ex-phase 4 de
> septembre) sont déjà **codés et mergés dans `main`** — détail dans « État
> d'avancement » sous le calendrier. Le reste de ce document (stack, contrats
> d'interface, principes, budget, clôture) n'est pas rejoué : seuls le calendrier et
> l'état d'avancement sont réécrits ici ; `03-catalogue.md` est mis à jour en
> cohérence ; `04-commerce.md` garde sa rédaction « kickoff 07/09 » — son contenu
> technique reste la référence des lots déjà livrés, seul son calendrier est caduc
> (non retouché dans cette passe).

## Comment lire ce dossier

| Document | Contenu | Profondeur |
|---|---|---|
| [`01-dons.md`](01-dons.md) | Stripe Checkout sur `/souscription`, webhook, jauge, reçus, mise en réel | Exécutable (niveau fichier) |
| [`02-mise-en-production.md`](02-mise-en-production.md) | Légales, SEO, 301, découplage CMS, flips DNS, résiliation slot vide | Exécutable (niveau fichier) |
| [`03-catalogue.md`](03-catalogue.md) | Neon Postgres, Payload, migration 295 livres, couvertures, swap d'adaptateur, extinction WP catalogue | **Livré** — migration idempotente prouvée sur Neon réel, `compare-sources` 0 bloquant, E11 (liens internes) réécrit, build pg vert 316/316 ; le swap rejoint la fenêtre de bascule unique (ce README) |
| [`04-commerce.md`](04-commerce.md) | Panier, checkout unifié, port à la valeur du panier, migration produits, archives, extinction boutique | **Lots 1–2 mergés** (PR #10, #12) derrière `COMMERCE_NATIVE=0` — la rédaction « kickoff 07/09 » du fichier est caduque en calendrier (contenu technique toujours la référence) ; le jour J rejoint la fenêtre de bascule unique (ce README) |
| [`05-communication.md`](05-communication.md) | Brevo (2 848 abonnés), formulaire d'inscription, `/contact` | Jalons |
| [`06-operations.md`](06-operations.md) | Sentry, Better Stack, analytics, sauvegardes chiffrées, garde boutique | Jalons — **S1a (Sentry) livré et vérifié E2E** |
| [`07-cloture.md`](07-cloture.md) | Gates de sortie, transfert de propriété (protocole de référence), réversibilité, PV | Jalons + checklist |
| [`stack.md`](stack.md) | Décision de stack arbitrée (3 propositions concurrentes → juge) | Décidé |
| [`annexes/donnees-reelles.md`](annexes/donnees-reelles.md) | Inventaire vérifié des dumps : meta_keys ACF, grille de port exacte, tables newsletter, volumes | Matière première migrations |
| [`annexes/engagements-devis.md`](annexes/engagements-devis.md) | Les 95 engagements du devis (C1–C95) — rubrique de recette | Contractuel |

Le mandat (`IMPLEMENTATION-PROMPT.md`) demandait de *ne pas tout concevoir d'avance* :
c'est respecté — les phases de juillet sont au niveau fichier. Le commerce (04) était
au niveau jalons pour un kickoff de septembre ; il est désormais codé (lots 1–2) et sa
mise en production rejoint la fenêtre de bascule de juillet — seule la clôture
d'octobre (07) reste au niveau jalons.

## La stack, en une ligne par composant

Détail, rationale et points de bascule : [`stack.md`](stack.md).

| Composant | Choix | €/mois |
|---|---|---:|
| Base de données | **Neon Postgres** (Marketplace Vercel, Frankfurt) — Free en juillet, Launch au swap | ~3–8 |
| Back-office | **Payload CMS ≥ 3.73** (MIT), installé *dans* l'app Next 16 existante | 0 |
| Stockage couvertures/PDFs | **Vercel Blob** (`fra1`) | ~1–2 |
| Emails transactionnels + newsletter | **Brevo** (même compte) — Free, Starter les mois de campagne | 0 → 9–19 |
| Analytics sans cookie | **Vercel Web Analytics** *(option client : Plausible +9 €)* | ~0–1 |
| Erreurs / uptime | **Sentry Developer (région UE)** + **Better Stack Free** — Sentry S1a livré (org UE, 4 vars Vercel, source maps uploadées, event test reçu, alerte email par défaut) | 0 |
| Sauvegardes | GitHub Actions `pg_dump` chiffré → Blob privé + heartbeat (spéc. phase 6, unique) | 0 |
| **Total avec Vercel Pro (~20 €) + OVH conservé (~15,6 €)** | | **~40–47** (51–66 en campagne) |

Promesse devis §8 (~40–70 €/mois) : **tenue**. Deux gates techniques jour 1 :
`pnpm build` avec `withPayload` (compat Next 16.2.9 vérifiée pour Payload ≥ 3.73.0) et
création de l'org Sentry **en région UE (irréversible)** — **les deux sont francs au
12/07** : build `CATALOGUE_SOURCE=pg` vert (316/316 pages, zéro appel WordPress) et
Sentry S1a vérifié E2E. Le repli Payload (WordPress restant source via l'adaptateur
http) n'a plus lieu d'être invoqué.

## Chemin critique

```
pages légales + contenus 2026 (client, →17/07)
  →  fenêtre de bascule unique (24–28/07 proposée : site + pg + commerce)
  →  dons en RÉEL au flip (butée de secours 07/08)  →  campagne 15/08
```

> ✅ **Le risque KYC Stripe est LEVÉ (vérifié par API le 11/07)** : le compte live
> `acct_1TqsjgL6ffEZ7VRj` « Éditions sociales » est opérationnel (`charges_enabled` +
> `payouts_enabled`, zéro pièce en attente) et sa clé secrète est dans `site/.env`.
> ⚠️ Correctif d'acquis associé : la boutique legacy encaisse via **Paybox** (0 commande
> Stripe depuis 2018 — vérifié en base et par un checkout de test le 11/07, commande
> 7730) ; « vos lecteurs paient déjà via Stripe » (devis §3.2) est à **recadrer auprès
> du client** — la bascule commerce reste un vrai changement de PSP, désormais
> **simultanée** au flip du site plutôt qu'en septembre (traité : plan 04, risque 2 ;
> résiliation Paybox après drainage).

Le chemin critique restant est **entièrement côté client** : pièces légales (SIRET,
directeur de publication), paliers/objectif 2026, et les décisions propres à la
fenêtre de bascule (les 4 trous de la grille de port, les colonnes d'export, la
backlist pré-2020, les questions Q1–Q8 du plan 02, la date exacte de la fenêtre) —
d'où la démo consolidée du 15/07 (§Décisions). Chemin critique secondaire déjà résorbé
au 12/07 : gate Payload franchi (build pg vert), migration prouvée sur Neon réel (295
livres/256 auteurs/611 médias), merges faits (PR #9, #10, #12).

## Calendrier consolidé (bascule unique)

### Déjà fait (10–12/07)

| Quand | Quoi | Preuve |
|---|---|---|
| Ven 10 – dim 12/07 | Mail client groupé ; provisioning Neon/Blob/Sentry-UE ; catalogue Payload complet (P3 E0–E6bis), migration idempotente prouvée sur Neon réel | 295 livres / 256 auteurs / 611 médias importés |
| " | PR #9 — `compare-sources` corrigé (761→0 bloquant, classifieur réhébergement OVH→Payload étendu aux champs URL nus + hôtes `cms-*`), E11 réécriture des ~50 liens internes (`rewrite-html`), fix « pages décimales » (`catalogue-wp-map`) | Build `CATALOGUE_SOURCE=pg` vert, **316/316 pages, zéro appel WordPress** |
| " | PR #10 — commerce lot 1 : `Books.commerce{sellable, stock, stockSuivi, reducedShippingFlag}`, collections `orders`/`promo-codes`, global `reglages-boutique`, `scripts/migrate-products.ts` idempotent, import stock `/admin` (xlsx, rapport 4 sections) + widget stock bas | 208 produits appariés, 0 en attente sur les 11 cas d'arbitrage |
| " | PR #12 — commerce lot 2 : flag `COMMERCE_NATIVE` (`0` par défaut, iso-rendu), moteur de port pur en centimes, adaptateur produits pg (gated), `/boutique` + `/boutique/[slug]` (15 orphelins), panier, checkout Stripe `kind:order`, webhook étendu, exports CSV préparation/compta | Site strictement iso-rendu tant que le flag reste à `0` |
| " | Sentry S1a | Org ldes région UE, 4 vars Vercel, source maps, event test reçu |

### 15/07 — démo consolidée (décisions client)

Back-office + catalogue pg + commerce en preview + don test en séance. Feuille de
décisions unique : les 4 trous de la grille de port, les colonnes des exports
(préparation + compta), les contenus C90/légales (SIRET, directeur de publication —
placeholders bloquants), la backlist pré-2020 encore expédiable par le routeur ?, les
questions Q1–Q8 du plan `02-mise-en-production.md`, et la **date de la fenêtre de
bascule** (21/07 devenu agressif avec le commerce embarqué ; 24–28/07 réaliste ; butée
= campagne dons 15/08). Signalement au passage : erreur de saisie ACF
victor-hugo/CNR à faire corriger par le client.

### 16–23/07 — finitions avant la fenêtre

| Quand | Quoi |
|---|---|
| Jeu 16 – ven 17/07 | Légales publiées, contenus réels (E1bis du plan 02), paliers 2026 définitifs (**butée écrite 17/07**) |
| Semaine du 20/07 | E9 résiduel : e2e Stripe en clés test sur preview ; Brevo (compte + emails de commande) ; formation équipe Payload `/admin` ; dry-run transfert de propriété |
| J−7 / J−2 (avant la fenêtre) | TTL bas sur les zones ES et LD + les 4 records A/AAAA de `boutique`/`www.boutique` ; exports de zone committés |

### Fenêtre de bascule unique — proposée 24–28/07 (fusion des runbooks 02 + 04 en UN déroulé)

| Quand | Quoi |
|---|---|
| J−1 au soir | Gel édition WP + coupure du checkout Woo (purge des IPN Paybox en vol) ; dump frais ; re-run de la migration catalogue + produits ; archive |
| Jour J | `COMMERCE_NATIVE=1` + `CATALOGUE_SOURCE=pg` + `SITE_INDEXABLE=1` + `NEXT_PUBLIC_SITE_URL` + redéploiement ; flips DNS (ES, LD, `boutique`/`www.boutique` en CNAME Vercel) ; redirections 302 ; proxy `/wc-api/*` → `cms-boutique` (callbacks Paybox résiduels) ; smoke tests (1–2 commandes réelles remboursées) |
| Jour J → +2 semaines | Recouvrement : drainage des 107 commandes `wc-processing` via `cms-boutique` ; puis 302→301 après validation ; résiliation Paybox = décision client, après drainage uniquement |

### Invariants et garde-fous (inchangés)

MX/emails jamais touchés ; **gate E8 ladispi / 4 boîtes MXPLAN AVANT toute
résiliation** de slot OVH ; un livre n'est jamais retiré du catalogue faute d'être en
vente ; table de redirections + `verify-redirects` (cibles `/wp-content` à décider :
Blob ou `cms-es` minimal) ; E9 résiduel de la phase 2 (plan Pro facturé côté client,
GSC, trace écrite du transfert) ; recette ; archive saine et confirmée avant toute
extinction. `cms-*` n'est plus un prérequis de la fenêtre de bascule — c'est un filet
optionnel recommandé (`cms-boutique` **obligatoire** pour le drainage `wp-admin` des
107 commandes ; `cms-es`/`cms-ld` = assurance pas chère, pas un bloquant).

### Août — fermeture client, mou du calendrier

Surveillance ; correctifs sécurité uniquement ; butée de secours dons **07/08** si le
passage en réel a glissé ; **~10–14/08** checklist campagne (moniteurs, quotas, dump
< 24 h, webhooks) ; **sam 15/08 : lancement, Youri disponible**. Rien d'irréversible en
août.

### Octobre — clôture (inchangé)

La phase 7 possède la semaine : gates G1–G8 → archive remise + confirmation
**écrite** → 301 définitifs → extinction complète (catalogue **et** boutique,
phase A réversible) → nettoyage code (adaptateurs http/Woo retirés, flags
`CATALOGUE_SOURCE`/`COMMERCE_NATIVE` retirés, tag `wordpress-era-end`) → dossier de
réversibilité + runbook → **PV de clôture**. **~23/10** : drop fichiers + bases,
preuve écrite au client. Chantier clos.

## Contrats d'interface inter-phases (décisions transverses, déjà répercutées dans les plans)

1. **Webhook Stripe unique** : `src/app/api/stripe/webhook/route.ts`, discriminateur
   `metadata.kind` (`donation` en service depuis juillet, `order` livré par le lot
   commerce 2 — PR #12, actif dès `COMMERCE_NATIVE=1`), `Sentry.captureMessage` sur
   toute signature invalide (contrat phase 6, bloquant recette), endpoint sur le
   domaine final créé **le jour de la fenêtre de bascule unique** (24–28/07 proposé)
   en gardant celui de l'URL vercel.app.
2. **Clés Stripe** : live = production uniquement ; test = preview (posée dès juillet,
   à re-vérifier) + production jusqu'au jour de la fenêtre de bascule.
3. **Schéma `books`** : `edition` nullable + champ `origin` (`catalogue`|`boutique`) +
   unicité de slug couvrant l'espace `edition ∪ null` — posé en phase 3 (E2) pour
   accueillir les entrées boutique-seules sans migration délicate. **Livré et
   vérifié** : consommé sans friction par le lot commerce 1 (`Books.commerce{...}`,
   PR #10).
4. **Sauvegardes** : UN seul workflow, la spécification phase 6 (pg_dump chiffré
   `age` → store Blob **privé** dédié, rétention 30 j/12 mois, heartbeat). L'ex-E12
   de la phase 3 est supprimée ; S2 exécuté dans la fenêtre de bascule (24–28/07
   proposé).
5. **Transfert de propriété** : UN protocole de référence, phase 7 étape 9 (repo →
   projet → transferts **séparés** Neon + stores Blob — ils ne suivent PAS un
   transfert de projet — preuve = propriété dans le dashboard client, fallback team
   entière). Dry-run 17–20/07, exécuté en fin de fenêtre de bascule, vérifié/soldé en
   octobre. Team vs projet = décision client, démo du 15/07.
6. **Redirections** : `statusCode` explicites partout (302 pendant recouvrement, 301
   au définitif — jamais `permanent: false`, qui émet des 307).
7. **Ordre de merge anti-conflit** — exécuté : PR #9 (compare-sources/E11), #10
   (commerce lot 1), #12 (commerce lot 2) mergées dans `main` le 12/07, avant P2/P5.
8. **Sitemap** : chaque phase qui crée une route (`/contact` en P5, `/boutique` +
   `/boutique/[slug]` livrés par le lot commerce 2) met à jour `sitemap.ts` dans sa
   propre PR.

## Budget et effort — l'écart, dit franchement

Somme des plans après déduplication : **~16,8–18,3 j** contre **10 j vendus** (14 réels
avec le socle offert). Une grande part est agent-exécutable (scripts, redirections,
migration, moniteurs) : le temps humain net est plutôt de l'ordre de 8–10 j. Arbitrages
retenus (déjà intégrés aux plans) :

- **Leviers phase 4 activés d'office** : export compta V1 (profil préparation) + promos
  V1 (une seule règle en base aujourd'hui) → −1 à −1,5 j ; le périmètre complet devient
  l'option.
- Doublons supprimés : backup (−0,25 j), extinction boutique exécutée une fois (−0,4 j),
  transfert compté une fois (−0,5 j).
- Les ~2 j d'engagements §9 sans ligne chiffrée (transfert, réversibilité, PV) sont du
  travail de clôture assumé, étalé sur septembre–octobre.
- Le reste (week-ends des 11–12 et 18–19/07) est le régime de chantier déjà pratiqué.
- **Note coût récurrent à signaler au client** : le passage Neon Launch au swap (~19 $/mois
  au pire) dépasse la ligne unitaire « ~1 €/mois » du devis §8 ; l'enveloppe globale
  37–56 € l'absorbe, mais la ligne doit être corrigée dans le récapitulatif remis.
- Règle contractuelle (C45) : tout résidu qui menacerait le forfait est discuté **par
  écrit avant** engagement, jamais absorbé en silence.

## Couverture du devis et restes à porter hors plans

Audit de complétude : **87/95 engagements couverts** par l'union des plans ; les 8
restants sont traités ainsi :

| Engagement | Résolution |
|---|---|
| C32 mises en avant ponctuelles | Affecté : **P3 E6bis** (collection Payload `highlight` + bandeau accueil, ~0,25 j) |
| C94 ligne Email Pro en double (22,87 €) | Affecté : **P2 E8.0** (revue de facturation avec le client) |
| C51 message + moment du lancement figés avant le départ | Affecté : **P1 E11bis** (brief de lancement, avant la campagne du 15/08) |
| C91 contenus réels (réseaux sociaux, textes, rencontres) | Affecté : **P2 E1bis**, bloquant pour la fenêtre de bascule |
| C84 statut TVA du prestataire (293 B CGI) | **Hors plans — avant la 1re facture** (50 % à la commande) : confirmer franchise en base, ajuster les mentions de facture |
| C47 calendrier B **non** phasé | **Résolu le 12/07** — le client a choisi la bascule unique (abandon du phasage) ; la variante « B phasé » du devis est caduque, à formaliser dans l'avenant/récapitulatif remis |
| C64 ligne « base ~1 €/mois » | Voir note Neon Launch ci-dessus |
| C95 budget temps client | Tenir le registre : regrouper toutes les décisions sur 2 séances (15/07 et la fenêtre de bascule 24–28/07) — cumul actuel ≈ 6 h vs ~5–6 h annoncées |

## Feuille de décisions client (consolidée — ne pas les éparpiller)

**Mail groupé du ven 10/07 (envoyé, pièces et prérequis, une seule liste)** : accès
Dashboard Stripe pour Youri + vérif IBAN de payout (le compte live est opérationnel —
vérifié 11/07) ; mentions légales (SIRET, directeur de publication) ; paliers/objectif
2026 ; statut juridique (association ? → conditionne Stripe vs HelloAsso, CGV, reçus
fiscaux) ; comptes équipe back-office ; compte Google (GSC) ; compte Brevo existant ;
modalités de transfert de propriété.

**En séance, démo du mer 15/07** : montant libre + bornes ; adresse postale par palier ;
champ message (défaut recommandé : non — discipline de périmètre) ; affichage de la
jauge avant le 15/08 ; reçu de paiement ≠ reçu fiscal ; **transfert : team entière vs
projet + ressources** ; feu vert + **date de la fenêtre de bascule unique** (24–28/07
proposé) ; domaines défensifs ; page `/rencontres` ; statut « à paraître » dérivé ;
périmètre orthotypo ; bio auteurs ; compte Brevo + destinataire `/contact` ; analytics
(Vercel WA vs Plausible UE +9 €) ; **les 4 trous de la grille de port** ; **colonnes
des exports** préparation et compta ; **contenus C90/légales** (SIRET, directeur de
publication — placeholders bloquants) ; **la backlist pré-2020 est-elle encore
expédiable par le routeur ?** ; **les questions Q1–Q8 du plan `02-mise-en-production.md`**.
~~Kickoff commerce du lun 07/09~~ — **caduc** : le commerce est déjà codé (lots 1–2),
ses décisions rejoignent cette même séance du 15/07.

**Par écrit avant le ven 17/07** : paliers 2026 définitifs ; infos légales complètes ;
destinations des pages orphelines (ajustables tant que 302).

**Avant la fenêtre de bascule** : slot ladispi / 4 boîtes mail MXPLAN (gate E8 —
avant toute résiliation) ; 9 liens boutique cassés (statut : 11 cas résolus, 208
produits appariés, 0 en attente) ; validation écrite des 301 ; confirmation écrite des
archives catalogue et boutique.

**Après la fenêtre, sur drainage terminé** : résiliation Paybox — décision client,
jamais avant que les 107 commandes `wc-processing` soient drainées.

## Principes absolus (rappel — aucune exception)

1. **Jamais de destruction WordPress avant remplacement vérifié + exports remis** (et
   accusé de réception écrit du client pour chaque archive).
2. **Toute bascule de source = swap d'adaptateur derrière le port `CatalogueSource`** —
   le front ne se réécrit pas.
3. **Petites étapes visibles** : PRs, previews, démos — le client voit tout atterrir.
4. **Zéro scope creep** : pas de comptes clients, pas de multilangue, pas de GEME ; tout
   « pendant qu'on y est » passe par un chiffrage écrit préalable (C45).

## Risques d'ordonnancement résiduels

1. ~~KYC Stripe~~ **levé le 11/07** (compte live opérationnel, vérifié par API). Le
   risque externe restant sur le jalon existentiel : les **pièces client** (légales,
   paliers 2026) — relances + butée de secours 07/08 ; HelloAsso reste le plan B
   documenté (Q1 du plan dons) si le client le préfère pour les reçus fiscaux.
2. **Semaine du 13/07** — **résorbée** : l'essentiel prévu pour cette semaine
   (catalogue P3, commerce lots 1–2, Sentry S1a) est déjà mergé dans `main` au 12/07,
   en avance sur le calendrier initial du 09/07.
3. **Fenêtre de bascule unique (24–28/07 proposée) puis recouvrement** — l'ordre reste
   impératif : recette → 301 (E7 du plan 02) → transfert de propriété → extinction
   douce catalogue + boutique ; côté commerce, le recouvrement (drainage des 107
   commandes `wc-processing`) prend ~2 semaines et conditionne seul la résiliation
   Paybox — jamais les dons ni la campagne du 15/08.
4. **Payload ⟷ Next 16** — **clos le 12/07** : build `CATALOGUE_SOURCE=pg` vert,
   316/316 pages, zéro appel WordPress. Ce risque ne pèse plus sur le calendrier.

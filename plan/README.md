# Plan directeur — refonte complète (option B, variante B phasé)

*Établi le 2026-07-09 à partir du mandat (`../IMPLEMENTATION-PROMPT.md`), du devis validé
(`devis/DEVIS-MULTI-OPTIONS.md`, hors repo) et d'une reconnaissance complète (code, dumps
SQL, infra live, engagements). Les sept plans de phase de ce dossier ont chacun subi une
relecture adversariale puis une passe de cohérence croisée ; les contradictions
d'interface relevées sont **déjà corrigées** dans les documents. Ce README est le point
d'entrée : il fixe ce qui est transverse — stack, calendrier, contrats d'interface,
budget, décisions client — et renvoie aux plans pour le détail d'exécution.*

## Comment lire ce dossier

| Document | Contenu | Profondeur |
|---|---|---|
| [`01-dons.md`](01-dons.md) | Stripe Checkout sur `/souscription`, webhook, jauge, reçus, mise en réel | Exécutable (niveau fichier) |
| [`02-mise-en-production.md`](02-mise-en-production.md) | Légales, SEO, 301, découplage CMS, flips DNS, résiliation slot vide | Exécutable (niveau fichier) |
| [`03-catalogue.md`](03-catalogue.md) | Neon Postgres, Payload, migration 293 livres, couvertures, swap d'adaptateur, extinction WP catalogue | Exécutable (niveau fichier) |
| [`04-commerce.md`](04-commerce.md) | Panier, checkout unifié, port au poids, migration produits, archives, extinction boutique | Jalons (kickoff 07/09 affine) |
| [`05-communication.md`](05-communication.md) | Brevo (2 848 abonnés), formulaire d'inscription, `/contact` | Jalons |
| [`06-operations.md`](06-operations.md) | Sentry, Better Stack, analytics, sauvegardes chiffrées, garde boutique | Jalons |
| [`07-cloture.md`](07-cloture.md) | Gates de sortie, transfert de propriété (protocole de référence), réversibilité, PV | Jalons + checklist |
| [`stack.md`](stack.md) | Décision de stack arbitrée (3 propositions concurrentes → juge) | Décidé |
| [`annexes/donnees-reelles.md`](annexes/donnees-reelles.md) | Inventaire vérifié des dumps : meta_keys ACF, grille de port exacte, tables newsletter, volumes | Matière première migrations |
| [`annexes/engagements-devis.md`](annexes/engagements-devis.md) | Les 95 engagements du devis (C1–C95) — rubrique de recette | Contractuel |

Le mandat (`IMPLEMENTATION-PROMPT.md`) demandait de *ne pas tout concevoir d'avance* :
c'est respecté — les phases de juillet sont au niveau fichier, celles de septembre/octobre
au niveau jalons avec leurs décisions marquées « à affiner au kickoff ».

## La stack, en une ligne par composant

Détail, rationale et points de bascule : [`stack.md`](stack.md).

| Composant | Choix | €/mois |
|---|---|---:|
| Base de données | **Neon Postgres** (Marketplace Vercel, Frankfurt) — Free en juillet, Launch au swap | ~3–8 |
| Back-office | **Payload CMS ≥ 3.73** (MIT), installé *dans* l'app Next 16 existante | 0 |
| Stockage couvertures/PDFs | **Vercel Blob** (`fra1`) | ~1–2 |
| Emails transactionnels + newsletter | **Brevo** (même compte) — Free, Starter les mois de campagne | 0 → 9–19 |
| Analytics sans cookie | **Vercel Web Analytics** *(option client : Plausible +9 €)* | ~0–1 |
| Erreurs / uptime | **Sentry Developer (région UE)** + **Better Stack Free** | 0 |
| Sauvegardes | GitHub Actions `pg_dump` chiffré → Blob privé + heartbeat (spéc. phase 6, unique) | 0 |
| **Total avec Vercel Pro (~20 €) + OVH conservé (~15,6 €)** | | **~40–47** (51–66 en campagne) |

Promesse devis §8 (~40–70 €/mois) : **tenue**. Deux gates techniques jour 1 :
`pnpm build` avec `withPayload` (compat Next 16.2.9 vérifiée pour Payload ≥ 3.73.0, à
confirmer sur CE repo), et création de l'org Sentry **en région UE (irréversible)**.
Repli Payload si le gate casse : WordPress reste la source via l'adaptateur http, la démo
du 15/07 montre schéma + import — le front ne bouge pas.

## Chemin critique

```
KYC Stripe (lancé 10/07, externe)  →  pages légales (client, 10–17/07)
  →  dons en RÉEL (21–24/07, butée de secours 07/08)  →  campagne 15/08
```

Tout le reste a du flottement par rapport au seul jalon existentiel (dons avant le
15/08). Le seul risque non compressible est **externe** : le KYC Stripe et les pièces
client — d'où le mail groupé unique du 10/07 (une seule liste de pièces, §Décisions).
Chemin critique secondaire : gate Payload (10/07) → import complet (12/07) → merge
(14/07) → **démo back-office 15/07**.

## Calendrier consolidé (B phasé)

### Juillet — dons + catalogue + back-office + mise en production

> ⚠️ **Décalage d'ancrage (constaté sam 11/07)** : le plan a été établi le jeu 09/07 avec
> un J0 au ven 10/07 — qui n'a pas eu lieu. Le week-end 11–12/07 (déjà compté comme
> régime de chantier) absorbe le glissement : exécuter les actions « Ven 10/07 »
> **immédiatement** (le mail client groupé en tout premier — le KYC Stripe est le chemin
> critique et le client ne lira peut-être qu'à lundi 13/07). Les jalons (démo 15/07,
> swap 20/07, flips 21 et 24/07, dons réels avant fin juillet, butée de secours 07/08)
> restent inchangés.

| Quand | Quoi |
|---|---|
| **Ven 10/07** | Mail client groupé (pièces + décisions). Youri : merge PR #5, mu-plugin redéployé, provisioning Neon/Blob/Sentry-UE, arbitrage des 2 gates (Stripe local, `withPayload`). Agents : P1 E1–E8 (dons complet en local), P3 E0–E2 (schéma), P2 E1/E2/E4 (légales, SEO, redirections), P6 S1a (Sentry SDK) |
| Sam 11–dim 12 | P3 E3 : premier run complet de migration — 295 fiches dans `/admin` dimanche soir |
| **Lun 13/07** | Ordre de merge : P6 S1 → **P1 dons** → P3 E1.a (route groups, PR séparée). P1 E9 (dons en mode test sur prod-beta). P2 E3 découplage CMS (glissable au 14–15). P6 S1b : 9 moniteurs + TLS cms-* |
| Mar 14/07 | P3 E4–E6 + merge Payload → `/admin` réel en prod, front iso-rendu. Répétition démo |
| **Mer 15/07** | **DÉMO CONSOLIDÉE** : back-office + don test en séance + « le site est déjà sous surveillance ». Feuille de décisions unique (§Décisions). Prise en main équipe |
| Jeu 16–ven 17 | Légales publiées, contenus réels (E1bis), merge P2, domaines attachés (sans Redirect to Primary), échantillon client P3 E8, dry-run transfert (P7 9-bis). **Butée 17/07 : paliers 2026 + infos légales** |
| **Lun 20/07** | Gel de saisie WP 09:00 → delta final → parité 0 bloquant → **SWAP `CATALOGUE_SOURCE=pg`** → Neon Launch. Début P5 (Brevo) |
| **Mar 21/07** | **Flip DNS `editionssociales.fr`** + indexation + endpoint webhook Stripe sur domaine final + Redirect to Primary (même geste). Fenêtre **dons en RÉEL** s'ouvre |
| Mer 22–ven 24 | Import Brevo (3 appels) + `/contact`. **Flip DNS `ladispute.fr` ven 24/07**. P6 S2 : backup chiffré + test de restauration (condition d'extinction) |
| **Lun 27–ven 31/07** | Semaine de recette, **ordre impératif** : recette équipe → 302→301 (E7) → transfert de propriété (protocole P7 ét. 9) → **seulement ensuite** extinction douce WP catalogue (E11, le 31/07). Gate ladispi (Q5). Brief de lancement 15/08 figé par écrit (P1 E11bis) |

### Août — fermeture client, mou du calendrier

Surveillance ; correctifs sécurité boutique uniquement ; butée de secours dons **07/08**
si le KYC a glissé ; **~10–14/08** checklist campagne (moniteurs, quotas, dump < 24 h,
webhooks) ; **sam 15/08 : lancement, Youri disponible**. Rien d'irréversible en août.

### Septembre — commerce (kickoff lun 07/09)

Décisions figées au kickoff (grille : 4 trous, stock manuel, promos V1, colonnes export,
matching, date jour J) → semaine 1 : modèle de données + migration produits + moteur de
port testé ligne à ligne + panier → semaine 2 : `/boutique` orphelins + checkout
(`kind:"order"`) + webhook/emails + back-office commandes → semaine du 21 : recette
preview → **mar 29/09 jour J** : flip flag + DNS boutique + 302 → recouvrement 2 semaines.

### Octobre — clôture (la phase 7 possède la semaine, la phase 4 fournit)

**12–16/10** : gates G1–G8 → archive remise + confirmation **écrite** → 301 définitifs →
extinction boutique (phase A réversible) → nettoyage code (adaptateur http retiré, tag
`wordpress-era-end`) → dossier de réversibilité + runbook → **PV de clôture**.
**~23/10** : drop fichiers + bases, preuve écrite au client. Chantier clos.

## Contrats d'interface inter-phases (décisions transverses, déjà répercutées dans les plans)

1. **Webhook Stripe unique** : `src/app/api/stripe/webhook/route.ts`, discriminateur
   `metadata.kind` (`donation` dès la phase 1, `order` en phase 4), `Sentry.captureMessage`
   sur toute signature invalide (contrat phase 6, bloquant recette), endpoint sur le
   domaine final créé **le jour du flip** (21/07) en gardant celui de l'URL vercel.app.
2. **Clés Stripe** : live = production uniquement ; test = production (jusqu'au passage
   en réel) + preview (posée dès juillet pour la recette commerce de septembre).
3. **Schéma `books`** : `edition` nullable + champ `origin` (`catalogue`|`boutique`) +
   unicité de slug couvrant l'espace `edition ∪ null` — posé en phase 3 pour accueillir
   les ~20 produits boutique-seuls de la phase 4 sans migration délicate.
4. **Sauvegardes** : UN seul workflow, la spécification phase 6 (pg_dump chiffré `age` →
   store Blob **privé** dédié, rétention 30 j/12 mois, heartbeat). L'ex-E12 de la phase 3
   est supprimée ; S2 exécuté 21–24/07.
5. **Transfert de propriété** : UN protocole de référence, phase 7 étape 9 (repo → projet
   → transferts **séparés** Neon + stores Blob — ils ne suivent PAS un transfert de
   projet — preuve = propriété dans le dashboard client, fallback team entière). Exécuté
   fin juillet par P2 E9, dry-run 17–20/07, vérifié/soldé en octobre. Team vs projet =
   une décision client, démo du 15/07.
6. **Redirections** : `statusCode` explicites partout (302 pendant recouvrement, 301 au
   définitif — jamais `permanent: false`, qui émet des 307).
7. **Ordre de merge anti-conflit (10–17/07)** : PR #5 → P6 S1 → P1 dons → P3 E1.a (PR
   séparée) → P3 Payload → P2 E1–E4 → P5. (`next.config.ts` et `src/app/` sont touchés
   par plusieurs phases — cet ordre évite le train de conflits.)
8. **Sitemap** : chaque phase qui crée une route (`/contact` en P5, `/boutique` en P4)
   met à jour `sitemap.ts` dans sa propre PR.

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
| C51 message + moment du lancement figés avant le départ | Affecté : **P1 E11bis** (brief de lancement, semaine du 28/07) |
| C91 contenus réels (réseaux sociaux, textes, rencontres) | Affecté : **P2 E1bis**, bloquant pour le flip ES |
| C84 statut TVA du prestataire (293 B CGI) | **Hors plans — avant la 1re facture** (50 % à la commande) : confirmer franchise en base, ajuster les mentions de facture |
| C47 calendrier B **non** phasé | **Impossible** (le commerce est calé septembre) — faire confirmer B phasé à la démo du 15/07 ; sinon, à re-négocier explicitement |
| C64 ligne « base ~1 €/mois » | Voir note Neon Launch ci-dessus |
| C95 budget temps client | Tenir le registre : regrouper toutes les décisions sur 2 séances (15/07 et 28–31/07) — cumul actuel ≈ 6 h vs ~5–6 h annoncées |

## Feuille de décisions client (consolidée — ne pas les éparpiller)

**Mail groupé du ven 10/07 (pièces et prérequis, une seule liste)** : activation Stripe
live + invitation ; mentions légales (SIRET, directeur de publication) ; paliers/objectif
2026 ; statut juridique (association ? → conditionne Stripe vs HelloAsso, CGV, reçus
fiscaux) ; comptes équipe back-office ; compte Google (GSC) ; compte Brevo existant ;
modalités de transfert de propriété.

**En séance, démo du mer 15/07** : montant libre + bornes ; adresse postale par palier ;
champ message (défaut recommandé : non — discipline de périmètre) ; affichage de la jauge
avant le 15/08 ; reçu de paiement ≠ reçu fiscal ; **transfert : team entière vs projet +
ressources** ; feu vert + date du flip ES ; domaines défensifs ; page `/rencontres` ;
statut « à paraître » dérivé ; périmètre orthotypo ; date du gel (20/07) ; bio auteurs ;
compte Brevo + destinataire `/contact` ; analytics (Vercel WA vs Plausible UE +9 €) ;
**confirmation de la variante B phasé**.

**Par écrit avant le ven 17/07** : paliers 2026 définitifs ; infos légales complètes ;
destinations des pages orphelines (ajustables tant que 302).

**Avant fin juillet** : slot ladispi / boîtes MXPLAN ; 9 liens boutique cassés ;
validation écrite des 301 ; confirmation écrite des archives catalogue.

**Kickoff commerce du lun 07/09** : les 10 décisions listées en tête de `04-commerce.md`.
**Avant le ~25/09** : date du jour J + communication lecteurs + résiliation Paybox.

## Principes absolus (rappel — aucune exception)

1. **Jamais de destruction WordPress avant remplacement vérifié + exports remis** (et
   accusé de réception écrit du client pour chaque archive).
2. **Toute bascule de source = swap d'adaptateur derrière le port `CatalogueSource`** —
   le front ne se réécrit pas.
3. **Petites étapes visibles** : PRs, previews, démos — le client voit tout atterrir.
4. **Zéro scope creep** : pas de comptes clients, pas de multilangue, pas de GEME ; tout
   « pendant qu'on y est » passe par un chiffrage écrit préalable (C45).

## Risques d'ordonnancement résiduels

1. **KYC Stripe** — seul risque hors de contrôle sur le jalon existentiel. Parades :
   lancement le 10/07, suivi, plan B (compte neuf / HelloAsso) déclenché au 01/08.
2. **Semaine du 13/07** (la plus dense) — variable d'ajustement : P2 E3, glissable au
   14–15/07 sans casser de dépendance.
3. **Semaine du 28–31/07** — l'ordre recette → 301 → transfert → extinction douce est
   impératif ; tout report client ne fait glisser que l'extinction (dormance gratuite),
   jamais les dons.
4. **Payload ⟷ Next 16** — fenêtre de compatibilité étroite : versions épinglées, montées
   en tandem, gate jour 1, repli WordPress-source sans impact front.

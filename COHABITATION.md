# Cohabitation ancien(s) site(s) WordPress / nouveau site unifié — STATUT

> **Ce document est désormais un état des lieux, pas un plan d'exécution.**
> Le plan qui gouverne la suite est **`plan/02-mise-en-production.md`**
> (bascule unique). Ce fichier garde la valeur historique des décisions et
> contrats établis pendant la phase de construction (juin–juillet 2026) et
> constate ce qui a effectivement eu lieu.

## Ce qui a changé le 2026-07-12

Le plan initial (ci-dessous, §Les 4 phases) prévoyait un **découplage
progressif** : hostnames CMS d'abord, puis bascule DNS maison par maison
avec redirections, puis retrait progressif des front-ends WordPress — le
tout étalé sur plusieurs semaines, catalogue et commerce traités comme des
chantiers séparés dans le temps.

**Le client a abandonné cette progressivité le 12/07** au profit d'une
**bascule unique** : site, catalogue (`CATALOGUE_SOURCE=pg`) et commerce
(`COMMERCE_NATIVE=1`) basculent dans la **même fenêtre**, avec 24 h
d'indisponibilité autorisées en marge de réparation (déroulé visé : quelques
minutes réelles). Ce qui a rendu cette date tenable : le site ne lit plus
WordPress après bascule (build `CATALOGUE_SOURCE=pg` vérifié, 316/316 pages,
zéro appel WordPress) et le commerce natif est déjà écrit et mergé
(`COMMERCE_NATIVE`, PR #10 + #12) — il n'y avait donc plus de raison
d'étaler ce qui pouvait basculer d'un coup.

**Les phases 2 à 4 ci-dessous sont remplacées** par le runbook de
`plan/02-mise-en-production.md` (section « Runbook Jour J unique »). Le
découplage CMS (phase 2) en particulier n'est plus une précondition du
flip : voir `plan/02-mise-en-production.md` §« `cms-*` : statut revu » — il
devient un filet optionnel pour ES/La Dispute, et obligatoire seulement
pour la Boutique (drainage des commandes en cours pendant le recouvrement).

---

## Pourquoi la construction s'est faite sans risque (toujours vrai)

Le nouveau site a été construit **lecture seule** vis-à-vis des WordPress
existants (API REST + WooCommerce Store API) : il n'a jamais modifié leur
contenu, leur trafic ni leur disponibilité pendant toute la phase de
construction. C'est ce qui a permis de développer, migrer et tester sans
jamais interrompre les sites en production — et c'est ce qui rend la
bascule unique praticable : au moment du flip, le nouveau site a déjà été
prouvé contre des données réelles (migration idempotente, `compare-sources`
à 0 diff bloquant).

## Phase 1 — Preview beta — ✅ FAIT

- Nouveau site déployé sur Vercel en déploiement *preview*, domaines
  publics inchangés, l'app lisait les WP existants via leurs URLs publiques
  (`WP_ES_URL`, `WP_LD_URL`, `WC_STORE_URL`).
- Workflow *push git → build → preview* branché et vérifié : dépôt
  `yourimerad/editions-sociales-la-dispute` (privé), `vercel[bot]` déploie
  `main` en Production et chaque branche en Preview depuis le 2026-07-02.
  CI GitHub Actions (typecheck/lint/test) depuis le 2026-07-09.
- Catalogue + boutique vérifiés avec données réelles ; les 3 sites WP sont
  restés à 200 pendant toute la construction.
- Reste la **propriété** des comptes (repo sous `yourimerad`, projet Vercel
  sous `solidz`), pas la plomberie — traité par `plan/02-mise-en-production.md`
  §E9 (protocole de référence : `plan/07-cloture.md` §Étape 9).

## Phases 2 à 4 — remplacées par la bascule unique

Ce qui suit est **l'ancien plan**, conservé pour mémoire (il documente le
raisonnement qui a précédé la décision du 12/07 et reste la trace de ce qui
a été envisagé puis écarté). Il **ne décrit plus** ce qui va se passer —
se reporter à `plan/02-mise-en-production.md`.

### Phase 2 — Découplage CMS (ancien plan, non retenu comme préalable obligatoire)

Risque identifié à l'époque : le jour où `editionssociales.fr` pointerait
vers Vercel, l'URL REST utilisée par l'app (`https://editionssociales.fr/wp-json`) disparaîtrait puisque le domaine ne servirait plus WordPress.
L'action envisagée — donner à chaque WordPress un hostname stable non
public (`cms-es`/`cms-ld`) et y rebrancher `WP_ES_URL`/`WP_LD_URL` — reste
une **option valide** (filet de sécurité pas cher pendant la fenêtre
tampon), mais n'est **plus une précondition** : le catalogue pg a rendu ce
mécanisme inutile pour la continuité du site lui-même. Détail à jour :
`plan/02-mise-en-production.md` §« `cms-*` : statut revu ».

### Phase 3 — Bascule (cutover), domaine par domaine (ancien plan, non retenu)

L'ancien plan prévoyait un flip DNS par maison (ES d'abord, puis La
Dispute 48 h après) « pour limiter le risque », la boutique restant sur
WooCommerce jusqu'à une décision Stripe natif séparée. **Remplacé** par un
flip unique des trois domaines (ES, La Dispute, Boutique) le même matin —
cf. `plan/02-mise-en-production.md` §Runbook Jour J unique. Les
redirections 301 (SEO, liens partagés) restent un invariant : la table est
détaillée dans le même document.

### Phase 4 — Retrait progressif (ancien plan, désormais géré par la clôture)

L'extinction des front-ends WordPress, une fois le nouveau site stable, est
désormais traitée par `plan/07-cloture.md` (gates G1–G8, fenêtre tampon de
7 jours avant toute suppression de fichiers/bases). Le principe qui
survit : les WordPress restent vivants en lecture/administration pendant
toute la fenêtre de recouvrement post-bascule (drainage des commandes en
cours, accès de secours), jamais coupés net.

---

## Règles à respecter jusqu'à l'extinction complète des WordPress (toujours vraies)

Ces règles ont gouverné toute la construction et continuent de s'appliquer
tant que les trois WordPress ne sont pas éteints (gel de saisie au Jour J,
puis fenêtre tampon avant suppression — cf. `plan/07-cloture.md`) :

- **Ne pas renommer** le CPT `catalogue`, les taxonomies (`auteur`,
  `collection`, `parution`) ni les champs ACF (`isbn`, `prix`,
  `date_parution`, …) : c'est le contrat de données dont est né le modèle
  `Book`. Ajouter = OK, renommer/supprimer = casse la migration et tout
  outil de comparaison (`compare-sources.ts`).
- **Préserver le mu-plugin** `wp-content/mu-plugins/es-headless-rest.php`
  sur `www/` et `LaDispute/` (source versionnée : `wp-headless/es-headless-rest.php` dans ce repo — à redéposer s'il disparaît lors
  d'une maintenance WP), tant que le REST WordPress sert encore à quoi que
  ce soit (recette, comparaison de sources).
- Prévenir avant tout changement structurel WP (thème, permaliens,
  plugins REST) qui pourrait altérer la sortie de l'API.
- Un livre n'est **jamais retiré** du catalogue faute d'être en vente : il
  devient « à paraître » ou « indisponible en ligne » — invariant du modèle
  `Book`, valable aussi bien côté WordPress historique que côté Payload.

## État constaté au 2026-07-12

- [x] Sites WordPress + boutique en ligne, inchangés pendant toute la
      construction.
- [x] Couche data headless (REST + Store API) opérationnelle et vérifiée.
- [x] mu-plugin déployé sur `www/` et `LaDispute/`.
- [x] Phase 1 — beta déployée : `https://editions-sociales-la-dispute.vercel.app`
      (team Vercel `solidz`, provisoire — transfert de propriété traité par
      `plan/02-mise-en-production.md` §E9).
- [x] Workflow *push git → build → preview* branché et vérifié, CI
      GitHub Actions depuis le 2026-07-09.
- [x] **Catalogue Postgres/Payload** : migration idempotente prouvée sur
      Neon réel (295 livres / 256 auteurs / 611 médias), `compare-sources`
      à 0 diff bloquant, build `CATALOGUE_SOURCE=pg` vert (316/316 pages,
      zéro appel WordPress) — PR #9. Le swap n'est plus un acte isolé : il
      rejoint la fenêtre de bascule unique.
- [x] **Commerce natif** : lots 1 et 2 mergés derrière `COMMERCE_NATIVE`
      (panier, checkout Stripe, port, stock, exports) — PR #10, #12. La
      bascule du flag rejoint elle aussi la fenêtre unique.
- [ ] **Bascule unique** (site + catalogue + commerce) : fenêtre proposée
      24–28/07, gate d'entrée = décisions client du 15/07 (cf.
      `plan/02-mise-en-production.md` §Questions ouvertes). Butée : 15/08
      (campagne dons).
- [ ] Extinction des trois WordPress : gérée par `plan/07-cloture.md`
      après la fenêtre tampon post-bascule.

**Reste la référence à jour pour la suite : `plan/02-mise-en-production.md`
(runbook de bascule) et `plan/07-cloture.md` (extinction, transfert de
propriété, réversibilité).**

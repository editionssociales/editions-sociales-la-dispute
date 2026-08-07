# DevOps — stack, comptes, CI/CD, secrets

> **But.** Décrire la **stack d'exploitation** du site unifié (dépôt, intégration
> continue, hébergement, environnements, secrets, surveillance) et les **runbooks**
> de bascule de compte. Document interne, non destiné au client.
>
> Les documents de la refonte (`plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md`,
> `IMPLEMENTATION-PROMPT.md`) sont des **documents d'époque** — historiques depuis
> la coupure OVH du 2026-07-18, ne plus s'y référer pour l'état courant
> (`COHABITATION.md` a été supprimé du dépôt).
>
> **Relevé initial le 2026-07-09, re-vérifié le 2026-08-07** (remote, comptes,
> protection de branche, contrat d'environnement). Voir §2 pour tout re-vérifier.
>
> ⚠️ Aucun secret ici. Jamais de valeur de token — uniquement des **noms** de variables.

---

## 0. TL;DR

- Le **transfert de propriété** engagé au devis (*« tout est créé au nom de la
  structure du client »*) est **fait** pour les deux comptes structurants : dépôt
  GitHub sous **`editionssociales`** (compte client — `yourimerad` reste un remote
  secondaire `perso` et intervient comme invité), projet Vercel sous la **team LDES**
  (compte client, depuis le 2026-07-19). Restent les comptes périphériques (Sentry,
  Better Stack…) — protocole : `plan/07-cloture.md` étape 9, suivi dans
  `OPERATIONS.md` §6.
- **La CI est complète** : job `verify` (typecheck · lint · test · knip · build) sur
  chaque PR et sur `main`, build hermétique sur Postgres 17 jetable (§5). Plus de
  previews Vercel par PR (2026-07-24) : ce job est la seule vérification avant merge.
- **Stripe est opérationnel** : l'ancien blocage (`STRIPE_SECRET_KEY=NOT_SET`,
  relevé du 2026-07-09) est levé — clés posées (live/test par environnement), dons et
  boutique livrés. `STRIPE_SECRET_KEY` est l'interrupteur de paiement du site
  (`OPERATIONS.md` §3).
- **Postgres/Neon est la seule source** depuis la coupure OVH : plus aucun
  WordPress/WooCommerce lu, ni en prod ni au build.
- **La bascule DNS du lancement n'a pas eu lieu** : les domaines publics pointent
  encore sur OVH, le site vit sur l'URL beta Vercel (§3, runbook §6.3).

---

## 1. État vérifié (2026-08-07)

### 1.1 Dépôt

| Champ | Valeur |
|---|---|
| Remote `origin` | `https://github.com/editionssociales/editions-sociales-la-dispute.git` — **compte client** (type **User**, pas une organisation) |
| Remote `perso` | `https://github.com/yourimerad/editions-sociales-la-dispute.git` — l'ancien dépôt du prestataire, conservé en secondaire |
| Visibilité | **privé** |
| Branche par défaut | `main` |
| Flux | PR → merge |
| Protection de branche | **indisponible** : repo privé sous compte User plan Free — l'API répond 403 « Upgrade to GitHub Pro or make this repository public » (constat 2026-08-07, cf. §6.4) |
| CI | `.github/workflows/ci.yml`, job `verify` (typecheck · lint · test · knip · build) |
| Auth locale | `gh` + trousseau macOS, compte `yourimerad` (invité sur le dépôt client) |

Les branches résiduelles de l'époque (`feat/catalogue-couverture-seule`,
`worktree-*`) ne subsistent que sur le remote `perso` — sans impact sur le
dépôt client.

### 1.2 Hébergement

| Champ | Valeur |
|---|---|
| Plateforme | **Vercel** (imposé : OVH mutualisé ne peut pas exécuter Node — cf. `LEGACY-STACK.md` §0) |
| Projet | `editions-sociales-la-dispute` (`prj_A5GU0DpjwpzJEK4nbhTFmK4ToBP5`) |
| Team | **LDES** (`team_1xHVCSjDQnrhRVC139r0pODZ`, compte client `administrer-7372`) — accès API via `VERCEL_PAT` de `site/.env` |
| URL beta | `https://editions-sociales-la-dispute-mu.vercel.app` |
| Intégration Git | **active** (`vercel[bot]`) : `main` → Production — plus de previews par branche (2026-07-24, §5) |
| Variables d'env prod | posées à la main (non auditables depuis le dépôt) |

> Note (2026-07-19) : l'ancien **projet homonyme de la team solidz**
> (`prj_Mi6jIFHz…`, git-lié au repo perso `yourimerad/…`) doublait les builds de
> `main` en échec et squattait le domaine nu `editions-sociales-la-dispute.vercel.app`
> (figé au 2026-07-11) — **supprimé le 2026-07-19**. Le lien local est réglé :
> `site/.vercel/project.json` pointe sur le projet de la team LDES (vérifié
> 2026-08-07).

### 1.3 Base de référence

Plus de relevé manuel : la base verte est garantie par la CI, qui rejoue
typecheck · lint · test · knip · build sur chaque PR et sur `main` (§5,
`OPERATIONS.md` §4).

---

## 2. Ré-vérification

```bash
cd site

# Dépôt
git remote -v                                   # origin = editionssociales/…, perso = yourimerad/…
gh repo view editionssociales/editions-sociales-la-dispute --json visibility,defaultBranchRef
gh pr list --state all --limit 10
gh api repos/editionssociales/editions-sociales-la-dispute/branches/main/protection
#   403 « Upgrade to GitHub Pro » = protection indisponible (plan Free, repo privé)

# Identité du PAT posé dans .env (n'affiche jamais la valeur)
set -a; . ./.env; set +a
curl -s -H "Authorization: Bearer $GITHUB_PAT" https://api.github.com/user | python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])'

# Vercel — projet lié localement (attendu : editions-sociales-la-dispute, team LDES)
python3 -c 'import json;d=json.load(open(".vercel/project.json"));print(d["projectName"])'
vercel whoami --token "$VERCEL_PAT"

# Base de référence
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test
```

L'inventaire OVH/WordPress de `LEGACY-STACK.md` §1 est un document d'époque :
l'hébergement web qu'il décrit est coupé — seuls domaines et Email Pro restent
chez OVH (§3).

---

## 3. La stack, couche par couche

Le devis (option B, §6 « propriété des comptes ») engage : *chaque abonnement est
souscrit **au nom de la structure du client**, payé par lui, et le prestataire
intervient comme invité — jamais l'inverse.* La colonne **Propriétaire** est donc un
engagement contractuel, pas une préférence.

| Couche | État courant | Propriétaire | Statut |
|---|---|---|---|
| Code source | GitHub **`editionssociales`** (privé, compte User) | Client | 🟢 transféré |
| Intégration continue | GitHub Actions, job `verify` (typecheck · lint · test · knip · build, Postgres jetable) | Client (suit le dépôt) | 🟢 |
| Build / déploiement | Vercel relié à Git : `main` → Production ; **plus de previews par PR** (2026-07-24) | Client | 🟢 |
| Hébergement app | Vercel, team **LDES** (compte client) | Client | 🟢 transféré (2026-07-19) |
| Secrets / env | Vercel env (Production / Preview / Development) — répartition détaillée : `OPERATIONS.md` §3 | Client | 🟢 posés |
| Base de données | **PostgreSQL Neon** (schéma `payload`), sauvegarde hebdo chiffrée hors fournisseur (`OPERATIONS.md` §5) | à confirmer au transfert des comptes périphériques | 🟢 livrée |
| Back-office | Payload `/admin` (rôles, migrations versionnées) | — (dans l'app) | 🟢 livré |
| Paiement | **Stripe natif** — dons ET boutique, interrupteur `STRIPE_SECRET_KEY` (`OPERATIONS.md` §3) | Client | 🟢 livré |
| Médias (couvertures) | **Vercel Blob** (store public) + optimiseur d'images Vercel — pas de copie hors Vercel à ce jour (`OPERATIONS.md` §5) | Client | 🟢 |
| E-mail transactionnel | **Brevo** (contact + email de commande) — dégrade proprement sans clé (`brevoConfigured`) | à confirmer | 🟢 livré côté code |
| Newsletter | **Brevo**, double opt-in | à confirmer | 🟢 livré côté code |
| Erreurs / uptime / stats | **Sentry** opérationnel ; Better Stack **à venir** ; Web Analytics livré, produit non activé (`OPERATIONS.md` §1, §6) | Sentry : à transférer | 🟠 partiel |
| Domaines + Email Pro | **OVH** (registrar + MX), inchangé | Client | 🟢 rien à faire |

Les comptes périphériques (Sentry, Neon, Brevo, Better Stack à venir) restent à
transférer/confirmer au nom de la structure — protocole : `plan/07-cloture.md`
étape 9, suivi dans `OPERATIONS.md` §6.

**⚠️ La bascule DNS du lancement n'a pas eu lieu** (constat 2026-08-07 : les
trois domaines publics — `editionssociales.fr`, `ladispute.fr`,
`boutique.editionssociales.fr` — pointent encore sur l'IP mutualisée OVH
`213.186.33.17` ; le nouveau site vit sur l'URL beta Vercel). La « coupure
OVH » du 2026-07-18 est une coupure **du code** (plus aucun WordPress lu),
pas des domaines. Au lancement : bascule **enregistrement par
enregistrement**, sans **jamais** toucher les MX (`mx*.ovh.net` — l'Email Pro
reste chez OVH), cf. runbook §6.3.

---

## 4. Contrat d'environnement

Le contrat vit dans le code : `src/lib/env.ts:envSchema`, appelé au boot par
`instrumentation.ts:register()` (`assertEnv`), avant que le serveur Next
n'accepte la moindre requête — dev comme prod. La liste commentée des
variables : `.env.example` ; leur répartition (Vercel / secrets GitHub /
poste du dev) : `OPERATIONS.md` §3.

### 4.1 Variables lues par l'application

Depuis la coupure OVH, plus aucune URL WordPress : la base Postgres n'est
plus optionnelle. Trois familles (`src/lib/env.ts`) :

- **Requises — échec au démarrage si absentes** : `DATABASE_URL` (poolée
  Neon) et `PAYLOAD_SECRET`. Sans elles, ni catalogue ni back-office ;
  l'absence plante au boot avec un message explicite, jamais au fond d'une
  requête. Le build est lui aussi bruyant : hermétique Postgres, il échoue
  franchement sans base joignable (plus aucun repli codé en dur).
- **Optionnelles mais validées en forme si posées** (absence = phase non
  provisionnée ; malformée = échec au boot) : `DATABASE_URL_UNPOOLED`,
  `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`,
  `SITE_INDEXABLE`, `REDIRECTS_PERMANENT`, `BREVO_DOI_TEMPLATE_ID`,
  `BREVO_LIST_ID_SITE`, `CONTACT_TO_EMAIL`.
- **Interrupteurs de phase, volontairement non validés en forme** :
  `STRIPE_SECRET_KEY` (`stripe.ts:stripeEnabled` — coupe dons ET boutique,
  cf. `OPERATIONS.md` §3) et `BREVO_API_KEY` (`brevo.ts:brevoConfigured`) —
  une valeur absente ou non reconnue est un état documenté, pas une erreur.
  `BLOB_READ_WRITE_TOKEN` (médias) : absent en dev, le stockage bascule en
  local (`./media`).

### 4.2 Variables d'outillage (jamais lues par `src/`)

`GITHUB_PAT`, `VERCEL_PAT`, `SENTRY_PAT`… vivent dans `site/.env`, **hors Git**
(`.gitignore` : `.env*` sauf `.env.example`). Elles ne doivent **jamais** être ajoutées
aux variables d'environnement Vercel : un PAT GitHub exposé au runtime du site est une
escalade de privilèges gratuite.

Règle transverse, vérifiée au boot (`env.ts:checkEnv`) : **aucune clé
`sk_live_` hors Production.** Une PR ne doit pas pouvoir encaisser un
paiement réel — bases et clés Stripe **distinctes par environnement**.

---

## 5. Pipeline CI/CD

```
  PR ouverte
    └── GitHub Actions « verify »  → typecheck · lint · test · knip · build   (Postgres 17 jetable)
         ↓ vert
       merge sur main
         ↓
       Vercel Production Deployment  → `vercel-build` = migrate:prod + next build
```

Il n'y a plus de déploiement **Preview** Vercel par PR (constat 2026-07-24, cf.
`CLAUDE.md` § Verification) : le job `verify` est donc la **seule** vérification du
build avant merge. `vercel[bot]` ne promeut plus que `main` en Production.

### Le `build` est de retour dans GitHub Actions

Ce qui gardait `pnpm build` hors d'Actions (posé le 2026-07-09, quand ce document a été
relevé) : `generateStaticParams` pré-rendait 295 fiches via `catalogue-http.getBook()`,
**une requête REST par slug** vers l'hébergement OVH mutualisé qui servait aussi le
trafic public des trois WordPress — un build à froid par PR y aurait envoyé ~300
requêtes PHP, en plus de celles du déploiement preview Vercel qui vérifiait déjà le
build à l'époque.

Les deux prémisses sont tombées : la **coupure OVH** (2026-07-18) a supprimé
`catalogue-http.ts` — le catalogue lit désormais PostgreSQL (Payload), un `SELECT`, pas
300 requêtes HTTP — et il n'y a **plus de preview Vercel par PR** (2026-07-24) pour
vérifier le build à sa place. Le job `verify` lance donc `pnpm migrate` puis
`pnpm build` juste après `pnpm knip`, contre un **Postgres 17 jetable** (service
container du job : schéma via les migrations versionnées, catalogue vide) — **zéro
lecture Neon en CI**, décision du 2026-07-27 : brancher la CI sur la vraie base
(secrets GitHub posés le 26/07) coûtait une rafale catalogue complète par push et a
contribué à épuiser le quota de transfert Neon Free (5 Go/mois) le 26/07. Le build
vérifie la chaîne de compilation et la collecte des pages, pas les données ; les
fiches ne sont de toute façon plus pré-rendues au build (`generateStaticParams`
vide, cf. `src/app/CLAUDE.md`). Les secrets GitHub Actions `DATABASE_URL`/
`PAYLOAD_SECRET` ne servent plus à ce job et peuvent être supprimés (geste humain,
sans urgence — ils ne sont plus référencés par `ci.yml`).

### Risque éteint : le catalogue tronqué en silence

Risque de l'ère WordPress (une pagination REST qui avalait ses erreurs pouvait
livrer un catalogue amputé, mis en cache une heure, fiches réelles pré-rendues
en 404), mitigé à l'époque par un garde-fou d'intégrité
(`assertCatalogueComplete`, seuil ±5 % autour d'un total connu). La mitigation
« définitive » prévue est advenue : la source est PostgreSQL, une lecture
partielle n'est plus représentable — le garde-fou et la pagination HTTP
(`catalogue-integrity.ts`, `fetch-all-pages.ts`, `catalogue-http.ts`) ont été
retirés du code avec la coupure OVH. Le contrat de dégradation propre côté
runtime (liste vide, jamais de 500) est décrit dans `OPERATIONS.md` §7.

---

## 6. Runbooks de bascule

> ⚠️ Ces runbooks agissent sur des **comptes tiers** (client) et sont
> **irréversibles ou visibles publiquement** — jamais sans accord explicite.
> **6.1 et 6.2 ont été exécutés** (dépôt et projet Vercel transférés) et ne
> subsistent qu'à l'état de trace. Restent à faire : **6.3** (bascule DNS du
> lancement) et **6.4** (protection de `main`, bloquée par le plan GitHub).

### 6.1 ✅ Dépôt transféré vers le compte client

Fait (constaté le 2026-08-07) : `origin` =
`editionssociales/editions-sociales-la-dispute` (compte **User**). Le transfert
GitHub a préservé historique et PR ; `yourimerad` intervient comme invité,
conformément au devis. L'ancien dépôt subsiste en remote `perso` — ses branches
résiduelles (`feat/catalogue-couverture-seule`, `worktree-*`) sont sans impact
(nettoyage possible : `git push perso --delete …`).

Après tout renouvellement du `GITHUB_PAT` (fine-grained), vérifier qu'il porte
`Contents: write`, `Pull requests: write`, `Administration: write` sur le dépôt.

### 6.2 ✅ Projet Vercel transféré

Fait le 2026-07-19 : projet `editions-sociales-la-dispute` sous la team **LDES**
(compte client `administrer-7372`) ; ancien projet homonyme de la team `solidz`
supprimé (§1.2) ; lien local (`vercel link`) refait. Accès API : `VERCEL_PAT`
(`site/.env`).

> ⚠️ Piège vérifié à l'époque, toujours vrai pour toute bascule future : un
> transfert de dépôt GitHub **casse** la liaison Vercel↔Git tant que l'app
> GitHub « Vercel » n'est pas réautorisée sur le nouveau propriétaire — les
> déploiements cessent **silencieusement** (plus de `vercel[bot]`, aucun
> message d'erreur). Après toute bascule : vérifier qu'un push sur `main`
> produit bien un déploiement Production.

### 6.3 Bascule DNS du lancement (à faire)

Les variables d'environnement sont posées (`OPERATIONS.md` §3, `.env.example`
pour la liste) — le geste restant est la bascule des domaines publics (§3 :
encore sur l'IP mutualisée OVH au 2026-08-07). Au lancement, dans la zone OVH
de chaque domaine :

- basculer **enregistrement par enregistrement** les entrées web (`A`/`CNAME`
  de l'apex et de `www`, plus `boutique.editionssociales.fr`) vers Vercel
  (valeurs : dashboard Vercel → Domains, après ajout des domaines au projet) ;
- ne **jamais** toucher les MX (`mx*.ovh.net`) ni les enregistrements Email
  Pro — l'email reste chez OVH ;
- après bascule : poser `SITE_INDEXABLE=1`, puis — une fois les destinations
  de reprise validées — `REDIRECTS_PERMANENT=1` (302 → 301, cf.
  `.env.example`) ;
- réévaluer les réglages « phase de dev » (`OPERATIONS.md` §8).

### 6.4 Protéger `main` — bloqué par le plan GitHub

Indisponible en l'état : repo **privé** sous compte **User plan Free** — l'API
répond 403 « Upgrade to GitHub Pro or make this repository public » (constat
2026-08-07). Options : passer le compte client en GitHub Pro, ou rendre le
dépôt public. En attendant, la discipline PR + le job `verify` tiennent lieu
de garde-fou — aucune protection technique n'empêche un push direct sur `main`.

Le jour où c'est débloqué :

```bash
gh api -X PUT repos/editionssociales/editions-sociales-la-dispute/branches/main/protection \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=typecheck · lint · test · knip · build' \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F enforce_admins=false \
  -F restrictions=null
```

Équipe non technique, un seul développeur : exiger une **revue** bloquerait tout. On
exige donc les **checks verts**, pas un approbateur.

---

## 7. Ce qui bloque, et qui peut le débloquer

**Plus aucun blocage dur.** Les cinq blocages du relevé initial (2026-07-09)
sont levés :

| # | Blocage d'époque | Résolution |
|---|---|---|
| 1 | `STRIPE_SECRET_KEY` = `NOT_SET` — les dons (échéance du 15 août) non implémentables | Levé : clés posées (test/live par environnement), dons **et** boutique livrés (Stripe Checkout natif). |
| 2 | Stripe vs HelloAsso selon le statut juridique | Tranché : **Stripe natif**, un seul moteur pour dons et commandes. |
| 3 | Propriétaire du token Vercel inconnu | Réglé : `VERCEL_PAT` (`site/.env`) sur la team client **LDES**. |
| 4 | `editionssociales` : compte ou organisation ? | Compte **User** — transfert du dépôt fait (§6.1). |
| 5 | Dépendance à la **Legacy REST API** de WooCommerce | Caduc : la boutique WooCommerce s'est éteinte avec la coupure OVH ; l'export comptable est natif (moteur de commerce). |

Les gestes restants sont du provisioning et du transfert, pas des blocages :
bascule DNS du lancement (§6.3), protection de `main` (§6.4), comptes
périphériques, moniteurs et garde de l'identité age (`OPERATIONS.md` §5–§6).

---

## 8. Références

- `OPERATIONS.md` — runbook d'exploitation : secrets, sauvegarde, incidents,
  réglages de la phase de dev.
- `../devis/DEVIS-MULTI-OPTIONS.md` — cadrage commercial (option B retenue).
- Documents d'époque de la refonte — historiques, ne plus s'y référer pour
  l'état courant : `plan/` (entrée : `plan/README.md`),
  `IMPLEMENTATION-PROMPT.md`, `LEGACY-STACK.md` (l'inventaire OVH/WordPress
  qu'il décrit est coupé), `REVERSIBILITE.md` (`COHABITATION.md` a été
  supprimé).

<!-- Maintenir à jour à chaque bascule de compte ou changement de pipeline. -->

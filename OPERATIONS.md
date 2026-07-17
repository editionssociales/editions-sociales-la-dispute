# OPERATIONS.md — Runbook d'exploitation

> État au 17/07/2026. Ce document distingue **code livré** (présent dans ce
> dépôt, jalon S1a de `plan/06-operations.md` vérifié, ou jalon S2 dont le
> code fait partie de ce même changeset) de **provisioning fait** (secrets
> posés, comptes créés, gestes humains/infra exécutés) — les deux ne sont pas
> synchrones : un mécanisme peut être entièrement codé et rester inopérant
> tant que son provisioning n'est pas fait (signalé explicitement à chaque
> section concernée). Tout le reste (S1b, S3 — ni code ni provisioning) est
> marqué **« à venir »** — ne pas s'y fier tant que ce n'est pas coché ici.
> Référence complète : `plan/06-operations.md`.

## 1. Vue d'ensemble — qui reçoit quoi, aujourd'hui

À ce stade du chantier, un seul canal d'alerte est **opérationnel** : **Sentry**,
reçu par Youri (email). Le code de la sauvegarde nocturne et du SDK Vercel Web
Analytics est **livré** (voir §5 et §6) mais **pas encore opérationnel** —
provisioning humain restant. Les moniteurs de disponibilité (Better Stack) et
l'élargissement des destinataires à la structure
(`toutes@editionssociales.fr`) restent **à venir** — voir §6.

## 2. Erreurs applicatives — Sentry (S1a, livré)

Le SDK est en place dans le repo :

- `src/instrumentation.ts` (hook serveur, Next ≥ 15 — `onRequestError`
  capture les erreurs **non gérées** des Server Components, route handlers et
  server actions) ;
- `src/instrumentation-client.ts` (SDK navigateur) ;
- `sentry.server.config.ts` (config serveur — erreurs seules, pas de tracing,
  pas de PII) ;
- `next.config.ts` — wrappé `withSentryConfig` (upload des source maps au
  build, `telemetry: false`).

**Variables d'environnement** (posées côté Vercel, jamais dans le repo) :
`NEXT_PUBLIC_SENTRY_DSN` (public, client), `SENTRY_AUTH_TOKEN` (build,
sensible), `SENTRY_ORG`, `SENTRY_PROJECT`. Sans `NEXT_PUBLIC_SENTRY_DSN`
posée, le SDK reste **no-op** — ni erreur, ni build cassé (dev, previews sans
secret).

Un second token, **`SENTRY_DASHBOARD_TOKEN`** (scope minimal `event:read`,
séparé du token de build), alimente le panneau « Diagnostic technique » du
tableau de bord `/admin`. Absent → panneau gris « indisponible », le reste du
dashboard continue de fonctionner.

**Ce que Sentry voit, et ce qu'il ne voit pas.** `onRequestError` ne couvre
que les exceptions **non gérées**. Un webhook Stripe qui répond `400`
proprement (signature invalide) est **invisible** de ce mécanisme — d'où une
capture **explicite**, déjà codée dans `src/app/api/stripe/webhook/route.ts` :
toute signature invalide (`Sentry.captureMessage`) et toute erreur métier
gérée du handler (`Sentry.captureException`) remontent dans Sentry même
quand la réponse HTTP reste propre. C'est le contrat imposé par
`plan/06-operations.md` à la phase Dons, et il est en place.

**Quotas** : plan Developer, 5 000 erreurs/mois, org en **région UE**
(choix irréversible à la création — déjà fait). Si un bug en boucle mange le
quota, la spike protection de Sentry limite la casse ; au-delà, passer en
plan payant est documenté comme repli dans `plan/06-operations.md` (risque
R2).

## 3. Secrets — où ils vivent

Aucun secret ne vit dans ce dépôt. `.env.example` liste les **noms** de
variable ; les valeurs réelles vivent dans trois endroits distincts, à ne
jamais confondre :

| Emplacement | Contenu | Qui y touche |
|---|---|---|
| **Vercel (Production / Preview / Development)** | Tout ce que l'application lit au runtime : `DATABASE_URL(_UNPOOLED)`, `PAYLOAD_SECRET`, `BLOB_READ_WRITE_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`/`SENTRY_PROJECT`, `SENTRY_DASHBOARD_TOKEN`, `CATALOGUE_SOURCE`, `COMMERCE_NATIVE`, `SITE_INDEXABLE`, `NEXT_PUBLIC_SITE_URL` | Youri (dashboard Vercel ou `vercel env`) — jamais affichées en clair, jamais dans un log |
| **Secrets GitHub Actions** (repo → Settings → Secrets) | Ce qui sert à la CI et au futur workflow de sauvegarde (§5) : rien aujourd'hui côté CI (le job `verify` n'a besoin d'aucun secret) ; `NEON_DATABASE_URL`, `BLOB_BACKUP_RW_TOKEN`, `BETTERSTACK_HEARTBEAT_URL` pour le backup, une fois provisionnés | Youri |
| **Poste du développeur** (`.env` / `.env.local`, hors Git — `.gitignore`) | Outillage uniquement : `GITHUB_PAT`, `VERCEL_TOKEN` — jamais lus par `src/`, jamais posés côté Vercel (un PAT GitHub exposé au runtime du site serait une escalade de privilèges gratuite) | Youri |

Règle d'or, rappelée de `DEVOPS.md` : **jamais de clé Stripe `sk_live_` hors
Production** — une Preview ne doit jamais pouvoir encaisser un paiement réel.
Le garde-fou est codé (`src/lib/env.ts:checkEnv`) et jette au boot
(`assertEnv`, appelé par `instrumentation.ts`) si une clé live traîne hors
production.

## 4. Vérifications du repo

CI (`.github/workflows/ci.yml`), sur chaque PR et sur `main` :

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm knip     # exports / fichiers / dépendances morts
```

**`pnpm build` n'est volontairement pas dans la CI** : tant que le catalogue
lit les WordPress via REST (`CATALOGUE_SOURCE` non posée), un build à froid
déclenche **~300 requêtes** vers l'hébergement OVH mutualisé qui sert aussi
le trafic public — le doubler (Actions + preview Vercel) ferait payer au
client la charge de la CI. Le build est vérifié **une seule fois**, par le
déploiement preview Vercel de chaque PR. Cette contrainte tombe à la bascule
catalogue (`CATALOGUE_SOURCE=pg` en production) — le build redevient
hermétique et pourra rejoindre `ci.yml` (voir `DEVOPS.md`).

Après tout changement de schéma Payload (collection, champ, global) :
`pnpm generate:types` puis commit du `src/payload-types.ts` régénéré.

## 5. Sauvegarde nocturne (jalon S2)

> **Code livré, provisioning pas fait.** `.github/workflows/backup-db.yml`
> fait partie de ce même changeset — le workflow existe bien dans ce dépôt,
> ce qui suit décrit son fonctionnement **réel**, pas une spécification à
> vérifier plus tard. Ce qui reste à faire est uniquement le **provisioning
> humain/infra** (secrets GitHub Actions, paire de clés age, store Blob
> privé) détaillé en fin de section — tant qu'il n'est pas fait, le workflow
> livré ne peut pas tourner utilement (il échouera faute de secrets).

**Principe** : `.github/workflows/backup-db.yml`, cron quotidien en heure
creuse (`47 3 * * *` UTC) + déclenchement manuel (`workflow_dispatch` pour la
recette). Chaîne du job :

1. `pg_dump --format=custom --no-owner` sur `DATABASE_URL_UNPOOLED` (URL
   **directe** Neon, jamais le pooler) → un fichier daté.
2. Chiffrement **par clé publique age** (`age -r age1…`) — la clé publique est
   en clair dans le workflow, **aucun secret de déchiffrement ne transite par
   la CI**.
3. Upload sur un **store Vercel Blob privé dédié** aux sauvegardes
   (`es-ld-backups`, région `fra1`, lecture authentifiée uniquement —
   **jamais** le store médias public de la phase catalogue), sous
   `backups/daily/…` (et une copie `backups/monthly/` le 1er du mois).
4. Copie additive des médias ajoutés/modifiés depuis le store public vers le
   store privé (jamais de suppression côté sauvegarde).
5. Purge (`scripts/backup-prune.mjs`) : conserve 30 sauvegardes quotidiennes
   + 12 mensuelles.
6. Dernier step (succès uniquement) : ping d'un heartbeat Better Stack — si le
   job échoue, est annulé par GitHub, ou ne tourne pas, l'absence de ping
   déclenche une alerte « sauvegarde manquante ».

**Comment récupérer et restaurer un dump** (procédure, à exécuter par
quiconque détient le fichier d'identité age) :

```bash
# 1. télécharger le blob chiffré depuis le store privé (authentifié)
# 2. déchiffrer avec le fichier d'identité age (jamais commité, jamais en secret CI)
age -d -i backup-identity.txt catalogue-AAAAMMJJ.dump.age > catalogue-AAAAMMJJ.dump
# 3. restaurer (idéalement sur une base/branche jetable pour un test)
pg_restore --clean --no-owner -d "$URL_CIBLE" catalogue-AAAAMMJJ.dump
# 4. comptages de contrôle (livres, auteurs, collections) contre la prod
```

**Prérequis humains — pas encore faits, à provisionner avant que ce jalon
soit opérationnel** (détail complet : `plan/06-operations.md`, préconditions
P6–P8) :

- créer le store Vercel Blob **privé** dédié (`vercel blob create-store
  es-ld-backups --access private`, région `fra1`) et poser les secrets GitHub
  Actions `NEON_DATABASE_URL`, `BLOB_BACKUP_RW_TOKEN`,
  `BETTERSTACK_HEARTBEAT_URL` ;
- générer la paire de clés age **hors CI** (`age-keygen`) et remettre le
  fichier d'identité (clé privée) à **Youri et au client**, jamais commité,
  jamais en secret CI ; coller la clé publique dans le workflow ;
- passer le plan Neon de Free à **Launch** et configurer la fenêtre de
  restauration à 7 jours (dashboard Neon → Backups/Restore).

Tant que ces trois points ne sont pas faits, le workflow — même livré — ne
peut pas tourner utilement. C'est un prérequis **humain/infra**, pas du code.

## 6. À venir

Deux catégories distinctes, à ne pas confondre : ce qui n'a **aucun code**
dans ce dépôt (S1b, S3 — pas encore livré), et ce qui est **livré mais pas
encore activé** faute d'un geste humain (provisioning).

**Pas encore livré (S1b, S3 — aucun code dans ce dépôt)** :

- **Moniteurs Better Stack** (9 sondes de disponibilité : site, catalogue,
  souscription, fiche livre, sources WordPress ES/LD, Store API boutique,
  santé dons, `wp-admin` de la boutique pendant le recouvrement) — non
  configurés à ce jour.
- **Garde du recouvrement boutique** (étape 9bis) — s'active à la fenêtre de
  bascule unique, pas avant.

**Livré, provisioning restant** :

- **Vercel Web Analytics** — le SDK est installé (`@vercel/analytics` dans
  `package.json`) et monté (`<Analytics />` dans `src/app/(site)/layout.tsx`).
  Reste à activer le produit côté dashboard Vercel (Analytics tab du projet) —
  sans quoi le composant reste un no-op silencieux, comme Sentry sans DSN.
- **Sauvegarde nocturne** (§5) — workflow livré, secrets/clés/store à
  provisionner.
- **Test de restauration démontré** (étape 7 du jalon S2) — ne peut se faire
  qu'une fois le workflow de backup **opérationnel avec ses secrets** (le
  code, lui, est déjà là — voir §5).

**Ni code ni provisioning (transfert, hors périmètre technique)** :

- **Transfert de propriété des comptes** (Sentry, Better Stack, Vercel…) vers
  la structure — protocole de référence : `plan/07-cloture.md`, étape 9.
- Élargissement des destinataires d'alerte à l'email de la structure — décidé
  à la recette (Q2 de `plan/06-operations.md`).

## 7. Procédure d'incident de base

**Le site semble en panne ou se comporte mal.**

1. Regarder les issues récentes dans le dashboard Sentry (org UE) — une
   erreur non gérée y apparaît avec fichier/ligne `src/…` lisibles.
2. Regarder l'état du dernier déploiement dans le dashboard Vercel (build en
   échec ? runtime error sur une fonction ?) et les logs de la fonction
   concernée.
3. Vérifier que les variables d'environnement attendues sont bien posées sur
   la cible (Production vs Preview) — une variable manquante ou malformée
   fait échouer le démarrage avec un message explicite (`assertEnv`,
   `src/lib/env.ts`) plutôt que de planter en silence au fond d'une requête.

**Le catalogue paraît vide ou incomplet.** Le contrat du repo est de
dégrader proprement (jamais de 500) : une liste partielle ou vide signale
presque toujours une source WordPress indisponible ou en limite de débit,
pas un bug du site. Vérifier l'accessibilité de `WP_ES_URL`/`WP_LD_URL` (ou
`CATALOGUE_SOURCE=pg`/l'état de la base Neon après la bascule).

**La jauge de dons ne semble pas bouger après un paiement.** Ce n'est pas
forcément un incident : la chaîne de fraîcheur documentée
(`src/app/CLAUDE.md`) admet jusqu'à ~3 minutes (indexation Stripe ~1 min +
fenêtre de cache 60 s + un aller de revalidation). En dessous de ce délai,
rien à faire. Au-delà, vérifier `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
et les issues Sentry du handler webhook (§2).

**Rollback du catalogue Postgres** (une fois `CATALOGUE_SOURCE=pg` posé en
production) : procédure et préconditions détaillées dans
`plan/03-catalogue.md`, section E9 — ne jamais l'exécuter sans avoir vérifié
au préalable que les WordPress source sont bien joignables aux URLs
configurées (un rollback aveugle après découplage DNS ferait « relire » le
nouveau site par lui-même : catalogue vide en silence).

**Qui contacter.** Un seul développeur sur ce chantier (Youri), pas de garde
24/7 — best effort. Ce document sera complété (destinataires structure,
astreinte, escalade) à mesure que S1b/S3 avancent.

## 8. Références

- `plan/06-operations.md` — spécification complète des jalons S1/S2/S3
  (préconditions, étapes, critères de recette, risques).
- `plan/03-catalogue.md` — procédure de bascule et de rollback du catalogue.
- `plan/07-cloture.md`, étape 10 — dossier de réversibilité complet (voir
  `REVERSIBILITE.md`), protocole de transfert de propriété (étape 9).
- `DEVOPS.md` — contrat d'environnement détaillé, pipeline CI/CD, runbooks de
  bascule de compte (dépôt, Vercel).

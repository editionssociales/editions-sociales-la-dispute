# OPERATIONS.md — Runbook d'exploitation

> État au 07/08/2026 — après la **coupure OVH** du 2026-07-18 : Postgres/Neon
> est la seule source, plus aucun WordPress/WooCommerce lu. Ce document
> distingue **code livré** (présent dans ce dépôt — jalons S1a et S2 de
> `plan/06-operations.md`) de **provisioning fait** (secrets
> posés, comptes créés, gestes humains/infra exécutés) — les deux ne sont pas
> synchrones : un mécanisme peut être entièrement codé et rester inopérant
> tant que son provisioning n'est pas fait (signalé explicitement à chaque
> section concernée). Tout le reste (S1b, S3 — ni code ni provisioning) est
> marqué **« à venir »** — ne pas s'y fier tant que ce n'est pas coché ici.
> Référence complète : `plan/06-operations.md`.

## 1. Vue d'ensemble — qui reçoit quoi, aujourd'hui

À ce stade du chantier, un seul canal d'alerte est **opérationnel** : **Sentry**,
reçu par Youri (email). La sauvegarde hebdomadaire est **opérationnelle** (§5) ;
le SDK Vercel Web Analytics est **livré** (voir §6) mais **pas encore
opérationnel** — provisioning humain restant. Les moniteurs de disponibilité (Better Stack) et
l'élargissement des destinataires à la structure
(`toutes@editionssociales.fr`) restent **à venir** — voir §6.

## 2. Erreurs applicatives et tracing — Sentry (S1a, livré)

Le SDK est en place dans le repo :

- `src/instrumentation.ts` (hook serveur, Next ≥ 15 — `onRequestError`
  capture les erreurs **non gérées** des Server Components, route handlers et
  server actions) ;
- `src/instrumentation-client.ts` (SDK navigateur — erreurs + spans
  pageload/navigation, traces distribuées vers le serveur) ;
- `sentry.server.config.ts` (config serveur — erreurs + tracing APM via
  OpenTelemetry, spans http/fetch/pg, pas de PII) ;
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

**Quotas** : plan Developer, 5 000 erreurs/mois + 5 M spans/mois, org en
**région UE** (choix irréversible à la création — déjà fait). Si un bug en
boucle mange le quota, la spike protection de Sentry limite la casse ;
au-delà, passer en plan payant est documenté comme repli dans
`plan/06-operations.md` (risque R2). Le tracing est échantillonné à **100 %**
tant que le trafic est quasi nul — réglage « phase de dev », à baisser au
lancement (§8).

## 3. Secrets — où ils vivent

Aucun secret ne vit dans ce dépôt. `.env.example` liste les **noms** de
variable ; les valeurs réelles vivent dans trois endroits distincts, à ne
jamais confondre :

| Emplacement | Contenu | Qui y touche |
|---|---|---|
| **Vercel (Production / Preview / Development)** | Tout ce que l'application lit au runtime : `DATABASE_URL(_UNPOOLED)`, `PAYLOAD_SECRET`, `BLOB_READ_WRITE_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`/`SENTRY_PROJECT`, `SENTRY_DASHBOARD_TOKEN`, `SITE_INDEXABLE`, `NEXT_PUBLIC_SITE_URL`, `BREVO_*`/`CONTACT_TO_EMAIL` (communication), `REDIRECTS_PERMANENT` | Youri (dashboard Vercel ou `vercel env`) — jamais affichées en clair, jamais dans un log |
| **Secrets GitHub Actions** (repo → Settings → Secrets) | Ce qui sert au workflow de sauvegarde (§5) : `NEON_DATABASE_URL` (URL Neon **directe**) et `BLOB_BACKUP_RW_TOKEN` (store privé `es-ld-backups`), posés le 2026-07-26 ; `BETTERSTACK_HEARTBEAT_URL` **optionnel**, pas encore posé (pas de compte Better Stack). Le job `verify` n'utilise plus aucun secret (Postgres jetable) — les anciens `DATABASE_URL`/`PAYLOAD_SECRET` peuvent être supprimés (cf. `DEVOPS.md` §5) | Youri |
| **Poste du développeur** (`.env` / `.env.local`, hors Git — `.gitignore`) | Outillage uniquement : `GITHUB_PAT`, `VERCEL_PAT`, `SENTRY_PAT` — jamais lus par `src/`, jamais posés côté Vercel (un PAT GitHub exposé au runtime du site serait une escalade de privilèges gratuite) | Youri |

Règle d'or, rappelée de `DEVOPS.md` : **jamais de clé Stripe `sk_live_` hors
Production** — une Preview ne doit jamais pouvoir encaisser un paiement réel.
Le garde-fou est codé (`src/lib/env.ts:checkEnv`) et jette au boot
(`assertEnv`, appelé par `instrumentation.ts`) si une clé live traîne hors
production.

**`STRIPE_SECRET_KEY` est l'interrupteur Stripe du site — dons ET boutique,
pas seulement les dons.** `stripeEnabled()` (`src/lib/stripe.ts`) gouverne les
deux parcours de paiement à la fois : retirer la clé (ou la laisser absente)
rend `/souscription` inerte (boutons désactivés, iso-rendu) **et** fait
répondre `POST /api/checkout` en 503 « Commerce natif indisponible » — la
boutique s'arrête net, pas seulement les dons. Un geste d'exploitation
courant — « couper les dons » en retirant `STRIPE_SECRET_KEY` côté Vercel —
coupe donc aussi les commandes boutique ; il n'existe pas d'interrupteur
séparé pour l'un sans l'autre.

## 4. Vérifications du repo

CI (`.github/workflows/ci.yml`), sur chaque PR et sur `main` :

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm knip     # exports / fichiers / dépendances morts
pnpm build    # hermétique — Postgres 17 jetable (service container)
```

**`pnpm build` tourne dans la CI depuis la coupure OVH** : le build est
hermétique (Postgres uniquement) et se joue sur un **Postgres 17 jetable**
(service container, `pnpm migrate` + catalogue vide — zéro transfert Neon,
cf. `DEVOPS.md` § « Pipeline CI/CD »). Les previews Vercel par PR sont
coupées (§8) : ce job « verify » est la **seule** vérification du build
avant merge — le build de déploiement (`vercel-build` = migrate:prod +
next build) n'arrive qu'après, et un échec y laisse l'ancien déploiement
en ligne.

Après tout changement de schéma Payload (collection, champ, global) :
`pnpm generate:types` puis commit du `src/payload-types.ts` régénéré.

## 5. Sauvegarde hebdomadaire (jalon S2)

> **Cadence hebdomadaire depuis le 2026-07-27** (nocturne au plan et à la mise
> en service) : un dump quotidien de ~44 Mo consommait ~1,3 Go/mois du quota
> de transfert Neon Free (5 Go/mois, épuisé le 26/07) ; la restore window
> native Neon (7 jours) couvre la granularité fine entre deux dumps.

> **Opérationnel depuis le 2026-07-26.** Le workflow échouait chaque nuit
> depuis le 2026-07-19 (premier step, provisioning absent). Sont désormais
> posés : store Vercel Blob **privé** `es-ld-backups` (`store_FLS5SZOrUJDYmn0e`,
> `fra1`), secrets `NEON_DATABASE_URL` + `BLOB_BACKUP_RW_TOKEN`, paire de clés
> age (clé publique dans le workflow). Restent **deux** gestes humains, aucun
> des deux bloquant pour la sauvegarde elle-même : la **garde de l'identité
> age** (voir ci-dessous) et le **heartbeat Better Stack** (secret
> `BETTERSTACK_HEARTBEAT_URL`, désormais optionnel — sans lui la sauvegarde
> tourne et l'absence d'alerte est signalée en `::warning::` à chaque run).

**Principe** : `.github/workflows/backup-db.yml`, cron hebdomadaire en heure
creuse (lundi, `47 3 * * 1` UTC) + déclenchement manuel (`workflow_dispatch`
pour la recette). Chaîne du job :

1. `pg_dump --format=custom --no-owner` sur `DATABASE_URL_UNPOOLED` (URL
   **directe** Neon, jamais le pooler) → un fichier daté.
2. Chiffrement **par clé publique age** (`age -r age1…`) — la clé publique est
   en clair dans le workflow, **aucun secret de déchiffrement ne transite par
   la CI**.
3. Upload sur un **store Vercel Blob privé dédié** aux sauvegardes
   (`es-ld-backups`, région `fra1`, lecture authentifiée uniquement —
   **jamais** le store médias public de la phase catalogue), sous
   `backups/daily/…` (préfixe conservé malgré la cadence hebdo ; copie
   `backups/monthly/` au premier run du mois, jour ≤ 07).
4. (Non implémenté à ce jour — hors scope du workflow livré, cf. son en-tête :
   la copie additive des médias du store public vers le store privé. Les
   couvertures/médias — désormais tous sur le store Blob public — n'ont donc
   **pas de copie hors Vercel**.)
5. Purge (`scripts/backup-prune.mjs`) : conserve les 30 dumps les plus récents
   sous `daily/` (≈ 7 mois en cadence hebdo) + 12 mensuels.
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

**Fait le 2026-07-26** : store Blob privé `es-ld-backups` créé (`fra1`, accès
`private`, connecté au projet Vercel sous le préfixe `BACKUP_` pour ne PAS
toucher au `BLOB_READ_WRITE_TOKEN` du store médias public) ; secrets
`NEON_DATABASE_URL` (= `DATABASE_URL_UNPOOLED`, hôte direct) et
`BLOB_BACKUP_RW_TOKEN` posés ; paire de clés age générée hors CI, clé publique
`age1kmtyac…jww7xj` dans le workflow.

**Restant — gestes humains, non bloquants** :

- **Garde de l'identité age** : le fichier d'identité généré vit à
  `~/marina_es/backup-identity.txt` (hors dépôt, `chmod 600`). Le déposer dans
  le gestionnaire de mots de passe de Youri **et** celui de la structure, puis
  le supprimer du poste si besoin. **Sans ce fichier, aucun dump n'est
  déchiffrable** — c'est le seul point de défaillance irréversible de la
  chaîne.
- **Heartbeat Better Stack** : ouvrir le compte de la structure, créer le
  moniteur « sauvegarde manquante » (période 24 h, grâce 6 h) et poser
  `BETTERSTACK_HEARTBEAT_URL`. Sans lui, un backup qui cesse de tourner ne
  déclenche aucune alerte externe (seul l'email d'échec GitHub Actions).
- **Plan Neon Free → Launch** + fenêtre de restauration 7 jours (dashboard
  Neon → Backups/Restore) : étage 1 de la chaîne, indépendant de ce workflow.
- **Test de restauration démontré** (étape 7 du jalon S2) : maintenant
  possible, procédure ci-dessus, à jouer sur une branche Neon jetable.

## 6. À venir

Deux catégories distinctes, à ne pas confondre : ce qui n'a **aucun code**
dans ce dépôt (S1b, S3 — pas encore livré), et ce qui est **livré mais pas
encore activé** faute d'un geste humain (provisioning).

**Pas encore livré (S1b, S3 — aucun code dans ce dépôt)** :

- **Moniteurs Better Stack** — non configurés à ce jour. La liste des 9
  sondes du plan (antérieure à la coupure OVH) visait aussi les sources
  WordPress et la Store API boutique : caduque. Périmètre à redéfinir au
  provisioning, autour du site seul (accueil, catalogue, fiche livre,
  souscription, checkout, santé dons).

**Livré, provisioning restant** :

- **Vercel Web Analytics** — le SDK est installé (`@vercel/analytics` dans
  `package.json`) et monté (`<Analytics />` dans `src/app/(site)/layout.tsx`).
  Reste à activer le produit côté dashboard Vercel (Analytics tab du projet) —
  sans quoi le composant reste un no-op silencieux, comme Sentry sans DSN.
- **Sauvegarde hebdomadaire** (§5) — **opérationnelle** depuis le 2026-07-26
  (cadence hebdo depuis le 27/07, quota transfert Neon) ;
  restent la garde de l'identité age (gestionnaires de mots de passe) et le
  heartbeat Better Stack (surveillance, pas la sauvegarde).
- **Test de restauration démontré** (étape 7 du jalon S2) — débloqué depuis que
  le backup tourne : reste à jouer un `pg_restore` d'un dump déchiffré sur une
  branche Neon jetable, avec comptages de contrôle (procédure en §5).

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

**« Connection terminated unexpectedly » dans les logs Vercel.** Signature
de l'autosuspend Neon (plan Free : ~5 min sans activité, non désactivable) :
le compute Neon s'endort et coupe tous les sockets, mais l'instance Vercel
(Fluid) lui survit et garde son pool `pg`. Chaque client idle coupé émet
alors `error` sur le pool — absorbé et logué en warn `[pg-pool]` par
`attachPoolErrorHandler` (`src/payload/lib/pool-error-handler.ts`, branché
en `onInit` ; avant ce correctif d'août 2026, l'événement non écouté tuait
le process entier). Un warn isolé est donc bénin — la requête suivante
rouvre une connexion. Un flot continu accompagné de 500 → vérifier
status.neon.tech et l'état du compute dans la console Neon.

**Le catalogue paraît vide ou incomplet.** Le contrat du repo est de
dégrader proprement (jamais de 500) : une liste partielle ou vide signale
presque toujours un problème d'accès à la base Neon — seule source depuis
la coupure OVH — pas un bug du site. Vérifier l'état du projet côté
dashboard Neon (base joignable ? quotas du plan Free — compute, transfert —
épuisés ?), les issues Sentry (§2) et la présence/forme de `DATABASE_URL`
sur la cible. La vue `/admin/sante` (rôle admin) donne un premier état des
lieux (observabilité, configuration). Attention : l'ISR peut masquer
l'incident un temps — les pages déjà générées continuent de servir depuis
le cache pendant que les régénérations échouent.

**La jauge de dons ne semble pas bouger après un paiement.** Ce n'est pas
forcément un incident : la chaîne de fraîcheur documentée
(`src/app/CLAUDE.md`) admet jusqu'à ~3 minutes (indexation Stripe ~1 min +
fenêtre de cache 60 s + un aller de revalidation). En dessous de ce délai,
rien à faire. Au-delà, vérifier `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
et les issues Sentry du handler webhook (§2).

**Restaurer la base après une perte ou une corruption de données.** Il n'y
a **plus de rollback vers WordPress** : la coupure OVH du 2026-07-18 a
supprimé cet axe du code (`plan/03-catalogue.md` § E9 est un document
d'époque, ne plus s'y référer). La restauration passe par deux étages, dans
l'ordre :

1. la **restore window native Neon** (dashboard Neon → Backups/Restore ;
   7 jours visés, liée au plan Neon — cf. §5 « Restant ») pour la
   granularité fine ;
2. au-delà, les **dumps hebdomadaires chiffrés** (§5) : `pg_restore` sur une
   branche Neon jetable d'abord, comptages de contrôle, puis bascule.

**Qui contacter.** Un seul développeur sur ce chantier (Youri), pas de garde
24/7 — best effort. Ce document sera complété (destinataires structure,
astreinte, escalade) à mesure que S1b/S3 avancent.

## 8. Réglages « phase de dev » — à réévaluer une fois le dev terminé

Posés en juillet 2026 pour tenir le quota de transfert Neon Free (5 Go/mois,
épuisé le 26/07) pendant les itérations. Aucun n'est un bug : chacun échange de
la fraîcheur ou de la couverture contre du quota. À réévaluer au lancement,
et/ou après un éventuel passage au plan Neon Launch (marge de transfert ~10×).

1. **Fiches non pré-rendues** (`generateStaticParams` vide, fiches catalogue et
   boutique — cf. `src/app/CLAUDE.md`) : la première visite de chaque fiche
   après un deploy la génère à la volée (TTFB dégradé, y compris pour le
   premier crawl SEO). Si le quota le permet au lancement : restaurer le
   pré-rendu (liste complète, ou sous-ensemble nouveautés/meilleures fiches) —
   coût : une rafale catalogue par deploy.
2. **Data-cache catalogue TTL 24 h** (`src/lib/catalogue.ts`, tag `catalogue`) :
   la fraîcheur temps réel vient des hooks admin — et l'import stock routeur
   revalide lui-même UNE fois en fin de run (`revalidateCatalogueNow`, effet
   immédiat). Reste invisible jusqu'à 24 h : toute AUTRE écriture posant
   `context.disableRevalidate` (scripts `payload run`, migrations de données).
   Parade : re-sauvegarder n'importe quel livre dans `/admin` (le hook purge
   tout), ou raccourcir le TTL au lancement si ces écritures deviennent
   fréquentes.
3. **Sauvegarde hebdomadaire** (§5) : RPO hors-fournisseur = 7 jours (la
   restore window Neon 7 j couvre le quotidien, mais chez le même
   fournisseur). Dès que la base porte des commandes réelles : repasser le
   cron à quotidien (`47 3 * * *`) — ~1,3 Go/mois de transfert à budgéter.
4. **CI sur Postgres jetable** (`DEVOPS.md` § Pipeline CI/CD) : le build CI ne
   voit jamais les données réelles — une donnée pathologique qui casse un
   rendu ne sera détectée qu'au deploy prod (échec = ancien déploiement
   maintenu) ou au runtime (Sentry). Si ça mord : job planifié hebdo sur la
   vraie base, hors chemin des PRs.
5. **Previews Vercel coupées** (2026-07-24) : plus de QA visuelle par PR. Si
   elle remanque, réactiver AVEC le preview branching Neon (base éphémère par
   preview), jamais sur la base partagée.
6. **Rafale résiduelle par deploy** (accueil, souscription, panier, sitemap —
   seules lectures catalogue restantes au build) : irréductible avec des
   données réelles, éventuellement payée plusieurs fois par build (workers
   parallèles). Négligeable à cadence de deploy raisonnable.
7. **Tracing Sentry à 10 %** (`tracesSampleRate: 0.1`, serveur ET client —
   `sentry.server.config.ts`, `src/instrumentation-client.ts`) : le taux de
   phase de dev (1.0, une trace complète par requête et par navigation, spans
   pg compris) a été ramené à 0.1 le 2026-08-18, avant l'ouverture de la
   campagne, pour tenir les 5 M spans/mois du plan Developer. Les deux
   fichiers DOIVENT rester alignés (traces distribuées : la décision
   d'échantillonnage du client se propage au serveur). Ne jamais poser `0`
   pour couper l'APM : `0 != null`, l'instrumentation OpenTelemetry
   pg/http/fetch resterait active — il faut OMETTRE la clé et poser
   `skipOpenTelemetrySetup: true` (cf. commentaire de
   `sentry.server.config.ts`).

## 9. Références

- `plan/06-operations.md` — spécification d'époque des jalons S1/S2/S3
  (préconditions, étapes, critères de recette, risques) ; les parties
  liées à WordPress et à la bascule sont caduques depuis la coupure OVH.
- `plan/07-cloture.md`, étape 9 — protocole de transfert de propriété des
  comptes.
- `DEVOPS.md` — contrat d'environnement détaillé, pipeline CI/CD, runbooks de
  bascule de compte (dépôt, Vercel).

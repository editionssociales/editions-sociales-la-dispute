# Phase 3 — Le catalogue dans sa propre base + back-office
## Plan d'implémentation détaillé (version finale)

*Architecte de phase — 2026-07-09, révision post-relecture adversariale. S'appuie sur : recon R1 (carte du code), R2 (dumps SQL), R3 (contrat wp-headless + médias), R4 (infra live), décision de stack (Payload ≥ 3.73 + Neon + Vercel Blob), devis §5 (périmètre vendu 4,5 j / 900 €), COHABITATION.md, LEGACY-STACK.md. Vérifié dans le code ce jour : point de bascule unique `src/lib/catalogue.ts:29` (`const source = httpCatalogueSource()`) ; **`src/app/layout.tsx` est un root layout qui rend `<html>` + Typekit + SiteHeader/SiteFooter autour de toutes les routes (l.32-51)** → l'installation de Payload impose une réorganisation en route groups (E1) ; **`package.json` n'a ni script `migrate` ni `vercel-build`** → jamais toucher au build command global Vercel (E2) ; les défauts de l'adaptateur http sont les domaines publics (`catalogue-http.ts:16-17`) → le rollback dépend de leur joignabilité (E9) ; les docs Next 16 embarquées (`01-getting-started/02-project-structure.md §"Creating multiple root layouts"`, `03-file-conventions/route-groups.md`) confirment le pattern multi-root-layouts sans layout de tête ; `displayAuthor` tolérant aux noms sans `/` (`format.ts:36-42`), `parseWpDate` accepte l'ISO (`format.ts:48-59`), `sanitizeCms` unique fabricant de `SafeHtml` (`cms-html.ts:70-72`), repo en Next 16.2.9 / React 19.2.4.*

> **Statut au 12/07 (source de vérité de cette mise à jour).** Migration
> idempotente **prouvée sur Neon réel** : 295 livres / 256 auteurs / 611 médias
> importés (E3), re-run = 0 création. `compare-sources.ts` (E5) : **0 diff
> bloquant** (était 761) — PR #9 a étendu le classifieur de réhébergement
> OVH→Payload aux URL nues (`cover.url`, `tocUrl`, `excerptUrl`, hôtes `cms-*`
> compris) puis ajouté `rewriteInternalLinks` à `rewrite-html.ts` (~50 liens
> `<a href>` de corps de texte vers d'autres fiches ou la racine, réécrits en
> `/catalogue/<edition>/<slug>` ou `/` — labellisé « E11 » dans les commits et
> logs de livraison, **à ne pas confondre avec l'E11 de cette page** ci-dessous,
> qui garde son sens d'origine) et corrigé un artefact de saisie ACF (pages
> décimales tronquées, `catalogue-wp-map.ts`, fonction `toPages`). Résultat :
> `CATALOGUE_SOURCE=pg pnpm build` est **vert, 316/316 pages,
> zéro appel WordPress**. Conséquence sur E9 : le **SWAP ne se déclenche plus
> isolément le lun 20/07** — il **rejoint la fenêtre de bascule unique** (site +
> pg + commerce) proposée 24–28/07 par le client le 12/07 ; calendrier qui fait
> foi : [`../README.md`](../README.md) et [`../02-mise-en-production.md`](../02-mise-en-production.md)
> (runbook fusionné 02+04). La procédure d'E9 ci-dessous (gel, health-check,
> delta final, rollback) reste la référence d'exécution — seule sa date change.

---

## Objectif et livrable

**Objectif.** Sortir le catalogue (295 fiches au relevé REST du 09/07 : 117 ES + 178 LD) des deux WordPress vers une base PostgreSQL propriété du client, donner à l'équipe un back-office unique en français avec rôles, et basculer la source de données du front par swap d'adaptateur derrière le port `CatalogueSource` — **sans toucher ni le contrat du port, ni les 55 tests, ni le contrat visuel**. Les deux WordPress catalogue (`www`, `LaDispute`) s'éteignent après recouvrement, exports remis avant. La boutique WooCommerce n'est **pas touchée** (phase commerce, septembre) : `listProducts()` reste branché sur la Store API.

**Nuance de périmètre assumée (correction v1)** : l'installation de Payload dans l'app existante exige de **déplacer les routes actuelles dans un route group `src/app/(site)/`** (le root layout actuel rend `<html>` autour de tout — incompatible avec le layout `<html>` propre de `@payloadcms/next`). Les **URLs publiques ne changent pas** (les route groups n'affectent pas les chemins) et le DOM produit est conservé (iso-rendu), mais ce déplacement mécanique (~15 fichiers/dossiers) fait partie du gate E1 et y est budgété.

**Livrables concrets :**
1. Base Neon Postgres (Frankfurt, via Vercel Marketplace) contenant le schéma catalogue (schéma SQL `payload` dédié — le schéma `public` reste réservé comme point d'extension (p. ex. une future table côté dons)).
2. Back-office Payload CMS (épinglé, ≥ 3.73.0) monté **dans l'app Next existante** sous `/admin`, en français, rôles `admin`/`editor`, éditeur riche Lexical, médias sur Vercel Blob `fra1`.
3. Script de migration idempotent et rejouable (`scripts/migrate-catalogue/`) + rapport de migration + script de parité (`scripts/compare-sources.ts`).
4. Nouvel adaptateur `pgCatalogueSource()` (`src/lib/catalogue-pg.ts`) implémentant `listBooks`/`getBook` du port, sélectionné par variable d'env `CATALOGUE_SOURCE` — rollback = flip d'env, **sous condition de joignabilité WordPress vérifiée** (E9).
5. Médias rapatriés (~160–200 Mo utiles, pas 1 Go — R3 §7.1) sur Vercel Blob, servis via `next/image`.
6. Sauvegarde nocturne : portée par le **jalon S2 de la phase 6** (spécification qui fait foi : `pg_dump` chiffré `age` → store Blob privé dédié + copie médias additive + rétention 30 j/12 mois + heartbeat), **exécuté dans la fenêtre du 20–24/07** comme condition d'extinction (E12) — la promesse « sauvegardée chaque nuit » du devis §5 naît avec la base.
7. **Bloc « mise en avant »** (engagement C32 du devis — « mises en avant ponctuelles », remplaçant les 2 Popup Builder) : collection (ou global) Payload `highlight` + bandeau/encart daté sur la page d'accueil, iso-rendu quand inactif (E6bis).
8. Démo back-office à l'équipe **mercredi 15/07** sur `/admin` **en production** (merge de la branche le 14/07, front public inchangé) + prise en main (Floée) ; extinction douce des 2 WP catalogue fin juillet, purge définitive différée sur validation écrite.

**Décision d'architecture cadrée (R1 §1) : option (a) — l'adaptateur Postgres mime les shapes bruts `WpBook`/`WpBookField` du port.** Le port continue de « parler WordPress » (`title.rendered`, `prix` string|number, `cover` objet `{url,width,height}`). Toute la normalisation de `catalogue-core.ts` reste en service, les 55 tests ne bougent pas, le swap est un zéro-toucher sur le front et le cœur. Élever le port au niveau `Book` (option b) est explicitement hors périmètre de cette phase.

---

## Preconditions et provisioning (comptes, clés, accès — qui fait quoi, client vs Youri)

| # | Précondition | Qui | Détail / vérification | Échéance |
|---|---|---|---|---|
| P1 | **Neon Postgres via Vercel Marketplace**, région `eu-central-1` (Frankfurt), plan Free (→ Launch à la mise en prod du swap). **Preview branching Neon : DÉSACTIVÉ** (une seule base partagée par tous les environnements — condition pour que les previews, dont celle de la démo, voient les 295 fiches importées) | Youri, avec le `VERCEL_TOKEN` **du shell** (team `solidz`) — ⚠️ R4 : les tokens de `site/.env` pointent des coquilles vides (`ldes`, `editionssociales`), ne pas les utiliser | Dashboard Vercel → Storage → Neon ; vérifier que l'intégration injecte **`DATABASE_URL` (URL poolée `-pooler`)** ET **`DATABASE_URL_UNPOOLED` (connexion directe)** sur les 3 cibles (production, preview, development). **Règle d'usage** : URL poolée pour l'app, le runtime et les builds SSG ; URL directe pour `payload migrate` et `pg_dump` (le pooler transaction-mode peut faire échouer DDL et dump) | ven 10/07 matin. Cette phase crée Neon **seule** (la phase dons, version finale, n'utilise aucune base — reçus natifs Stripe + agrégation API) ; le schéma `public` reste réservé comme point d'extension |
| P2 | **Vercel Blob store**, région `fra1` | Youri | Storage → Blob ; `BLOB_READ_WRITE_TOKEN` injecté | ven 10/07 |
| P3 | `PAYLOAD_SECRET` (32+ chars aléatoires) dans env Vercel (production+preview+development) et `.env.local` | Youri | `openssl rand -hex 32` ; jamais committé | ven 10/07 |
| P4 | **Redéploiement du mu-plugin versionné** `site/wp-headless/es-headless-rest.php` dans `wp-content/mu-plugins/` de `www` et `LaDispute` (R3 §2 : la prod exécute une révision antérieure, `cover` = string) | Youri (FTP/SSH OVH) | `curl 'https://editionssociales.fr/wp-json/wp/v2/catalogue?per_page=1&_fields=book'` → `book.cover` est un objet `{url,width,height}` ; idem LD. Le front tolère les deux formes (`catalogue-source.ts:34`), zéro déploiement front | ven 10/07 — **avant la capture de migration**, pour que la forme capturée soit la forme finale |
| P5 | Merge de la **PR #5** (CI sur `main`) + `git pull` du checkout local (en retard d'1 commit — R4) | Youri | `gh pr merge 5` ; CI verte sur `main` | ven 10/07 |
| P6 | MariaDB locale port 3307 chargée avec les dumps du 01/07 (oracle de vérification) | Youri (déjà en place — R2) | `mysql -h127.0.0.1 -P3307 -uroot -e "SELECT COUNT(*) FROM editionskes.es_posts WHERE post_type='catalogue' AND post_status='publish'"` → 117 | déjà fait |
| P7 | **Comptes équipe** pour la démo : prénom + email de chaque utilisateur du back-office (Floée + direction, rôles souhaités) | **Client** (demande envoyée dès le 10/07) | Liste reçue | lun 13/07 |
| P8 | Accès démo : **`/admin` en production** (la branche Payload est mergée dans `main` le 14/07 avec `CATALOGUE_SOURCE` non posée → front public inchangé, back-office réel) + partage d'écran. Le lien preview partageable (front servi par pg) est un plus, pas un bloquant (⚠️ R4 : SSO Vercel bloque les previews) | Youri (interface avec phase 2 pour le lien partageable) | `/admin` répond en prod ; comptes P7 créés ; navigation privée testée | mar 14/07 |
| P9 | Secrets GitHub Actions pour la sauvegarde (**jalon S2 de la phase 6, dont la spécification fait foi** — E12) : **`DATABASE_URL_UNPOOLED`** (connexion directe — `pg_dump` via pooler = à proscrire), clé de chiffrement `age`, token du store Blob **privé dédié**, `BETTERSTACK_HEARTBEAT_URL` | Youri (Better Stack créé au nom de la structure — décision stack §6) | Run manuel du workflow vert (exécution S2) | fenêtre du 20–24/07 |
| P10 | **Précondition inter-phases (écrite, transmise à la phase 2)** : tout cutover DNS de `editionssociales.fr` / `ladispute.fr` **antérieur à la fin du recouvrement (27/07)** exige d'abord le découplage CMS — sous-domaines `cms-es`/`cms-ld` créés, `WP_ES_URL`/`WP_LD_URL` repointés dans l'env Vercel (3 cibles), et `curl $WP_ES_URL/wp-json/wp/v2/catalogue?per_page=1&_fields=book` → 200 avec champ `book` | Youri (porté par la phase 2, exigé par cette phase) | Consignée dans COHABITATION.md et dans le protocole de rollback E9 | avant tout flip DNS |

**Aucune création de compte client bloquante pour cette phase** : Neon et Blob vivent dans le projet Vercel existant (transférés avec lui à la recette — décision stack §2 des comptes). Stripe n'est pas concerné ici.

---

## Etapes (ordonnées ; quoi / fichiers touchés / vérification)

### E0 — Infra et hygiène de départ (0,25 j — ven 10/07 matin)
**Quoi.** P1–P5 ci-dessus + branche de travail `feat/payload-backoffice` + déplacement de la dépendance morte `mysql2` de `dependencies` vers `devDependencies` (elle resservira aux scripts de migration — R1 §surprises 2).
**Fichiers.** `package.json` ; env Vercel ; `wp-content/mu-plugins/` des deux WP (hors repo).
**Vérifier.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verts sur la branche vierge ; curl P4 OK sur les deux sites ; `psql $DATABASE_URL -c 'select 1'` OK (poolée) et `psql $DATABASE_URL_UNPOOLED -c 'select 1'` OK (directe).

### E1 — GATE Payload ⟷ Next 16.2.9 (0,5 j — ven 10/07)
**Quoi.** Le risque n°1 de la stack (fenêtre de compatibilité étroite, historique Turbopack #14354/#15429). À faire **en premier, en tandem, avant tout autre travail**, en deux temps :

**E1.a — Réorganisation en route groups (~0,5–1 h, mécanique, iso-rendu).** Le root layout actuel (`src/app/layout.tsx`) rend `<html>` + Typekit + `SiteHeader`/`SiteFooter` autour de **toutes** les routes ; le layout Payload rend son propre `<html>` — imbriqués, ce serait `<html>` dans `<html>`. Le pattern requis (docs Next 16 embarquées, `02-project-structure.md §"Creating multiple root layouts"`) :
- Déplacer dans `src/app/(site)/` : `page.tsx`, `layout.tsx` (devient le root layout du groupe, contenu **inchangé au caractère près**), `globals.css`, `not-found.tsx`, et les dossiers `a-propos/`, `boutique/`, `catalogue/`, `editions/`, `panier/`, `rencontres/`, `souscription/`. `favicon.ico` reste à la racine de `src/app/` (convention metadata, indépendante des layouts).
- **Supprimer** le `layout.tsx` de tête (aucun layout au-dessus des groupes ; la home vit dans `(site)/page.tsx`, exigence documentée de `route-groups.md`).
- Points vérifiés dans les docs : les route groups **n'affectent pas les URLs** ; naviguer entre deux root layouts (`(site)` ↔ `(payload)`) provoque un full page load — sans conséquence ici (le site ne linke pas `/admin`). Comportement 404 des URLs hors de tout groupe à vérifier au gate ; repli documenté : `global-not-found` (expérimental) ou catch-all dans `(site)` — décision au moment de coder, docs `not-found.md` sous les yeux.

**E1.b — Scaffold Payload.**
```
pnpm add -E payload@<dernière 3.7x ≥3.73.0> @payloadcms/next @payloadcms/db-postgres \
  @payloadcms/richtext-lexical @payloadcms/storage-vercel-blob @payloadcms/translations sharp
```
Versions **épinglées exactes** (`-E`), montées Next+Payload toujours en tandem (règle à inscrire dans `site/CLAUDE.md`). Scaffold minimal :
- `payload.config.ts` (racine de `site/`) : `postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL }, schemaName: "payload", push: false })` (URL **poolée** au runtime), `editor: lexicalEditor()`, `i18n` fr (`@payloadcms/translations/languages/fr`), `graphQL: { disable: true }`, `vercelBlobStorage({ collections: { media: true }, clientUploads: true })` (limite 4,5 Mo des fonctions Vercel — décision stack §3), `sharp`.
- `next.config.ts` : wrapper `withPayload(...)` autour de la config existante (**conserver `remotePatterns` OVH tels quels**).
- `src/app/(payload)/layout.tsx`, `src/app/(payload)/admin/[[...segments]]/page.tsx` + `not-found.tsx`, `src/app/(payload)/api/[...slug]/route.ts`, `src/app/(payload)/admin/importMap.js` (générés par `pnpm payload generate:importmap`).
- Scripts `package.json` : `"payload": "payload"`, `"migrate:create": "payload migrate:create"`, et les scripts de migration/build de E2 (voir E2 — **pas de modification des réglages Vercel**).

⚠️ **Règle du repo** : lire les guides `node_modules/next/dist/docs/01-app/` (getting-started + guides ISR/caching + file-conventions) avant d'écrire le moindre code Next de cette étape — Next 16 diffère des acquis (preuves : `preload` sur `next/image`, `params` en Promise).

**Vérifier (gate binaire).** `pnpm build` complet (Turbopack) + `pnpm dev` + `/admin` s'affiche + les 55 tests + typecheck + lint verts + **les pages existantes rendent à l'identique aux mêmes URLs** (diff DOM sur `/`, `/catalogue`, une fiche livre, `/souscription` — les route groups ne changent aucun chemin public) + 404 vérifiée.
**Si le gate casse et n'est pas réparable en 0,5 j → repli B de la décision stack** : on retarde au lieu de remplacer — WordPress reste l'outil de saisie via l'adaptateur http, la démo du 15/07 montre schéma + import + plan, aucune autre étape n'est invalidée. (E1.a seul, s'il passe, est conservé : il est iso-rendu et inoffensif.)

### E2 — Collections, schéma, rôles, admin français (0,75 j — ven 10 soir → sam 11/07)
**Quoi.** Le schéma (détail complet en section « Données et migration ») dans `src/payload/` :
- `src/payload/collections/Users.ts` — auth Payload, champs `name`, `role: select['admin','editor']` (labels FR « Administrateur / Éditrice·eur »), `maxLoginAttempts` par défaut, pas d'auto-inscription (premier admin via `payload run` seed ou variable d'amorçage).
- `src/payload/collections/Media.ts` — collection upload (images + `application/pdf`), champs `alt` (text), `sourceUrl` (text, index unique, `admin.readOnly` — clé d'idempotence de la migration), stockage Blob.
- `src/payload/collections/Authors.ts` — `name` (text requis, forme « Prénom Nom »), `slug` (unique, indexé), **`bio` (richText Lexical, optionnel)** — la capacité « saisie de biographies » vendue au devis §3.1 a désormais un lieu ; le front l'ignore (zéro toucher), affichage éventuel = micro-évolution post-recette (Q9). `displayAuthor()` tolère les noms sans `/` (vérifié `format.ts:38`) → stocker le nom propre, zéro toucher front.
- `src/payload/collections/BookCollections.ts` (slug Payload `collections`) — `name`, `slug`, `edition: select['editions-sociales','la-dispute']` ; index composite unique `(edition, slug)` (les deux maisons ont chacune un « hors-collection » — R2 §1.4 ; l'adaptateur émet `{name,slug}`, comportement facettes inchangé).
- `src/payload/collections/Books.ts` — cf. schéma détaillé ; `versions: { drafts: true }` ; **`edition` nullable** (pas de required) + champ **`origin: select['catalogue','boutique']`** — **contrat d'interface posé par la phase 4 (commerce, septembre)** : elle introduira des entrées boutique-seules **sans maison** (15 produits orphelins, mesuré par `migrate-products.ts`) ; rendre `edition` requis avec unicité composite imposerait alors une migration délicate sur base vivante — ~30 min maintenant l'évitent ; **unicité de slug couvrant l'espace `edition` ∪ null** : index composite unique `(edition, slug)` + index unique partiel sur `slug` quand `edition IS NULL` (les IDs WP collisionnent entre ES et LD — clones, R2 §1.1 — mais les slugs sont uniques par maison et la route est `/catalogue/[edition]/[slug]`) ; hook `validate` : cohérence `collection.edition === book.edition` (quand `edition` est renseignée) ; champ de tri **`sortDate` non-nul** (cf. section migration).
- `src/payload/access.ts` — `isAdmin`, `isAdminOrEditor` : les `editor` font CRUD sur `books`/`authors`/`collections`/`media`, **pas** sur `users` ni la config ; les `admin` font tout.
- **Migrations — sans toucher aux réglages Vercel (correction v1)** : le build command global du projet est un réglage **partagé par toutes les branches et tous les déploiements** — le modifier casserait les déploiements de `main` (dont ceux de la phase dons, en prod cette même semaine : `package.json` de `main` n'a pas de script `migrate`) et ferait exécuter des migrations non mergées par n'importe quelle preview contre la base partagée. À la place, **tout vit dans le `package.json` de la branche** (Vercel utilise automatiquement `vercel-build` s'il existe, et il n'existe que sur les commits qui le portent) :
  ```json
  "migrate:prod": "DATABASE_URL=\"${DATABASE_URL_UNPOOLED:-$DATABASE_URL}\" payload migrate",
  "vercel-build": "if [ \"$VERCEL_ENV\" = \"production\" ]; then pnpm migrate:prod; fi && next build"
  ```
  Résultat : les migrations ne s'exécutent **que** sur les déploiements de production de commits qui les embarquent (pattern du template Vercel officiel de Payload) ; les previews buildent sans migrer et lisent le schéma existant de la base partagée. **Application initiale du schéma** : `pnpm migrate:create` → `src/migrations/` (répertoire déclaré dans `payload.config.ts`), puis `pnpm migrate:prod` lancé **manuellement depuis le poste local** (URL directe Neon) — c'est ce qui rend la base utilisable par les previews avant tout merge. `push: false` partout, **jamais de `push` en prod**.
**Fichiers.** `src/payload/**`, `payload.config.ts`, `src/migrations/*`, `package.json` (scripts). **Aucun réglage Vercel modifié.**
**Vérifier.** `/admin` en français ; création manuelle d'une fiche test complète (tous champs, upload cover → Blob, PDF) ; un compte `editor` ne voit pas Users ; `pnpm migrate:prod` idempotent sur base vierge puis re-run no-op ; les tables atterrissent dans le schéma SQL `payload` (`\dt payload.*`), **rien dans `public`** (réservé — point d'extension, p. ex. une future table des dons) ; un déploiement preview de la branche builde **sans** exécuter de migration (logs de build).

### E3 — Script de migration + rapatriement médias (1,25 j — sam 11 → lun 13/07)
**Quoi.** `scripts/migrate-catalogue/` (tsx, Node) — détail en section « Données et migration ». **Chaque `create`/`update` de la Local API passe `context: { migration: true, disableRevalidate: true }`** : les hooks du schéma (pose de `contentTouched`, revalidation E6) vérifient `req.context` et se neutralisent pendant l'import — sans quoi (a) chaque run basculerait toutes les fiches en rendu Lexical et désamorcerait le parachute `*LegacyHtml` (parade du risque 2), et (b) les hooks de revalidation appelleraient `revalidateTag`/`revalidatePath` depuis un script tsx hors de tout contexte Next → invariant error ~295 fois (pattern standard des templates Payload : `context.disableRevalidate`). Premier run complet contre Neon dès le dimanche soir : les 295 fiches réelles dans le back-office **avant** la démo.
**Fichiers.** `scripts/migrate-catalogue/{index,fetch-wp,sql-oracle,media,rewrite-html,import,report}.ts`, sortie `scripts/migrate-catalogue/out/report-<ts>.{md,json}` (gitignorée).
**Vérifier.** Rapport : 117+178 books créés, 0 échec média bloquant, taux de remplissage conformes aux attendus R2 §1.3, liste des 9 liens boutique cassés produite, liste `plus_loin` ES réconciliée, descriptions de termes auteurs/collections **vides** confirmées (preuve de non-perte des « biographies », cf. C5). **Re-run immédiat → 0 création, uniquement des updates no-op, et 0 fiche avec `contentTouched=true`** (double preuve : idempotence + neutralisation des hooks).

**Statut au 12/07 : prouvé sur Neon réel.** 295 livres / 256 auteurs / 611
médias importés, idempotence vérifiée par re-run (0 création, 0
`contentTouched=true`). `rewrite-html.ts` étendu (PR #9) d'une fonction
`rewriteInternalLinks` : ~50 liens `<a href>` de `presentation`/`plusLoin`
pointant vers `editionssociales.fr`/`ladispute.fr` (une autre fiche ou la
racine) sont réécrits en `/catalogue/<edition>/<slug>` ou `/` — le nouveau
site n'a qu'un seul niveau de chemin par fiche, aucune page fille ;
`prepareHtmlForLexical` reconnaît ces formes comme `href` valides (sans quoi
elles seraient déballées dès la première réédition Payload d'une fiche).
`catalogue-wp-map.ts` corrige au passage un artefact de saisie ACF (nombre de
pages décimal, `"354.104"` sur un fac-similé — donnée source réelle, pas un
bug de migration ; un compte de pages est désormais toujours tronqué en
entier, côté WP comme côté pg).

### E4 — Adaptateur Postgres + mapper pur (0,5 j — lun 13/07)
**Statut au 12/07 : livré.** `CATALOGUE_SOURCE=pg pnpm build` est vert —
**316/316 pages, zéro appel WordPress** (le point de bascule unique de
`catalogue.ts:29` fonctionne réellement, pas seulement sur le papier).
**Quoi.**
- `src/lib/catalogue-pg-map.ts` — **pur, testé** : `payloadBookToWpBook(doc): WpBook` (mapping table en section migration) + `lexicalToHtml` (via `convertLexicalToHTML` de `@payloadcms/richtext-lexical/html`, avec repli `legacyHtml`).
- `src/lib/catalogue-pg.ts` — `server-only` ; `pgCatalogueSource(): CatalogueSource` : `listBooks(edition)` = `payload.find({ collection:'books', where:{ edition }, draft:false, limit:0/pagination, depth:2, sort:'-sortDate' })` → map ; `getBook(edition, slug)` = find `(edition, slug)` limit 1 avec contenu ; `listProducts()` = **délègue à `getAllStoreProducts()` de `boutique.ts`, inchangé** (angle mort n°2 de R1 : les `permalink` d'achat restent WooCommerce jusqu'à la phase commerce). Instance Payload via `getPayload({ config })` (mise en cache par Payload), connexion **poolée** (`DATABASE_URL` `-pooler`) — indispensable au build SSG qui pré-rend ~295 fiches en parallèle sans épuiser les connexions Neon.
- **Tri (correction v1)** : la clé est **`sortDate`, champ non-nul** — renseigné à `wpSource.wpDate` (= `post_date` WP) par la migration pour la parité d'ordre avec `orderby=date` de l'adaptateur http, et à `now()` par hook `beforeChange` (ou `defaultValue`) pour toute fiche créée dans Payload. Un tri sur `-wpSource.wpDate` placerait les NULL des fiches nées dans Payload en tête (comportement `ORDER BY … DESC` Postgres) — ordre non déterministe évité ; l'impact aval est limité (`queryBooks` re-trie par `publishedAt`, `catalogue-core.ts:200-207`) mais l'ordre du port reste ainsi défini pour tous les usages futurs.
- `src/lib/catalogue.ts:29` — **le point de bascule unique** devient :
  ```ts
  const source = process.env.CATALOGUE_SOURCE === "pg" ? pgCatalogueSource() : httpCatalogueSource();
  ```
  Défaut `http` : rien ne change tant que l'env n'est pas posée.
- Nouveau test `src/lib/catalogue-pg-map.test.ts` (vitest node, module pur — respecte la convention « seule la surface pure est testée ») : fixtures doc Payload → `WpBook`, y compris cas cover objet, prix décimal, date ISO, lexical→HTML vs `legacyHtml`, fiche sans `wpSource` (née dans Payload) correctement mappée.
**Fichiers.** `src/lib/catalogue-pg.ts`, `src/lib/catalogue-pg-map.ts` (+ `.test.ts`), `src/lib/catalogue.ts` (1 ligne + import), `.env.example` (+`CATALOGUE_SOURCE`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PAYLOAD_SECRET`, `BLOB_READ_WRITE_TOKEN`).
**Vérifier.** 55 + nouveaux tests verts ; `CATALOGUE_SOURCE=pg pnpm build` : les ~295 fiches se pré-rendent depuis Neon via l'URL poolée (SSG `generateStaticParams` frappe la base au build — c'est attendu).

### E5 — Script de parité http ⟷ pg (0,25 j — lun 13/07)
**Statut au 12/07 : livré, 0 diff bloquant** (était 761) — PR #9 a étendu le
classifieur de réhébergement OVH→Payload (`scripts/compare-classify.ts`,
extrait pour rester pur et testable) aux URL nues et aux hôtes `cms-*`, puis
la réécriture des liens internes de corps de texte (voir encart en tête de
document) a résorbé le reste.
**Quoi.** `scripts/compare-sources.ts` : instancie les **deux** adaptateurs, exécute `buildCatalogue` deux fois, diff champ à champ des `Book` appariés par `(edition, slug)` + `buildBookDetail` sur toutes les fiches (HTML comparé **après** `sanitizeCms`, normalisation espaces/entités) + facettes + `newReleases`. Sortie : diffs classés `BLOQUANT` (donnée manquante/altérée) vs `COSMÉTIQUE` (URL média OVH→Blob attendue, espaces, NBSP orthotypo) ; **cas whitelistés explicitement** : fiches supprimées/dépubliées côté WP et traitées par le balayage de suppressions du script d'import (listées, pas bloquantes) ; exit code ≠ 0 si bloquant. Contrôle additionnel : **0 URL OVH résiduelle** dans les champs médias de la base (condition d'extinction E11).
**Fichiers.** `scripts/compare-sources.ts`.
**Vérifier.** Run complet < 2 min ; premier rapport de parité archivé ; c'est l'outil des étapes E8/E9.

### E6 — Fraîcheur : invalidation à la sauvegarde + images Blob (0,5 j — mar 14/07)
**Statut au 12/07 : non couvert par le run** (hooks de revalidation, orthotypo) —
aucune preuve à date, section inchangée.
**Quoi.**
- Hooks Payload `afterChange`/`afterDelete` sur `books`, `authors`, `collections`, `media` (`src/payload/hooks/revalidate.ts`) → invalidation ciblée du cache Next : tag `catalogue` posé sur les lectures de la façade + revalidation du chemin de la fiche modifiée. **Chaque hook commence par `if (req.context?.disableRevalidate) return;`** (neutralisation pendant l'import — E3). ⚠️ **API exacte (`revalidateTag`, `unstable_cache`/`cacheTag`…) à confirmer dans `node_modules/next/dist/docs/01-app/02-guides` (ISR/caching) au moment de coder** — Next 16 diffère des acquis ; l'exigence fonctionnelle est : *une sauvegarde en back-office est visible sur le site en < 1 min, sans attendre la fenêtre 3600 s* (R1 §5).
- `next.config.ts` : ajout du `remotePattern` Blob (`*.public.blob.vercel-storage.com` `/…`) **en plus** des patterns OVH (cohabitation : le HTML historique peut encore référencer OVH jusqu'à extinction).
- **Orthotypographie française** (promesse devis §3.1, témoin plugin Orthotypo) : `src/lib/typo-fr.ts` — fonction pure `frenchTypo(text)` : espaces insécables (NNBSP avant `; ! ?`, NBSP avant `:` et à l'intérieur de `« »`), appliquée aux nœuds texte via l'option `textFilter` de sanitize-html dans `cms-html.ts` + aux titres dans `toBook`. Périmètre conservateur par défaut (pas de conversion automatique des guillemets — décision client Q4). Tests `typo-fr.test.ts`. Nota : ce n'est pas un refactor iso-rendu mais une fonctionnalité vendue — les diffs NBSP sont whitelistés « cosmétiques » dans E5.
**Fichiers.** `src/payload/hooks/revalidate.ts`, `src/payload/collections/*.ts` (branchement hooks), `next.config.ts`, `src/lib/typo-fr.ts` (+test), `src/lib/cms-html.ts`, `src/lib/catalogue-core.ts` (appel `frenchTypo` sur titres — 2 lignes).
**Vérifier.** Éditer un prix dans `/admin` → visible sur la fiche en < 1 min sur un déploiement `pg` ; images cover servies depuis Blob par `next/image` ; tests verts ; re-run du script d'import → toujours 0 revalidation déclenchée (log).

### E6bis — Bloc mise en avant (0,25 j — mar 14/07)
**Statut au 12/07 : non couvert par le run** — section inchangée.
**Quoi.** L'engagement **C32 du devis** (« mises en avant ponctuelles », remplaçant les 2 Popup Builder) n'avait pas de propriétaire — il en a un ici. Collection (ou global) Payload `highlight` : titre, texte court, lien, dates début/fin, actif. Rendu en bandeau/encart sur la page d'accueil — server component, conditionné aux dates (affiché seulement si actif et date courante dans [début, fin]), **iso-rendu quand inactif**. Réutilise le hook de revalidation de E6 (une sauvegarde du bloc est visible en < 1 min). Démonstration à l'équipe lors de la prise en main (E7) ; ajouté à la recette globale.
**Fichiers.** `src/payload/collections/Highlight.ts` (ou global dans `payload.config.ts`), `src/app/(site)/page.tsx` (encart), `src/payload/hooks/revalidate.ts` (branchement — hook E6 réutilisé).
**Vérifier.** Publier un bandeau daté → visible sur l'accueil en < 1 min ; désactivé ou hors dates → page d'accueil strictement iso (diff DOM) ; tests verts.

### E7 — Merge dans `main` (mar 14/07) puis DÉMO back-office (mer 15/07) + prise en main (0,5 j)
**Quoi.**
1. **Mar 14/07 — merge de `feat/payload-backoffice` dans `main`, `CATALOGUE_SOURCE` non posée** (correction v1 : sans ce merge, `/admin` n'existerait pas en production le 15/07 — la preview est bloquée par le SSO Vercel). Conséquences maîtrisées : le front public **ne change pas** (défaut `http` — « rien ne change tant que l'env n'est pas posée », et E1.a est iso-rendu vérifié) ; `/admin` devient réel en prod avec les 295 fiches ; le déploiement prod exécute `migrate:prod` via `vercel-build` (no-op : schéma déjà appliqué) ; la fenêtre du problème de build de branche se referme. Vérifs post-merge : front prod iso (échantillon de pages), `/admin` accessible, phase dons non perturbée.
2. En parallèle : branche `catalogue-pg` déployée en preview avec env **scopée branche** `CATALOGUE_SOURCE=pg` (Vercel : env preview par branche) : montrer **le même front** servi par la nouvelle base.
3. **Mer 15/07 — démo (45 min)** sur `/admin` **de production**, données réelles : chercher une fiche, corriger une coquille → visible en ligne < 1 min (note : tant que la prod lit `http`, la correction est montrée sur la preview `pg` ou dans l'admin ; la boucle complète « éditer → voir en prod » n'existe qu'après le swap — le dire honnêtement) ; créer une fiche « à paraître » ; uploader une couverture ; montrer les rôles (compte `editor` sans accès Users) ; montrer le champ `bio` auteurs (vide — aucune donnée existante à migrer, vérifié en base) et acter son usage. Comptes créés pour l'équipe (P7). Prise en main n°1 avec Floée dans la foulée, **sur `/admin` prod** ; remise d'un aide-mémoire d'une page (`site/docs/BACK-OFFICE.md` — capturé dans le repo, donc transféré avec lui).
**Consigne donnée à l'équipe ce jour-là, explicite** : jusqu'à la bascule (~20/07), le back-office est un **bac à essai** — la saisie réelle continue dans WordPress ; toute modification d'une fiche migrée dans Payload sera écrasée par l'import delta final ; les fiches d'essai sont préfixées `TEST —` et purgées avant bascule.
**Vérifier.** L'équipe réalise elle-même le scénario ; liste de retours consignée en issues GitHub.

### E8 — Vérification par échantillon avec le client (0,5 j — jeu 16 → ven 17/07)
**Quoi.** Le poste vendu « migration vérifiée par échantillon avec vous ». 15 fiches côte à côte (prod WordPress vs preview `pg`) : 10 tirées au hasard + 5 cas durs choisis — (1) fiche « à paraître » (date future), (2) fiche ES avec `plus_loin` ancien (piège COALESCE), (3) fiche à médias embarqués dans le HTML (une des 7 — R3 §6), (4) fiche au lien boutique cassé (une des 9 — R2 §2.2), (5) fiche LD à ISBN avec espace final. Corrections du mapping si besoin → **re-run complet de l'import** (idempotent, hooks neutralisés) → re-run parité E5. Les correctifs post-merge atterrissent dans `main` par petites PRs.
**Vérifier.** Validation écrite (mail) du client sur l'échantillon ; rapport de parité : 0 bloquant.

### E9 — Gel de saisie, delta final, SWAP production (0,25 j — lun 20 → mar 21/07)
**Mise à jour 12/07 : la date lun 20/07 ci-dessous est supersédée.** Ce SWAP ne
se déclenche plus isolément : il **rejoint la fenêtre de bascule unique**
(site + `CATALOGUE_SOURCE=pg` + `COMMERCE_NATIVE=1`), proposée 24–28/07 par le
client — voir [`../README.md`](../README.md) (calendrier consolidé) et
[`../02-mise-en-production.md`](../02-mise-en-production.md) (runbook fusionné
02+04). La procédure ci-dessous (gel, health-check, delta final, rollback)
reste la référence d'exécution ; seule sa date bascule dans le runbook fusionné.
**Quoi.**
1. **Annoncé le 16/07** : gel de saisie catalogue à partir de **lun 20/07 09:00** (protocole complet en section migration ; durée cible < 24 h).
2. **Health-check préalable obligatoire** (en tête de `fetch-wp.ts`, échec bruyant) : `GET $WP_ES_URL/wp-json/wp/v2/catalogue?per_page=1&_fields=id,book` → 200 **et** champ `book` présent ; idem LD. Si le cutover DNS (phase 2) a déjà eu lieu, ces URLs doivent être les `cms-*` (P10) — sinon le delta capturerait le **nouveau site** au lieu de WordPress et l'adaptateur http dégraderait en silence (catalogue vide/partiel, par design `catalogue-http.ts:44-48`).
3. Lun 20/07 : purge des fiches `TEST —` dans Payload → **import delta final** (re-run complet du script — quelques minutes pour 295 fiches ; balayage des suppressions inclus, cf. section migration) → run de parité E5 : 0 bloquant exigé.
4. Pose de `CATALOGUE_SOURCE=pg` sur la cible **production** Vercel + redéploiement de `main`. Vérifs post-swap : échantillon de fiches, facettes, nouveautés, recherche ; build du déploiement vert (pré-rendu SSG depuis Neon).
5. **Levée du gel côté Payload uniquement** : le back-office devient l'unique surface de saisie. Dépôt du mu-plugin de gel `wp-headless/es-freeze-catalogue.php` (nouveau, versionné dans le repo : retire les capabilities d'édition du CPT `catalogue` — réversible en supprimant le fichier) dans les deux WP, avec l'accord du client.
6. Passage du plan Neon Free → **Launch** (la prod dépend maintenant de la base).
**Rollback** (à tout moment du recouvrement) — protocole durci :
- **Précondition** : health-check ci-dessus vert sur `WP_ES_URL` **et** `WP_LD_URL` tels que configurés dans l'env Vercel. **Rollback interdit si le check échoue** (après cutover DNS sans découplage cms-*, un flip d'env ferait « relire » le nouveau site lui-même → catalogue vide en silence). Si le check échoue : rétablir d'abord la joignabilité WP (poser `cms-es`/`cms-ld` + repointer l'env — P10), puis seulement flipper.
- Exécution : retirer `CATALOGUE_SOURCE` en production + redéployer (≈ 3 min) → le front relit WordPress ; retirer le mu-plugin de gel → l'équipe resaisit dans WP les modifications faites dans Payload depuis le swap (listées via les versions Payload, `updatedAt > date du swap`).
**Vérifier.** Prod publique verte ; Better Stack vert ; aucune erreur runtime Vercel/Sentry sur les routes catalogue ; l'équipe fait sa première vraie édition dans Payload.

### E10 — Recouvrement (7 jours, mar 21 → lun 27/07 — surveillance, pas de charge)
WordPress reste allumé, gelé en écriture, **joignable aux URLs configurées dans l'env** (rollback à chaud possible — si la phase 2 bascule le DNS pendant cette fenêtre, P10 s'applique d'abord : `cms-*` + repoint env, health-check vert exigé). Critères objectifs de fin (tous exigés) :
1. **Parité au swap** : rapport E5 = 0 diff bloquant, diffs cosmétiques signés.
2. **Usage réel** : ≥ 5 opérations d'édition réelles par l'équipe dans Payload, vérifiées en ligne (dont ≥ 1 création et ≥ 1 upload de couverture).
3. **7 jours consécutifs** sans erreur applicative sur les routes catalogue (Sentry si posé par la phase ops, sinon logs runtime Vercel + Better Stack) et sans anomalie de contenu signalée par l'équipe.
4. **Exports finaux remis et accusés réception par écrit** (E11.1).

### E11 — Exports finaux puis extinction douce (0,25 j — ven 31/07, jamais avant le 302→301 de la phase 2)
**Quoi — « éteindre » concrètement sur mutualisé OVH, en 3 crans :**
1. **AVANT toute action (principe absolu n°1)** — remise au client (lien de téléchargement + checksums) : par site, export WordPress XML (wp-admin → Outils → Exporter), dump SQL complet frais (mysqldump/phpMyAdmin OVH — pas les dumps du 01/07), archive `tar.gz` de `wp-content/uploads` **complet** (le 1 Go entier, dérivés inclus — l'archive est exhaustive même si la migration n'a pris que l'utile), copie du thème `cenote_child` + mu-plugins. Ces exports sont aussi l'engagement de réversibilité du devis §9.
2. **Extinction douce = fermer l'accès web, garder les octets** : suppression des attachedDomains `cms-es`/`cms-ld` (posés par la phase 2) via l'API OVH + `.htaccess` `Require all denied` à la racine de `www/` et `LaDispute/` + suppression des enregistrements DNS `cms-*`. Fichiers et bases restent en **dormance** sur le slot Pro (0 € de plus, 2,7 Go / 250 Go). ⚠️ Ne toucher ni `Boutique/`, ni `BioMarx/` (GEME), ni aucun enregistrement MX/DKIM/SPF/DMARC. Précondition évidente mais écrite : le cutover DNS de `editionssociales.fr`/`ladispute.fr` (phase 2) est **fait** — on ne ferme pas l'accès web d'un dossier qui sert encore le domaine public. **Contrainte d'ordre intra-semaine, impérative** : E11 ne s'exécute **jamais avant** le passage 302→301 de la phase 2 (E7 — la fin officielle de la réversibilité DNS : un rollback DNS n'a de sens que si le WordPress `www` peut resservir le front public). Ordre de la semaine du 28–31/07 : recette → 301 (E7) → transfert de propriété → **extinction douce (31/07)** — la dormance ne coûte rien, ne pas se presser.
3. **Purge définitive différée** (hors périmètre de cette phase, planifiée) : suppression des dossiers `www/`+`LaDispute/` et des bases `editionskes`/`editionsk712` (API `/hosting/web/.../database` — cibler précisément ces deux-là), **uniquement sur validation écrite du client**, recommandée fin septembre après recette de la phase commerce.
**Vérifier.** `curl https://cms-es.editionssociales.fr/wp-json/...` → NXDOMAIN/403 ; le site public, la boutique et GEME répondent 200 ; les exports s'ouvrent (test de restauration du dump SQL dans la MariaDB locale) ; contrôle E5 « 0 URL OVH résiduelle » passé.

### E12 — Sauvegarde nocturne = jalon S2 de la phase 6 (0 j — exécution dans la fenêtre du 20–24/07)
**Quoi.** Plus un livrable propre de cette phase (doublon supprimé — les 0,25 j sont **transférés à la phase 6**) : la sauvegarde nocturne est spécifiée par le **jalon S2 de la phase 6, dont la spécification fait foi** — `pg_dump` **chiffré** (`age`) → store Blob **privé dédié** + copie médias additive + rétention 30 j / 12 mois + heartbeat. La version non chiffrée sur le store médias, un temps envisagée ici, **ne doit pas exister**. Ce qui reste à cette phase : **exécuter le jalon S2 dans la fenêtre du 20–24/07** — condition d'extinction (E11) et naissance de la promesse « sauvegardée chaque nuit » du devis §5, qui naît avec la base. Le test de restauration est le même geste — une seule exécution (celle du jalon S2).
**Vérifier.** Jalon S2 vert (run manuel + heartbeat reçu + restauration test) avant E11.

---

## Donnees et migration

### Schéma (collections Payload → tables Postgres, schéma SQL `payload`)

Le mapping part du **payload `book` du mu-plugin** (contrat déjà consommé par le front — LEGACY-STACK §10.3) croisé avec les meta_keys réels de R2. Rappel des renommages ACF→payload (R3 §1) : `nombre_pages`→`pages`, `extrait_choisi`→`extrait`, `boutique_es`→`boutique`.

**`books`** (table `payload.books` + `payload.books_rels` pour les relations, DDL générée par Drizzle/`payload migrate:create`) :

| Champ Payload | Type | Contrainte / note | Source WP |
|---|---|---|---|
| `title` | text, required | entités décodées à l'import | `title.rendered` |
| `slug` | text, required | **unicité couvrant l'espace `edition` ∪ null** : unique composite `(edition, slug)` + unique partiel sur `slug` quand `edition IS NULL` (contrat phase 4) ; slugs conservés à l'identique → espace d'URL inchangé, zéro redirection | `slug` |
| `edition` | select `editions-sociales`\|`la-dispute`, **nullable**, indexé | **contrat d'interface posé par la phase 4** : les entrées boutique-seules de septembre (15 produits orphelins, mesuré par `migrate-products.ts`) n'ont pas de maison ; toutes les fiches migrées en ont une | site d'origine |
| `origin` | select `catalogue`\|`boutique`, required, default `catalogue` | contrat d'interface phase 4 : migration → `catalogue` ; les entrées boutique-seules de septembre → `boutique` | — |
| `presentation` | richText (Lexical), required | converti depuis HTML (`convertHTMLToLexical`) ; 0 fiche à contenu vide (R2 §1.1) | `content.rendered` |
| `presentationLegacyHtml` | textarea, `admin.hidden` | snapshot HTML d'origine (URLs médias déjà réécrites vers Blob) — parachute de parité | idem |
| `plusLoin` | richText (Lexical), nullable | ⚠️ ES : réconcilié `COALESCE(pour_aller_plus_loin, plus_loin)` (voir piège ci-dessous) | `book.plus_loin` |
| `plusLoinLegacyHtml` | textarea, hidden | idem | |
| `contentTouched` | checkbox, hidden, default false | posé `true` par hook `beforeChange` **uniquement hors import** (`if (req.context?.migration) return;`) — pivote le rendu legacy→Lexical dans le mapper | — |
| `isbn` | text | **TRIM à l'import** (espaces finaux LD — R2 §1.2) | `book.isbn` |
| `prix` | number | `numeric(6,2)` ; décimales réelles (`9.99`) | `book.prix` |
| `pages` | number, nullable | 2 fiches ES sans valeur | `book.pages` |
| `dateParution` | date, required | `Ymd`/`JJ/MM/AAAA` → ISO ; remplie à 100 % (R2) ; **reste la clé du statut `upcoming`** calculé par `resolvePurchase` — comportement inchangé | `book.date_parution` |
| `sortDate` | date, **required (non-nul)** | **clé de tri du port** (parité avec `orderby=date` http) : migration → `wpSource.wpDate` ; création dans Payload → `now()` (hook `beforeChange`/`defaultValue`). Jamais NULL → pas de NULL-first en `ORDER BY DESC` | `post.date` (WP) / `now()` |
| `aParaitre` | checkbox, default false | migré depuis la taxonomie `parution` (5 fiches) ; **informatif, non câblé au front** (le front l'ignore déjà — R3 §3) ; câblage éventuel = décision client Q1 | taxo `parution` |
| `authors` | relationship hasMany → `authors` | | `book.authors` |
| `collection` | relationship → `collections`, nullable | validate : même `edition` ; 3 fiches LD sans collection (R2 §1.4) | `book.collection` |
| `cover` | relationship → `media` | 295/295 remplies (R3 §5) ; requis en création de fiche neuve | `book.cover` |
| `tablePdf` / `extraitPdf` | relationship → `media`, nullable | 115 `table` + 3 `extrait` | `book.table` / `book.extrait` |
| `buy.boutiqueUrl` | text (group `buy`) | l'URL produit Woo **reste la clé de matching** catalogue↔boutique (`slugFromBoutiqueLink`) jusqu'à la phase commerce | `book.boutique` |
| `buy.parislibrairies` / `buy.lalibrairie` | text | | idem |
| `wpSource.site` / `wpSource.wpId` / `wpSource.wpSlug` / `wpSource.wpDate` | select / number / text / date — group `admin.readOnly`, nullable (vide pour les fiches nées dans Payload) | **clé d'upsert idempotente `(site, wpId)`** | REST `id`, `slug`, `date` |
| `_status` (drafts Payload) | | migration : tout en `published` (0 brouillon en WP — R2 §1.1) ; l'adaptateur lit `draft:false` | |

**`authors`** : `name` (« Prénom Nom », converti une fois depuis `Nom/Prénom`), `slug` unique, **`bio` richText optionnel** (capacité devis §3.1 — livrée vide : 0 description de terme non vide sur les 322 termes auteur des deux bases, vérifié dans les dumps ; contrôle de non-perte dans `sql-oracle.ts`). Dédoublonnage **global par slug** entre ES et LD (322 termes bruts, recouvrement probable) — reproduit la fusion de facettes actuelle par slug ; divergences de `name` à slug égal listées dans le rapport (Q8).
**`collections`** : `name`, `slug`, `edition` ; unique `(edition, slug)` ; contrôle « descriptions vides » idem.
**`media`** : upload Blob, `alt`, `sourceUrl` (unique — idempotence), largeur/hauteur calculées par sharp (alimente le `cover {url,width,height}` du contrat — la fonctionnalité « ratio exact » devient native).
**`users`** : auth, `role`.
**Un livre n'est JAMAIS supprimé faute d'être en vente** : le schéma n'a aucun mécanisme de retrait lié à la disponibilité ; le statut (`available`/`external`/`upcoming`/`unavailable`) reste **dérivé au rendu** par `resolvePurchase` exactement comme aujourd'hui. La suppression manuelle reste possible pour un `admin` (pas pour un `editor` — access control), et les drafts couvrent le « pas encore publiable ».
**Non migrés (défaut, décision client Q2)** : CPT legacy `livre` (2 posts clones), metas quasi vides `presse`/`revues_de_presse` (3 valeurs non vides), taxonomie `parution` au-delà du flag, thèmes/scories. Tout reste dans les exports finaux.

### Stratégie de migration — tranchée : REST `book` en source primaire, dumps SQL en oracle

**Source primaire = l'API REST de production** (`{WP_ES_URL,WP_LD_URL}/wp-json/wp/v2/catalogue?per_page=100&page=N&_fields=id,slug,title,content,book,date`), après redéploiement du mu-plugin (P4). Justification : c'est le format déjà normalisé par `es_headless_get_field` (exactement le contrat que le front consomme — moins de mapping, LEGACY-STACK §10.3), et la prod est **plus fraîche** que dumps et miroirs (295 vs 293 fiches ; miroirs périmés — R3 §5). **Garde-fou (E9)** : `fetch-wp.ts` commence par un health-check (200 + champ `book` présent) et **échoue bruyamment** si la source ne répond pas la forme attendue — protège le delta final d'un cutover DNS intervenu entre-temps.
**Oracle secondaire = les dumps SQL locaux (MariaDB :3307, via `mysql2`)**, pour ce que le REST ne garantit pas :
- **Piège `plus_loin` ES (R2 §1.3)** : les deux meta_keys `plus_loin` (47 anciennes valeurs) et `pour_aller_plus_loin` (6 récentes) pointent le même field_key. `sql-oracle.ts` calcule `COALESCE(NULLIF(pour_aller_plus_loin,''), NULLIF(plus_loin,''))` par post ES et **compare au REST** : tout post où SQL a du contenu et REST renvoie `null` est **patché depuis le dump** (log dans le rapport). Symétriquement, on vérifie que les 6 valeurs récentes arrivent.
- Comptages attendus par site, taux de remplissage par champ (table R2 §1.3), ISBN à espaces, flags `parution`, inventaire des liens `boutique_es` (dont les 9 cassés), **descriptions de termes auteur/collection vides** (preuve de non-perte, cf. champ `bio`).
- Les 2 fiches LD postérieures aux dumps sont attendues « REST seul » — le rapport les liste au lieu de les compter en anomalie.

**Le script** (`scripts/migrate-catalogue/`, lancé par `pnpm tsx scripts/migrate-catalogue/index.ts --site=all [--dry-run]`, écrit via **Payload Local API** — `getPayload({config})`, validations du schéma appliquées — **avec `context: { migration: true, disableRevalidate: true }` sur chaque `create`/`update`** : les hooks `contentTouched` et de revalidation se neutralisent via `req.context`, sans quoi l'import basculerait toutes les fiches en rendu Lexical et déclencherait ~295 appels de revalidation hors contexte Next — cf. E3) :
1. `fetch-wp.ts` — health-check bruyant, puis pagination des deux fonds, fiche complète (avec `content` et `date`).
2. `sql-oracle.ts` — contrôles + correctifs ci-dessus.
3. `media.ts` — collecte des URLs : couvertures (**originaux seulement** : strip du suffixe `-WxH`, GET de l'original sur la prod OVH, repli sur l'URL servie si 404 — R3 §5 garantit 100 % d'originaux présents), 118 PDF `table`/`extrait`, fermeture transitive des uploads référencés dans `content`/`plus_loin` (~190 réfs, regex `uploads/AAAA/MM/…`, **fichiers exacts référencés, variantes `-WxH` comprises** — fidélité maximale, volume négligeable). Upload en `media` avec `sourceUrl` = URL d'origine (dédoublonnage + idempotence) ; attention aux accents/percent-encoding dans les noms (R3 §6). Volume total ~160–200 Mo — **la source du rapatriement est la prod OVH, pas le miroir local** (R3 §7.2).
4. `rewrite-html.ts` — table `sourceUrl → url Blob` appliquée au HTML de `content`/`plus_loin` **avant** conversion Lexical (le HTML legacy et le Lexical portent donc tous deux les URLs Blob).
5. `import.ts` — upsert `authors` (dédoublonnés), `collections`, puis `books` par `(wpSource.site, wpSource.wpId)` ; conversions (TRIM, dates, HTML→Lexical via `convertHTMLToLexical` de `@payloadcms/richtext-lexical`, snapshots `*LegacyHtml`, `sortDate` ← `wpSource.wpDate`). **Balayage final des suppressions** : tout book existant dont `(wpSource.site, wpSource.wpId)` n'apparaît plus dans la capture REST est **listé dans le rapport et passé en draft** (suppression définitive seulement sur confirmation humaine) — sans ce balayage, une fiche dépubliée côté WP entre deux runs resterait en trop côté pg et sortirait en diff bloquant au pire moment (fenêtre de gel). Le cas est whitelisté dans `compare-sources.ts`.
6. `report.ts` — rapport Markdown + JSON : compteurs, taux de remplissage vs attendus, patchs `plus_loin`, liens cassés, médias en échec, suppressions détectées, **compteur `contentTouched=true` (attendu : 0 après tout run d'import)**, durée. C'est la pièce montrée au client à l'échantillonnage.

**Idempotence prouvée** : re-run complet = 0 création + 0 `contentTouched` (E3) ; c'est ce qui rend le delta final du 20/07 trivial et le calendrier robuste (l'équipe continue de saisir dans WP jusqu'au gel, tout est recapturé).

**Le mapper de sortie** (`catalogue-pg-map.ts`) referme la boucle vers le port :
`title → {rendered}` · `presentationLegacyHtml`/Lexical → `content.rendered` (**legacy par défaut tant que `contentTouched=false`** — c'est-à-dire tant que la fiche n'a pas été rééditée par un humain dans Payload, l'import ne posant jamais ce flag ; Lexical→HTML dès qu'elle l'est) · `prix → number` (le port accepte string|number) · `dateParution → 'YYYY-MM-DD'` (accepté par `parseWpDate`, vérifié) · `authors/collection → Term{name,slug}` · `cover → {url,width,height}` (dims sharp) · `tablePdf/extraitPdf → URL` · `buy.* → boutique/parislibrairies/lalibrairie`.

**Rollback de migration** : la migration n'écrit **que** dans Neon (schéma `payload`) et Blob — les WordPress ne sont jamais touchés en écriture (principe n°1). Rollback = `payload migrate:fresh` sur base de dev, ou drop du schéma `payload` + re-run ; avant le swap, aucun utilisateur ne dépend de la base.

**Protocole de saisie pendant la fenêtre (g du périmètre)** — règle unique : **à tout instant, il n'existe qu'une seule surface de saisie légitime.**
- 09/07 → 20/07 09:00 : saisie réelle dans **WordPress** (comme toujours — COHABITATION : « aucune ressaisie, aucun gel pendant la construction ») ; Payload = bac à essai (fiches `TEST —`, écrasement au delta annoncé à la démo).
- 20/07 09:00 → validation du swap (< 24 h, annoncé le 16/07) : **gel total** (ni WP ni Payload).
- Après swap : **Payload uniquement** ; verrou technique côté WP par mu-plugin `es-freeze-catalogue.php` (capabilities d'édition du CPT retirées, réversible par suppression du fichier) — la double saisie devient impossible, pas seulement interdite.

---

## Recette et criteres d'acceptation (point de vue client, testables)

1. **Complétude** : le site public affiche le même catalogue qu'avant la bascule — 295 fiches (au comptage du jour du gel), mêmes URLs (`/catalogue/[edition]/[slug]` inchangées — les route groups de E1 n'affectent aucun chemin), compteurs par maison identiques (`countByEdition`), facettes auteurs/collections identiques. Preuve : rapport `compare-sources.ts` = 0 diff bloquant, annexé.
2. **Échantillon validé** : les 15 fiches (10 aléatoires + 5 cas durs listés en E8) comparées côte à côte sont déclarées conformes par l'équipe, par écrit.
3. **Édition de bout en bout** : une personne de l'équipe (Floée), seule, sait — se connecter à `/admin`, corriger un prix et voir le changement en ligne en < 1 min, créer une fiche complète « à paraître » avec couverture (visible sur le site avec le bandeau À paraître), passer un livre d'« à paraître » à « en vente » en renseignant le lien boutique. Testé en séance de prise en main.
4. **Rôles** : un compte `editor` ne peut ni créer d'utilisateur ni toucher à la configuration ; un `admin` le peut. Démonstration en séance.
5. **Aucune régression d'achat** : les boutons d'achat renvoient toujours vers la boutique WooCommerce / les libraires ; les statuts (En vente / Disponible en librairie / À paraître / Indisponible en ligne) sont identiques à l'existant sur l'échantillon.
6. **Couvertures** : servies depuis le nouveau stockage (URL `blob.vercel-storage.com` visible), nettes, au ratio exact (plus de 2:3 forcé) ; fiches PDF (table des matières/extrait) téléchargeables.
7. **Réversibilité démontrée** : pendant le recouvrement, un rollback à blanc est exécuté une fois devant le client (health-check WP vert → flip d'env → le site relit WordPress → re-flip), en ≤ 15 min. Le health-check fait partie de la démonstration : la réversibilité est conditionnée à la joignabilité WordPress, et cette condition est vérifiable.
8. **Exports remis** : XML + dump SQL frais + archive uploads + thème, par site, avec checksums — accusé de réception écrit **avant** l'extinction douce.
9. **Sauvegarde vérifiable** : le client voit le dump nocturne chiffré du jour dans le store privé dédié (jalon S2 de la phase 6 — E12) et l'alerte heartbeat verte.
10. **Extinction sans dommage collatéral** : après E11, `editionssociales.fr` (nouveau site), la boutique et `gememarxengels.org` répondent 200 ; les emails `@editionssociales.fr` fonctionnent (aucun enregistrement MX modifié — vérifiable par l'en-tête d'un mail envoyé/reçu le jour même).

---

## Risques et parades

| # | Risque | Impact | Parade |
|---|---|---|---|
| 1 | **Payload ⟷ Next 16.2.9 casse au build** (Turbopack, `withPayload`) — y compris la réorganisation en route groups (E1.a) qui consomme une partie du gate | Bloque tout | Gate E1 en première heure, binaire, timeboxé 0,5 j **incluant E1.a budgété (~1 h)** ; E1.a est iso-rendu et conservable seul ; repli assumé : WordPress reste la saisie via l'adaptateur http (le front ne bouge pas — principe n°2), démo du 15/07 = schéma + import ; versions épinglées, montées en tandem |
| 2 | **Fidélité HTML→Lexical→HTML** (7 fiches à médias embarqués, tableaux, iframes filtrés) | Fiches dégradées | Double stockage : `*LegacyHtml` servi par défaut **tant que `contentTouched=false` — flag que l'import ne pose jamais grâce à `req.context.migration` (le parachute survit à tous les re-runs, delta final compris)** ; diff HTML post-`sanitizeCms` dans E5 ; revue humaine des 7 fiches à l'échantillonnage |
| 3 | **Piège `plus_loin`/`pour_aller_plus_loin` ES** : perte silencieuse de 47 ou 6 valeurs selon ce que renvoie `get_field` | Perte de contenu éditorial | Oracle SQL `COALESCE` systématique + patch depuis dumps + liste nominative dans le rapport (E3) ; cas dur n°2 de l'échantillon |
| 4 | **Édition WP entre capture et bascule** (l'équipe saisit jusqu'au 20/07), y compris suppressions/dépublications | Divergence de contenu | Import full-refresh idempotent → delta final sous gel annoncé ; **balayage des suppressions** (draft + liste, whitelisté dans E5) ; parité E5 exigée à 0 bloquant avant flip |
| 5 | **Double saisie post-swap** (habitude wp-admin) | Contenu perdu au prochain export | Mu-plugin de gel `es-freeze-catalogue.php` (verrou technique, réversible) + consigne écrite + wp-admin toujours lisible |
| 6 | **Cutover DNS (phase 2) pendant le recouvrement** : les défauts de l'adaptateur http sont les domaines publics → après flip DNS, un rollback ou un delta « relirait » le nouveau site (dégradation silencieuse en liste vide, par design) | **Réversibilité vendue rendue muette au pire moment** | **P10 (précondition écrite inter-phases)** : `cms-es`/`cms-ld` + repoint `WP_ES_URL`/`WP_LD_URL` AVANT tout cutover antérieur à la fin du recouvrement ; **health-check bloquant** en tête du protocole de rollback (E9) et de `fetch-wp.ts` ; rollback interdit tant que le check n'est pas vert |
| 7 | **Rollback pendant recouvrement** → éditions Payload à resaisir dans WP | Ressaisie manuelle | Recouvrement court (7 j), versions Payload = journal exhaustif (`updatedAt > swap`), volume attendu quasi nul |
| 8 | **Latence Neon scale-to-zero** (~centaines de ms au réveil) sur régénérations ISR/SSG | Régénérations lentes, pas d'erreur | Acceptable (pages servies du cache pendant la régénération) ; passage à Launch au swap ; **scale-to-zero reste le réglage par défaut** — un compute allumé en continu coûterait **~18 €/mois** (0,25 CU × 0,106 $/CU-h × 730 h), pas « quelques € » : à n'activer que si la latence gêne réellement, en le disant au client (l'enveloppe §8 du devis l'absorbe, mais la ligne « ~1 €/mois » ne tient qu'avec scale-to-zero) |
| 9 | **Migrations vs base partagée et phase dons** : un build command global modifié casserait `main` (« missing script ») et ferait migrer les previews contre la base de prod | Casse des dons / schéma altéré avant revue | **Aucun réglage Vercel global touché** : script `vercel-build` porté par les commits de la branche, migrations conditionnées `VERCEL_ENV=production`, application initiale manuelle (URL directe) ; `push: false` partout ; **`schemaName: "payload"` dédié** — les dons vivent dans `public`, aucun chevauchement ; **preview branching Neon désactivé** (P1, documenté) |
| 10 | **/admin exposé en prod** dès le 14/07 (merge pré-démo) | Intrusion | Auth Payload (lockout natif), mots de passe forts imposés, pas d'auto-inscription, `PAYLOAD_SECRET` fort ; volumétrie d'attaque faible ; option post-phase : protection Vercel firewall sur `/admin` |
| 11 | **Échec du rapatriement d'un média** (URL accentuée/percent-encodée, 404) | Trou visuel | 100 % des originaux vérifiés présents (R3 §5) ; le script loggue chaque échec, la fiche garde alors l'URL OVH (encore servie pendant la cohabitation, `remotePatterns` OVH conservés) → correction manuelle avant extinction ; E11 ne part que si 0 URL OVH résiduelle dans la base (requête de contrôle dans E5) |
| 12 | **Dérive calendrier avant la démo du 15/07** (5 jours ouvrés dont un week-end) | Démo dégradée | Ordre des étapes = démo d'abord (E1–E3 suffisent pour montrer les 295 fiches réelles dans l'admin) ; E4–E6 peuvent glisser après la démo sans l'affecter (le merge du 14/07 glisse alors aussi, et la démo se fait en partage d'écran sur `pnpm dev` local ou preview — repli explicite) ; repli démo = fonds ES seul importé |
| 13 | Comptes/accès (SSO preview, tokens `.env` trompeurs) | Démo client bloquée | P8 tranché au 14/07 (défaut : `/admin` prod réel + partage d'écran) ; règle écrite : outillage infra = tokens du shell, jamais ceux de `site/.env` (R4) |

---

## Dependances et interfaces avec les autres phases

- **Phase 1 — Dons (livre AVANT cette phase, aucune dépendance bloquante)** : ressource partagée unique = la base Neon (P1 — le premier arrivé la crée). Contrat d'isolation : **dons dans le schéma SQL `public` (tables gérées par la phase dons), catalogue/Payload dans le schéma `payload`** ; aucune migration de l'un ne touche l'autre ; si la jauge des dons veut une table, elle est déjà chez elle dans `public`. Aucun import de code croisé. **Garantie supplémentaire (correction v1)** : cette phase ne modifie **aucun réglage global Vercel** (build command, env partagées hors celles listées) — les déploiements de la phase dons sur `main` ne peuvent pas être cassés par un commit de cette branche (`vercel-build` n'existe que sur les commits qui le portent).
- **Phase 2 — Mise en production** : (i) **P10, précondition écrite** : tout cutover DNS de `editionssociales.fr`/`ladispute.fr` **avant la fin du recouvrement (27/07)** exige le découplage CMS (`cms-es`/`cms-ld` + repoint `WP_ES_URL`/`WP_LD_URL` dans l'env Vercel + health-check vert) — c'est la condition de survie du rollback ET du delta final, pas seulement du front pré-swap ; à inscrire dans COHABITATION.md ; (ii) l'**extinction douce E11 exige que le cutover DNS soit fait** (on ne ferme pas l'accès web d'un dossier qui sert encore le domaine public) ; (iii) liens preview partageables (P8, devenu non bloquant grâce au merge pré-démo) ; (iv) Sentry (phase ops/prod) alimente le critère 3 du recouvrement — repli : logs Vercel + Better Stack.
- **Phase 4 — Commerce natif (septembre)** : `buy.boutiqueUrl` reste la clé de matching (`slugFromBoutiqueLink`) et `listProducts()` reste sur la Store API jusqu'à cette phase ; le moment venu, la phase 4 remplace `boutiqueUrl` par une relation vers sa collection `products` (une seule fiche par livre — devis §5) et swappe `listProducts` derrière le même port. **Contrat d'interface posé dès E2 par cette phase 4** : `edition` nullable + champ `origin` (`catalogue`\|`boutique`) + unicité de slug couvrant l'espace `edition` ∪ null — les 15 entrées boutique-seules de septembre entreront **sans maison** (mesuré par `migrate-products.ts`), sans migration délicate sur base vivante. Les 9 liens cassés + 15 produits orphelins (mesuré par `migrate-products.ts`, R2 §2.2) corrigés maintenant (Q3) lui simplifient la fusion. **La purge définitive des installs WP catalogue attend la recette de la phase 4** (dormance = filet).
- **Phase 5 — Newsletter** : aucune interface.
- **Ops / Phase 6** : la sauvegarde nocturne est portée par le **jalon S2 de la phase 6** (spécification qui fait foi ; 0,25 j transférés de E12 vers la phase 6), **exécuté par cette phase dans la fenêtre du 20–24/07** (E12, condition d'extinction) ; le heartbeat s'intègre au monitoring global ; les moniteurs Better Stack sur les 3 WP (décision stack §6) restent pertinents pendant la cohabitation, celui de la boutique reste après extinction des catalogues.
- **Contrats internes au repo qui protègent les autres phases** : le port `CatalogueSource` inchangé ; `sanitizeCms` reste l'unique fabricant de `SafeHtml` ; règles ajoutées à `site/CLAUDE.md` : « Next et Payload montent en tandem », « les scripts d'écriture Payload passent `context.migration`/`context.disableRevalidate` », « URL poolée pour l'app, directe pour migrate/dump » ; `COHABITATION.md` mis à jour (repo connecté — correction de la mention périmée ; état des phases ; P10).

---

## Calage calendrier (aujourd'hui = jeudi 09/07/2026)

> **Dates supersédées le 12/07** — le tableau ci-dessous garde son ordre
> relatif (E9 avant E10 avant E11) mais plus ses dates absolues : E9 (swap) ne
> se déclenche plus seul, il rejoint la fenêtre de bascule unique (24–28/07
> proposée) qui embarque aussi le commerce ; E10 (recouvrement) et E11
> (extinction) glissent d'autant. Dates qui font foi : [`../README.md`](../README.md).

| Date | Étapes | Jalon |
|---|---|---|
| ven 10/07 | E0 + E1 (gate : route groups E1.a + scaffold E1.b) + début E2 | **Gate Payload/Next tranché avant le week-end** |
| sam 11 – dim 12/07 | E2 fin (schéma appliqué manuellement sur Neon) + E3 (script + médias, premier run complet) | 295 fiches réelles dans `/admin` |
| lun 13/07 | E3 corrections + E4 (adaptateur pg) + E5 (parité) | Preview branche `catalogue-pg` en ligne |
| mar 14/07 | E6 (invalidation, Blob, orthotypo) + **merge `feat/payload-backoffice` → `main`** (`CATALOGUE_SOURCE` non posée, front iso, `/admin` réel en prod) + prépa démo + comptes (P7/P8) | Répétition de la démo sur `/admin` prod |
| **mer 15/07** | **E7 — DÉMO back-office sur la prod + prise en main n°1 (Floée)** | **Promesse tenue** |
| jeu 16 – ven 17/07 | E8 (échantillon client, corrections en petites PRs, re-run) ; annonce du gel | Validation écrite de l'échantillon |
| lun 20/07 | Gel 09:00 → health-check sources → delta final (+ balayage suppressions) → parité 0 bloquant → **E9 SWAP prod** | Prod sur Postgres (cohérent avec « en ligne 21–22/07 » du devis B−) |
| mar 21 – lun 27/07 | E10 recouvrement (7 j), équipe en saisie réelle dans Payload, rollback à blanc devant le client (health-check inclus) — si cutover DNS phase 2 : P10 d'abord ; E12 (exécution du jalon S2 phase 6) dans la fenêtre 20–24/07 | Critères 1–3 cochés |
| ven 31/07 | E11 : exports finaux remis → extinction douce (après le 302→301 E7 de la phase 2 et le transfert de propriété — ordre impératif de la semaine) | 2 WordPress catalogue éteints **avant la fermeture d'août** |
| fin sept | Purge définitive (validation écrite, après recette phase commerce) | Hors périmètre de cette phase, planifié |

**Effort estimé vs vendu (4,5 j / 900 €)** — chiffrage honnête :

| Poste | Vendu | Estimé | Écart |
|---|---|---|---|
| Base + schéma (E0–E2) | 0,5 | 1,5 (dont gate 0,5 — réorganisation route groups incluse — + rôles/admin fr + mécanique de migrations sans toucher aux réglages Vercel) | +1,0 |
| Migration 293→295 livres (E3, E8) | 1,0 | 1,25 | +0,25 |
| Couvertures + diffusion (dans E3/E6) | 0,5 | 0,5 (périmètre réel ~180 Mo, confortable — R3) | 0 |
| Back-office + prise en main (E6 typo, E7) | 2,0 | 1,5 (Payload absorbe l'essentiel ; champ `bio` ≈ 0) | −0,5 |
| Bascule + extinction (E4–E5, E9–E12) | 0,5 | 1,25 (adaptateur + parité + recouvrement durci + backup) | +0,75 |
| **Total** | **4,5** | **~6,0** | **+1,5 j** |

L'écart (+1,5 j, ~300 € au taux militant) vient de postes non détaillés au devis mais nécessaires à ses promesses (gate de compatibilité, script de parité, sauvegarde nocturne, verrou anti-double-saisie, protocole de rollback conditionné). **Ne pas gonfler silencieusement** : à absorber sur le socle offert / la marge du forfait, ou à réduire si besoin : orthotypo minimale (−0,25), prise en main fusionnée à la démo (−0,25), rollback à blanc non rejoué devant client (−0,1). Le calendrier ci-dessus suppose du travail le week-end du 11–12/07 (déjà le régime du chantier — commits du 09/07 au soir) ; sinon, la démo du 15/07 se fait sur E1–E3 seuls (fiches réelles dans l'admin, en partage d'écran local, merge et preview pg glissent au 16).

---

## Questions ouvertes / decisions client

| # | Question | À trancher au plus tard | Défaut recommandé |
|---|---|---|---|
| Q1 | **Statut de parution** : garder le statut 100 % dérivé (date + liens + dispo boutique, comportement actuel) ou câbler la case « à paraître » en override du front ? | Démo du 15/07 | **Dérivé, identique à aujourd'hui** (zéro toucher front — principe n°2) ; la case reste informative, câblage possible post-recette en micro-évolution |
| Q2 | **Contenus legacy non migrés** : CPT `livre` (2 posts), `presse`/`revues_de_presse` (3 valeurs non vides LD), taxonomie `parution` | Échantillonnage (17/07) | **Ne pas migrer** — tout reste dans les exports finaux, réimportable à la demande |
| Q3 | **Les 9 liens boutique cassés** (dérive de slug post-prévente — R2 §2.2) : corriger dans Payload (les livres redeviennent « En vente ») ou laisser en l'état ? | Avant le swap (20/07) | **Corriger les 9** (mapping par similarité de titre proposé, validation ligne à ligne avec l'équipe — 30 min) ; les 15 produits orphelins (mesuré par `migrate-products.ts`) restent pour la phase commerce |
| Q4 | **Périmètre orthotypographie** : insécables seules, ou aussi conversion automatique `"` → `« »` ? | Démo du 15/07 | **Insécables seules** (conservateur, réversible) ; les guillemets restent un geste d'édition |
| Q5 | **Date du gel de saisie** (fenêtre < 24 h) : lun 20/07 09:00 convient-il à l'équipe ? | 16/07 (annonce J−4) | **Lun 20/07 09:00** ; toute autre date décale swap et recouvrement d'autant |
| Q6 | **Modalité de la démo du 15/07** | 14/07 | **`/admin` de production** (merge du 14/07, front public inchangé) + partage d'écran pour le front servi par pg (preview SSO-bloquée sinon) ; prise en main autonome de Floée directement sur la prod. Le lien preview partageable (phase 2) reste un confort, plus un prérequis |
| Q7 | **Purge définitive** des dossiers `www`/`LaDispute` + bases `editionskes`/`editionsk712` : date | Recette d'août (avant fermeture) | **Fin septembre**, après recette de la phase commerce, sur validation écrite — la dormance ne coûte rien |
| Q8 | **Divergences de nom d'auteur à slug égal** entre ES et LD (détectées par le rapport de migration) : quelle graphie retenir ? | Échantillonnage (17/07) | La graphie **la plus récente** (site LD, mieux maintenu), liste soumise à l'équipe |
| Q9 | **Biographies d'auteurs** : le champ `bio` est livré dans le back-office (vide — aucune donnée existante, vérifié en base : 0 description de terme non vide). L'afficher sur le site ? | Démo du 15/07 (acter par écrit) | **Champ livré, affichage front hors périmètre** de cette phase — micro-évolution post-recette si l'équipe le remplit ; à défaut, les biographies continuent de vivre dans la présentation des fiches |
# DevOps — stack cible, comptes, CI/CD, secrets

> **But.** Décrire la **stack d'exploitation finale** du site unifié (dépôt, intégration
> continue, hébergement, environnements, secrets, surveillance), l'écart avec l'état
> réel, et les **runbooks** de bascule. Document interne, non destiné au client.
>
> Complète — sans les remplacer — `LEGACY-STACK.md` (inventaire de l'existant OVH/WP),
> `COHABITATION.md` (plan de migration côté WordPress) et `plan/`
> (phases produit, entrée : `plan/README.md`).
>
> **Relevé effectué le 2026-07-09.** Voir §2 pour tout re-vérifier.
>
> ⚠️ Aucun secret ici. Jamais de valeur de token — uniquement des **noms** de variables.

---

## 0. TL;DR

- Le dépôt vit sous le **compte personnel du prestataire** (`yourimerad`), l'app sous
  une **team Vercel provisoire** (`solidz`). Le devis engage l'inverse : *« tout est
  créé au nom de la structure du client »*. La stack finale est donc d'abord un
  **transfert de propriété**, pas une réécriture.
- **Aucune CI n'existe** : 4 PR ont été fusionnées sans qu'aucune vérification
  automatique ne tourne. Corrigé par `.github/workflows/ci.yml` (ce commit).
- **Vercel *est* relié à Git** — contrairement à ce qu'affirmait `COHABITATION.md`.
  `vercel[bot]` déploie `main` en **Production** et chaque branche en **Preview** depuis
  le 2026-07-02. Le build est donc déjà vérifié avant merge ; ce qui manque n'est pas la
  liaison, c'est la **propriété** (le projet vit sur la team provisoire `solidz`).
- Trois secrets sont posés dans `site/.env`. **Un seul est exploitable en l'état** :

  | Variable | État vérifié (2026-07-09) | Conséquence |
  |---|---|---|
  | `GITHUB_PAT` | Valide → compte **`editionssociales`**. Renvoie **404** sur `yourimerad/editions-sociales-la-dispute`. | C'est le compte **cible** (client), pas celui qui héberge le code aujourd'hui. Ne peut rien faire tant que le dépôt n'est pas transféré. |
  | `VERCEL_TOKEN` | Présent, **non vérifié**. | Compte/team propriétaire inconnu — à confirmer avant tout usage (§6.2). |
  | `STRIPE_SECRET_KEY` | **Littéralement `NOT_SET`** (l'API Stripe répond `Invalid API Key provided: NOT_SET`). | 🔴 **Les dons — la pièce critique du 15 août — ne peuvent être ni construits ni testés.** |

---

## 1. État vérifié (2026-07-09)

### 1.1 Dépôt

| Champ | Valeur |
|---|---|
| Remote `origin` | `https://github.com/yourimerad/editions-sociales-la-dispute.git` |
| Propriétaire | **`yourimerad`** (compte personnel du prestataire) |
| Visibilité | **privé** |
| Branche par défaut | `main` |
| Historique | 39 commits |
| Flux | PR → merge (4 PR : #1 draft, #2/#3/#4 fusionnées) |
| Protection de branche | **aucune** (à confirmer §6.4) |
| CI | **aucune** — `.github/` n'existait pas |
| Auth locale | `gh` + trousseau macOS, compte `yourimerad` (scopes `repo`, `workflow`, `read:org`, `gist`) |

Branches distantes résiduelles à nettoyer : `feat/catalogue-couverture-seule`,
`worktree-claude-md-index-update`, `worktree-site-build`, `worktree-souscription-copy`.

### 1.2 Hébergement

| Champ | Valeur |
|---|---|
| Plateforme | **Vercel** (imposé : OVH mutualisé ne peut pas exécuter Node — cf. `LEGACY-STACK.md` §0) |
| Projet | `editions-sociales-la-dispute` (`prj_A5GU0DpjwpzJEK4nbhTFmK4ToBP5`) |
| Team | **LDES** (`team_1xHVCSjDQnrhRVC139r0pODZ`, compte client `administrer-7372`) — accès API via `VERCEL_PAT` de `site/.env` |
| URL beta | `https://editions-sociales-la-dispute-mu.vercel.app` |
| Intégration Git | **active** (`vercel[bot]`) : `main` → Production, branche → Preview |
| Variables d'env prod | posées à la main (non auditables depuis le dépôt) |

> ⚠️ (vérifié 2026-07-19) Un **projet fantôme homonyme** subsiste dans le scope
> Vercel perso du prestataire (`prj_Mi6jIFHz…`, celui de `.vercel/project.json`) :
> toujours git-lié au dépôt, il double chaque build de `main` (en échec depuis la
> coupure OVH — il n'a que les vars `WP_*`) et squatte le domaine nu
> `editions-sociales-la-dispute.vercel.app`, figé sur un build du 2026-07-11.
> À délier/supprimer (geste humain). Tout diagnostic mené avec `$VERCEL_TOKEN`
> (scopes perso/solidz) tombe sur ce fantôme, pas sur le vrai projet.

### 1.3 Base de référence (vérifiée sur `main`, commit `012fe02`)

```
pnpm typecheck   ✓
pnpm lint        ✓
pnpm test        ✓  55 tests / 4 fichiers
pnpm build       ✓  308 pages (295 fiches livre), 30 s
```

La stack est **saine** : ce document ne corrige pas du code cassé, il pose l'outillage
qui manquait autour.

---

## 2. Ré-vérification

```bash
cd site

# Dépôt
gh repo view yourimerad/editions-sociales-la-dispute --json visibility,defaultBranchRef
gh pr list --state all --limit 10
gh api repos/yourimerad/editions-sociales-la-dispute/branches/main/protection  # 404 = non protégée

# Identité du PAT posé dans .env (n'affiche jamais la valeur)
set -a; . ./.env; set +a
curl -s -H "Authorization: Bearer $GITHUB_PAT" https://api.github.com/user | python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])'

# Vercel — projet lié localement
python3 -c 'import json;d=json.load(open(".vercel/project.json"));print(d["projectName"])'
vercel projects ls --token "$VERCEL_TOKEN"      # à faire une seule fois, cf. §6.2

# Base de référence
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test
```

Inventaire OVH / WordPress : voir `LEGACY-STACK.md` §1 (API OVH, compte ES).

---

## 3. La stack cible, couche par couche

Le devis (option B, §6 « propriété des comptes ») engage : *chaque abonnement est
souscrit **au nom de la structure du client**, payé par lui, et le prestataire
intervient comme invité — jamais l'inverse.* La colonne **Propriétaire** est donc un
engagement contractuel, pas une préférence.

| Couche | Aujourd'hui | Cible | Propriétaire cible | Statut |
|---|---|---|---|---|
| Code source | GitHub `yourimerad` (privé) | GitHub **`editionssociales`** (privé) | Client | 🟠 à transférer |
| Intégration continue | néant | GitHub Actions (typecheck/lint/test) | Client | 🟢 posée (ce commit) |
| Build / preview | Vercel relié à Git : PR → preview, `main` → prod | identique, sur le compte client | Client | 🟢 fonctionne · suit le transfert (§6.2) |
| Hébergement app | Vercel team `solidz` | Vercel, compte client (Pro ~20 €/mois) | Client | 🟠 à transférer |
| Secrets / env | `.env.local` sur le portable | Vercel env (Production / Preview / Development) | Client | 🔴 à poser |
| Base de données | néant (lit WordPress) | **PostgreSQL** managé, sauvegarde nocturne | Client | ⚪ phase 3 |
| Back-office | 4 × `wp-admin` | back-office sur-mesure, rôles | Client | ⚪ phase 3 |
| Paiement | WooCommerce + plugin Stripe | **Stripe natif** (ou HelloAsso pour les dons) | Client | 🔴 clé absente |
| Médias (couvertures ~1 Go) | OVH `wp-content` | stockage objet + CDN | Client | ⚪ phase 3 |
| E-mail transactionnel | plugins WP | service dédié, SPF/DKIM | Client | ⚪ phase 5 |
| Newsletter | plugins WP | **Brevo** (2 848 abonnés à importer) | Client | ⚪ phase 5 |
| Erreurs / uptime / stats | néant | remontée d'erreurs + sonde uptime + analytics sans cookie | Client | ⚪ phase 6 |
| Domaines + Email Pro | OVH | **OVH, inchangé** | Client | 🟢 rien à faire |

Légende : 🟢 fait · 🟠 en attente d'accord · 🔴 bloqué · ⚪ phase produit ultérieure.

**Ce qui ne bouge pas.** Les 6 domaines OVH et l'Email Pro restent chez OVH et hors du
périmètre technique. Toute bascule DNS se fait **enregistrement par enregistrement**,
sans jamais toucher les MX (cf. `COHABITATION.md` phase 3).

---

## 4. Contrat d'environnement

Le code ne lit que **quatre** variables (vérifié : `grep -r process.env src/`).
Tout le reste de `.env` sert à l'outillage, jamais à l'application.

### 4.1 Variables lues par l'application (aujourd'hui)

| Variable | Repli codé en dur (mort en pratique, cf. ci-dessous) | Lue par |
|---|---|---|
| `WP_ES_URL` | `https://editionssociales.fr` | `src/lib/catalogue-http.ts` |
| `WP_LD_URL` | `https://ladispute.fr` | `src/lib/catalogue-http.ts` |
| `WC_STORE_URL` | `https://boutique.editionssociales.fr` | `src/lib/boutique.ts` |
| `WP_REVALIDATE` | `3600` | `catalogue-http.ts`, `boutique.ts` |

✅ **`WP_ES_URL`/`WP_LD_URL`/`WC_STORE_URL` sont désormais REQUISES — erreur au
démarrage si absentes** (`src/lib/env.ts:envSchema`, via `assertEnv()` que
`instrumentation.ts:register()` appelle avant que le serveur Next n'accepte la
moindre requête, dev comme prod). Avant ce lot, un environnement mal configuré
ne plantait pas : il tapait silencieusement le WordPress de prod — acceptable
tant que le site ne fait que *lire*, plus dès qu'il y a une base de données et
un paiement (dons). Les replis `|| "https://…"` visibles dans
`catalogue-http.ts`/`boutique.ts` restent dans le code (ceinture
supplémentaire, jamais atteinte tant qu'`assertEnv` a tourné sans jeter) mais
ne sont plus le comportement attendu.

🔴 **Vérification pré-merge/pré-déploiement obligatoire.** Ce fail-fast tourne
à **chaque cold start**, Preview comme Production (`register()` — pas
seulement au build) : si `WP_ES_URL`/`WP_LD_URL`/`WC_STORE_URL` ne sont pas
déjà posées côté Vercel pour un environnement donné, **chaque requête** vers
une fonction serverless de cet environnement plante au démarrage — pas
seulement un build cassé, un environnement entier down. Avant de merger ce
lot (ou tout PR qui en dépend) et avant tout déploiement Preview/Production,
confirmer que les trois variables sont posées sur les **trois** scopes
(Production, Preview, Development) — commandes `vercel env add` en §6.3 — et
vérifier qu'une PR de test produit bien une preview fonctionnelle après
merge. Ce geste est **humain/infra**, hors du périmètre de ce commit.

⚠️ **Angle mort résiduel.** `assertEnv()` tourne au *boot du serveur*
(`register()` — « appelé une fois quand une nouvelle instance serveur Next
démarre », doc Next), **pas** pendant `next build` (la génération statique /
`generateStaticParams`, qui interroge WordPress, s'exécute hors de ce hook).
Un build lancé avec ces variables réellement absentes de tout l'environnement
retomberait donc encore, silencieusement, sur les URL de prod. En pratique ce
risque résiduel est couvert autrement : `.env.example` fournit déjà les trois
URL (Next charge `.env*` à toutes les phases, y compris le build) et §6.3
exige de les poser explicitement dans Vercel (Production/Preview/Development)
avant tout build réel. Fermer cet angle mort pour de bon supposerait de faire
échouer la construction même de `SITES`/`WC` (`catalogue-http.ts`/
`boutique.ts`) — non fait ici : ces modules sont importés inconditionnellement
par `catalogue.ts` (l'aiguillage `CATALOGUE_SOURCE=pg` ne fait que ne pas
*appeler* `httpCatalogueSource()`, il n'empêche pas son import), donc les y
faire jeter romprait le découplage entre les deux adaptateurs même quand `pg`
n'a besoin d'aucune des trois URL.

### 4.2 Variables d'outillage (jamais lues par `src/`)

`GITHUB_PAT`, `VERCEL_TOKEN`, `STRIPE_SECRET_KEY` vivent dans `site/.env`, **hors Git**
(`.gitignore` : `.env*` sauf `.env.example`). Elles ne doivent **jamais** être ajoutées
aux variables d'environnement Vercel : un PAT GitHub exposé au runtime du site est une
escalade de privilèges gratuite.

### 4.3 Cible — où vit chaque secret

| Secret | Emplacement cible | Environnements |
|---|---|---|
| `WP_*` / `WC_STORE_URL` | Vercel env | Production, Preview, Development |
| `DATABASE_URL` | Vercel env + fournisseur PostgreSQL | les 3, **bases distinctes** |
| `STRIPE_SECRET_KEY` | Vercel env | `sk_live_…` en Production, `sk_test_…` en Preview/Development |
| `STRIPE_WEBHOOK_SECRET` | Vercel env | idem, un endpoint webhook par environnement |
| `GITHUB_PAT`, `VERCEL_TOKEN` | poste du dev / secrets GitHub Actions | **jamais** dans Vercel |

Règle : **aucune clé `live` en Preview.** Une PR ne doit pas pouvoir encaisser un don.

---

## 5. Pipeline CI/CD

```
  PR ouverte
    ├── GitHub Actions « verify »  → typecheck · lint · test        (~1 min, hermétique)
    └── Vercel Preview Deployment  → pnpm build + URL de preview    (~1 min, réseau)
         ↓ les deux verts + revue
       merge sur main
         ↓
       Vercel Production Deployment
```

Ce pipeline est **vérifié**, pas souhaité : la PR #5 a fait tourner les deux branches
(Actions vert en 32 s, preview Vercel verte), et l'historique des déploiements GitHub
montre `vercel[bot]` promouvant chaque `main` en Production depuis le 2026-07-02.

### Pourquoi le `build` n'est pas dans GitHub Actions

`generateStaticParams` pré-rend 295 fiches, et `catalogue-http.getBook()` fait **une
requête REST par slug** : un build à froid envoie **~300 requêtes PHP** à
l'hébergement OVH **mutualisé** — celui-là même qui sert le trafic public des trois
WordPress. Lancer le build deux fois par PR (Actions + Vercel) ferait payer au client
la charge de notre CI. Le build est donc vérifié **une seule fois**, par le
déploiement preview Vercel.

Cette contrainte disparaît à la **phase 3** (catalogue en PostgreSQL) : le build
redevient hermétique et le job `build` peut rejoindre `ci.yml`.

**Corollaire mesuré sur cette PR** : chaque commit poussé, *y compris un commit qui ne
touche que des `.md`*, déclenche un build preview complet — donc ~300 requêtes vers
l'OVH du client. Les deux commits de la PR #5 en ont déclenché deux. Correctif à un
coup : un *Ignored Build Step* Vercel (ou `vercel.json` → `ignoreCommand`) qui saute le
build quand le diff ne touche ni `src/`, ni `public/`, ni les fichiers de conf.
**Non appliqué ici** : cela modifie le comportement de déploiement d'un projet en
production — à valider avant, pas à glisser dans une PR d'outillage.

### 🟠 Risque mitigé (court terme) : le catalogue tronqué en silence

`listBooks()` délègue sa pagination à `fetchAllPages()` (`src/lib/fetch-all-pages.ts`),
qui avale ses erreurs (`catch { …; break }`) et renvoie une **liste partielle**. Si
WordPress limite le débit ou renvoie un 5xx à la page 2 pendant un build, alors :

1. sans garde-fou, le build **réussirait**, avec un catalogue amputé ;
2. l'ISR mettrait ce résultat en cache **une heure** ;
3. `getBook()` renvoie `null` sur les slugs manquants → une fiche livre réelle serait
   **pré-rendue en 404**.

Aucune alerte ne se déclencherait. Mitigations, par ordre de coût croissant :

- **court terme — posé** : `src/lib/catalogue-integrity.ts:assertCatalogueComplete()`
  fait échouer le total des deux fonds (`es.length + ld.length`) s'il s'écarte de plus
  de 5 % du dernier chiffre connu (`KNOWN_CATALOGUE_SIZE = 295`, constante à ajuster au
  fil des parutions). Câblé dans `catalogue.ts:getAllBooks()` — seul point qui combine
  les deux fonds avant fusion/cache — l'échec y frappe indifféremment le build
  (`generateStaticParams`, rien à perdre) et la revalidation ISR/Data Cache d'une page
  déjà servie (régénération en arrière-plan écartée, Next conserve le rendu/le cache
  précédent — le comportement voulu, jamais une page déjà en service qui tombe).
  Reste à faire (phase 6) : remonter ces erreurs (Sentry) pour voir aussi les
  `console.error` de production, pas seulement les échecs de build.
- **définitif** — phase 3 : la source devient PostgreSQL, une transaction remplace 300
  requêtes HTTP, et une lecture partielle n'est plus représentable — ce garde-fou
  redevient alors inutile et peut être retiré.

---

## 6. Runbooks de bascule

> ⚠️ Les quatre runbooks ci-dessous agissent sur des **comptes tiers** (client) et sont
> **irréversibles ou visibles publiquement**. Aucun n'a été exécuté. Ils attendent un
> accord explicite, et l'ordre compte : **6.1 → 6.2 → 6.3 → 6.4**.

### 6.1 Transférer le dépôt vers le compte client

Prérequis : savoir si `editionssociales` est un **compte utilisateur** ou une
**organisation** (change la commande et la facturation des Actions).

Le transfert GitHub **préserve l'historique, les PR et les issues**, et laisse une
redirection depuis l'ancienne URL. C'est préférable à un miroir (`git push` vers un
dépôt neuf), qui perdrait les 4 PR.

```bash
# Depuis le compte propriétaire actuel (yourimerad)
gh api -X POST repos/yourimerad/editions-sociales-la-dispute/transfer \
  -f new_owner='editionssociales'

# Puis, sur le poste du dev
git remote set-url origin https://github.com/editionssociales/editions-sociales-la-dispute.git
git remote -v
```

Ensuite : réinviter `yourimerad` en **collaborateur** (le devis dit « j'interviens comme
invité sur vos comptes »), et vérifier que le `GITHUB_PAT` (fine-grained) porte bien les
droits `Contents: write`, `Pull requests: write`, `Administration: write` sur le dépôt.

Nettoyage à faire après transfert :

```bash
git push origin --delete feat/catalogue-couverture-seule \
  worktree-claude-md-index-update worktree-site-build worktree-souscription-copy
```

### 6.2 Transférer le projet Vercel

La liaison Git **existe déjà et fonctionne** (§1.2) : il n'y a rien à « brancher ».
Ce runbook déplace la **propriété**, pas la plomberie.

**D'abord identifier le propriétaire du `VERCEL_TOKEN`** — tant que ce n'est pas fait,
ne rien exécuter :

```bash
set -a; . ./.env; set +a
vercel whoami --token "$VERCEL_TOKEN"
vercel teams ls --token "$VERCEL_TOKEN"
```

- S'il appartient à `solidz` → il sert au **transfert**, pas à la cible.
- S'il appartient à un compte client → c'est la destination.

Le projet se transfère **sans perte d'historique de déploiement**
(*Project Settings → Advanced → Transfer*). Puis, sur le poste du dev :

```bash
vercel link                                    # re-lier le dossier au projet transféré
```

> ⚠️ **Piège d'ordonnancement.** Le transfert du dépôt GitHub (§6.1) **casse** la
> liaison Vercel↔Git : l'app GitHub « Vercel » est autorisée sur `yourimerad`, pas sur
> `editionssociales`. Tant qu'elle n'est pas réinstallée sur le nouveau propriétaire,
> **les previews et les déploiements de production cessent silencieusement** — aucun
> message d'erreur, simplement plus de `vercel[bot]`.
>
> Ordre sûr : transférer le dépôt → réinstaller/autoriser l'app Vercel sur le compte
> client → transférer le projet Vercel → **vérifier qu'une PR de test produit bien une
> preview** avant de considérer la bascule faite.

### 6.3 Poser les variables d'environnement

```bash
for env in production preview development; do
  vercel env add WP_ES_URL     "$env"
  vercel env add WP_LD_URL     "$env"
  vercel env add WC_STORE_URL  "$env"
  vercel env add WP_REVALIDATE "$env"
done
vercel env pull .env.local     # resynchronise le poste du dev depuis la source de vérité
```

Après la **phase 2** de `COHABITATION.md` (découplage CMS), `WP_ES_URL` et `WP_LD_URL`
devront pointer sur les hostnames **non publics** des WordPress, sans quoi la bascule
DNS coupera la source de données du site.

### 6.4 Protéger `main`

```bash
gh api -X PUT repos/editionssociales/editions-sociales-la-dispute/branches/main/protection \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=typecheck · lint · test' \
  -F 'required_status_checks[contexts][]=Vercel' \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F enforce_admins=false \
  -F restrictions=null
```

Équipe non technique, un seul développeur : exiger une **revue** bloquerait tout. On
exige donc les **checks verts**, pas un approbateur.

---

## 7. Ce qui bloque, et qui peut le débloquer

| # | Blocage | Effet | Débloqué par |
|---|---|---|---|
| 1 | `STRIPE_SECRET_KEY` = `NOT_SET` | 🔴 **Les dons ne sont pas implémentables.** C'est la seule échéance dure du projet (**~15 août**). | Le client crée son compte Stripe → fournir une clé **`sk_test_…`** (le mode test suffit pour tout développer). |
| 2 | Statut juridique de la structure fusionnée | Décide **Stripe vs HelloAsso** pour les dons — deux implémentations différentes, même prix au devis. | Confirmer si la structure est une **association loi 1901** (HelloAsso : 0 % de commission + reçus fiscaux automatiques). |
| 3 | Propriétaire du `VERCEL_TOKEN` inconnu | Impossible de savoir si on transfère *vers* ce compte ou *depuis*. | `vercel whoami` (§6.2). |
| 4 | `editionssociales` : compte ou organisation ? | Change la commande de transfert et la facturation Actions. | Accord + vérification. |
| 5 | Dépendance à la **Legacy REST API** de WooCommerce | Interdit d'éteindre la boutique tant qu'on ignore ce qui l'appelle (export compta suspecté). | Tracer les appels avant la phase 4 (`LEGACY-STACK.md` §11). |

**Le chemin critique passe par le blocage n°1.** Tout le reste du plan peut avancer
sans lui ; les dons, non.

---

## 8. Références

- `plan/` — les phases produit, séquencées contre l'échéance du 15 août (entrée : `plan/README.md`).
- `IMPLEMENTATION-PROMPT.md` — le cadrage haut niveau dont ce plan est la mise en œuvre.
- `LEGACY-STACK.md` — inventaire vérifié OVH + 4 WordPress (source de vérité).
- `COHABITATION.md` — les 4 phases de migration côté WordPress.
- `../devis/DEVIS-MULTI-OPTIONS.md` — cadrage commercial (option B retenue).

<!-- Maintenir à jour à chaque bascule de compte ou changement de pipeline. -->

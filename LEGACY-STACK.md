# État des lieux de l'existant — hébergement OVH & WordPress

> **But de ce document.** Référence interne (non destinée au client) pour les
> agents IA et développeurs qui reprendront ce projet. Il consigne l'inventaire
> **vérifié** de l'infrastructure héritée (compte OVH, hébergement, bases,
> installations WordPress, extensions, contrat de données) afin de **ne pas avoir
> à refaire cette reconnaissance**. C'est la **source de vérité pour établir les
> devis** et concevoir des **propositions hybrides** (§10).
>
> **Relevé effectué le 2026-07-03** via l'API OVH (compte ES) et les miroirs
> locaux des sites. Voir §1 pour tout re-vérifier. Les miroirs sont des
> **instantanés** (peut-être pris à des dates différentes) ; les faits
> *structurels* restent valides même si une version a bougé depuis.
>
> ⚠️ Aucun secret ici (mots de passe DB, salts WP, clés OVH). Ne jamais en ajouter.

---

## 0. TL;DR

- **Le compte OVH ES ne contient AUCUN vrai serveur** : pas de VPS, pas de
  dédié, pas de Public Cloud, pas de base de données managée. Uniquement **2
  hébergements « web » mutualisés** (PHP/MySQL). → **Le nouveau site (Next.js,
  Node + build) ne peut techniquement pas tourner sur OVH.** Il est sur Vercel
  *par obligation*, pas par choix.
- **4 installations WordPress** empilées, dont **3 alimentent le nouveau site**
  (ES, La Dispute, Boutique) + **BioMarx** (site GEME séparé).
- **5 bases MySQL** « incluses » (2 Go chacune, phpMyAdmin), les 3 fonds utiles
  sur **3 serveurs physiques différents** → la fusion ne peut pas être une
  requête SQL, elle est faite dans le site à la lecture.
- **Modèle de données dans le thème** : le CPT `catalogue` + taxonomies sont
  déclarés dans `cenote_child/functions.php` (dupliqué sur 2 sites). Champs ACF
  **en base uniquement** (pas de `acf-json`), versions ACF divergentes.
- **Versions WordPress désynchronisées** : ES 6.3 · La Dispute 6.9.4 · BioMarx
  6.4.8 · Boutique 7.0.
- **33 extensions** (27 distinctes). Boutique = 19, dont une **dette de
  sécurité** (Legacy REST API réactivée). ⚠️ La passerelle de paiement **réellement
  active est Paybox** (0 commande Stripe depuis 2018 — l'extension Stripe est
  installée mais `enabled=no`, compte test ; corrigé 2026-07-11, cf. §8).
- **Ce qui reste quoi qu'il arrive** : les **domaines OVH** et l'**Email Pro**.

| Site | Rôle | Base | Serveur SQL | Préfixe | WP | PHP (host) | Thème | Ext. |
|---|---|---|---|---|---|---|---|---|
| `www` | Catalogue **ES** | editionskes | mysql391.eu001 | `es_` | **6.3** | 8.4 | cenote_child | 5 |
| `LaDispute` | Catalogue **La Dispute** | editionsk712 | mysql508.eu001 | `es_` | **6.9.4** | ?* | cenote_child | 7 |
| `BioMarx` | **GEME** (gememarxengels.org) | editionsk896 | mysql319.eu001 | `mod132_` | **6.4.8** | ?* | mesmerize | 2 |
| `Boutique` | **WooCommerce** | editionsk884 | mysql082.eu012 | `mod973_` | **7.0** | ?* | storefront | 19 |

\* PHP confirmé **uniquement pour le dossier `www`** (**8.4**). OVH autorise un PHP
**par dossier** (`.ovhconfig`) : le PHP actif de `LaDispute`/`BioMarx`/`Boutique`
n'a **pas** été relevé individuellement (les 7.0/7.2.24/7.4 des `wp-config` sont le
*minimum requis par WordPress*, pas le PHP en service). Le slot **vide**
`la-dispute.fr` (Performance 1) est resté en **PHP 7.3 (fin de vie)**. À vérifier
par dossier via `.../ovhConfig` si besoin pour un devis.

---

## 1. Méthode & ré-vérification

### 1.1 API OVH (compte ES)

Identifiants dans l'environnement (noms seulement — **jamais** les valeurs) :
`OVH_ES_APP_KEY`, `OVH_ES_APP_SECRET`, `OVH_ES_CONSUMER_KEY`, `OVH_ES_ENDPOINT`
(+ `OVH_ES_CLIENT_ID`/`OVH_ES_CLIENT_SECRET` pour la voie OAuth2). Sélecteur de
compte : fonction shell `ovh-use es` (met les `OVH_*` génériques depuis les
`OVH_ES_*`). Le client est **ES** (les 3 sites sont sur ce compte).

Helper signé : `~/.config/claude/ovh_api.py` — usage :
`ovh_api.py <METHOD> </path> [json-body]`. En une seule commande (l'état shell ne
persiste pas entre appels) :

```bash
H=~/.config/claude/ovh_api.py
export OVH_ENDPOINT="${OVH_ES_ENDPOINT:-ovh-eu}"
export OVH_APP_KEY="$OVH_ES_APP_KEY" OVH_APP_SECRET="$OVH_ES_APP_SECRET" OVH_CONSUMER_KEY="$OVH_ES_CONSUMER_KEY"
unset OVH_ACCESS_TOKEN
python3 "$H" GET /hosting/web                                   # liste des hébergements
python3 "$H" GET /hosting/web/editionssociales.fr              # offre, cluster, quota, PHP courant
python3 "$H" GET /hosting/web/editionssociales.fr/database     # bases incluses
python3 "$H" GET /hosting/web/editionssociales.fr/database/editionskes.mysql.db
python3 "$H" GET /vps ; python3 "$H" GET /dedicated/server ; python3 "$H" GET /cloud/project
python3 "$H" GET /hosting/privateDatabase ; python3 "$H" GET /domain ; python3 "$H" GET /email/pro
```

### 1.2 Miroirs locaux des WordPress

Copies des installs (hors de ce repo) :
`/Users/yourihamon/marina_es/editionssociales.fr/{www,LaDispute,BioMarx,Boutique}`
et le slot vide `/Users/yourihamon/marina_es/ladispi`.

```bash
base=/Users/yourihamon/marina_es/editionssociales.fr
grep -oE "wp_version = '[0-9.]+'" "$base/www/wp-includes/version.php"     # version WP
grep -E "table_prefix|'WP_DEBUG'|'DB_NAME'|'DB_HOST'" "$base/www/wp-config.php"  # (masquer les secrets !)
ls "$base/Boutique/wp-content/plugins"                                    # extensions
```

### 1.3 Données réelles

Les dumps SQL des bases sont chargés dans une **MariaDB locale (port 3307)** ;
dumps sous `/Users/yourihamon/marina_es/_databases` et `.localdb` (cf `README.md`).
Utile pour inspecter le contenu réel (nb de livres, structure `postmeta`, etc.).

---

## 2. Compte OVH (ES) — inventaire

Réponses API (2026-07-03) :

| Ressource | Endpoint | Résultat |
|---|---|---|
| VPS | `/vps` | `[]` — **aucun** |
| Serveurs dédiés | `/dedicated/server` | `[]` — **aucun** |
| Public Cloud | `/cloud/project` | `[]` — **aucun** |
| Bases managées | `/hosting/privateDatabase` | `[]` — **aucune** |
| Hébergements web | `/hosting/web` | `editionssociales.fr`, `ladispi.cluster028.hosting.ovh.net` |
| Domaines | `/domain` | editions-sociales.com, editions-sociales.fr, editionssociales.fr, gememarxengels.org, la-dispute.fr, ladispute.fr |
| Email | `/email/pro` | `emailpro-lr23975-2` (+ `/email/domain` sur les 6 domaines) |

**Conclusion** : toute la capacité de calcul du compte = **hébergement web
mutualisé PHP/MySQL**. Aucune brique ne peut exécuter un runtime Node ni un build.
Les **domaines** et l'**Email Pro** sont à **conserver** dans toute proposition.

---

## 3. Hébergement — les 2 slots

| Champ | `editionssociales.fr` | `ladispi.cluster028.hosting.ovh.net` |
|---|---|---|
| Offre | **hosting-pro** (Pro) | **hosting-performance-1** (Performance 1) |
| resourceType | `shared` (mutualisé) | `dedicated` (ressources dédiées, plateforme partagée) |
| Cluster / DC | cluster106 / eu-west-gra (Gravelines) | cluster128 / eu-west-gra |
| PHP courant | **8.4** (`stable64`, path `www`) | **7.3** (`stable`) — *fin de vie* |
| Quota disque | 2,7 Go utilisés / 250 Go | **0 Mo** / 500 Go (vide) |
| CDN | non | oui |
| Boost possible | **`[]` — non extensible en l'état** | hosting-agency / -plus / -max |
| Créé / expire | 2010-12-18 / **2026-12-01** | 2020 |
| Domaines rattachés | editionssociales.fr, www, **boutique.**, **www.boutique.**, dev., www.dev., **gememarxengels.org**, www.gememarxengels.org, **ladispute.fr**, www.ladispute.fr | ladispi…, **la-dispute.fr**, www.la-dispute.fr |

**Points clés :**
- Le slot **Pro** (partagé) porte à lui seul **ES + Boutique + GEME + ancien
  ladispute.fr + un dev** et **n'est pas extensible** (`availableBoostOffer: []`).
  Le disque n'est pas la contrainte (2,7 Go/250 Go) : c'est la **concurrence CPU/
  workers PHP** du mutualisé qui sature sous charge.
- PHP réglé **par hébergement** : les 4 installs du slot Pro tournent en 8.4 ; le
  slot `la-dispute.fr` (vide) est resté en **7.3 EOL** — dérive de config d'un
  emplacement à moitié provisionné (à clarifier, §11).
- OVH « Web Hosting » = exécution de **PHP** + service de fichiers. **Pas** de
  Node, **pas** d'étape de build, **pas** de processus long. → nouveau site
  impossible ici.

---

## 4. Bases de données (5)

Toutes **incluses** dans le slot `editionssociales.fr`
(`/hosting/web/editionssociales.fr/database`). MySQL **8.0**, quota **2048 Mo**
chacune, admin via **phpMyAdmin** (`phpmyadmin-gra.hosting.ovh.net`), 32 dumps
auto. **Aucune base managée / serveur dédié.**

| Base | Rôle | Serveur | Utilisé | Install WP |
|---|---|---|---|---|
| `editionskes` | Catalogue **ES** | mysql391.eu001 | 8,2 Mo | www |
| `editionsk712` | Catalogue **La Dispute** | mysql508.eu001 | 8,5 Mo | LaDispute |
| `editionsk884` | **Boutique** WooCommerce | mysql082.eu012 | 95,3 Mo | Boutique |
| `editionsk896` | **GEME** (BioMarx) | mysql319.eu001 | 4,3 Mo | BioMarx |
| `1413613-1` | ancien « module » 1-clic (`mode: module`, `sqlpersoId: null`) — abandonné ? | mysql059.eu012 | 3,4 Mo | ? (§11) |

**Point dur** : `editionskes`, `editionsk712`, `editionsk884` sont sur **3
serveurs MySQL différents** → **impossible de faire un JOIN** entre les fonds. La
fusion ES+La Dispute+boutique est donc faite **dans l'application, à la lecture**
(cf `src/lib/catalogue-core.ts`), pas en base. Ce n'est pas un choix de design,
c'est imposé par l'infra.

---

## 5. Installations WordPress (4)

Chemin miroir : `…/editionssociales.fr/<install>`. `WP_DEBUG=false` partout.
**`wp-content/mu-plugins` vide dans les 4 miroirs** (cf §6 pour le mu-plugin
headless attendu en prod).

### 5.1 `www` — Éditions sociales (catalogue)
- DB `editionskes` @ `editionskes.mysql.db` · préfixe `es_` · WP **6.3** (PHP min 7.0)
- Thèmes présents : `cenote`, `cenote_child` (**actif : cenote_child**)
- **Contient le contrat de données** (CPT `catalogue` + taxonomies, cf §6).
- Extensions (5) : `admin-bar-disabler` 1.4.2 · `admin-menu-editor` 1.11.1 ·
  `advanced-custom-fields` **6.2.0** · `classic-editor` 1.6.3 · `duplicator` 1.5.5.1

### 5.2 `LaDispute` — La Dispute (catalogue)
- DB `editionsk712` @ `editionsk712.mysql.db` · préfixe `es_` · WP **6.9.4** (PHP min 7.2.24)
- Thèmes : `cenote`, `cenote_child` (**actif : cenote_child**) + nombreux thèmes
  par défaut inutilisés (`twentynineteen`…`twentytwentyfive`, `go`) → encombrement.
- **Même contrat de données** que `www` (functions.php dupliqué).
- Extensions (7) : `admin-bar-disabler` 1.4.2 · `admin-menu-editor` **1.14.1** ·
  `advanced-custom-fields` **6.8.5** · `classic-editor` 1.6.7 · `duplicator`
  1.5.16.1 · `everest-forms` 3.5.1 · `popup-builder` 4.4.0
- ⚠️ **Versions divergentes vs `www`** : ACF 6.8.5≠6.2.0, admin-menu-editor
  1.14.1≠1.11.1, classic-editor 1.6.7≠1.6.3, duplicator 1.5.16.1≠1.5.5.1 → aucune
  maintenance coordonnée.

### 5.3 `BioMarx` — GEME / gememarxengels.org (site séparé)
- DB `editionsk896` @ `editionsk896.mysql.db:3306` · préfixe `mod132_` · WP **6.4.8** (PHP min 7.0)
- Thèmes : `mesmerize` (+ `highlight`, défauts) — **pile totalement différente**
  (thème page-builder freemium). N'alimente **pas** le catalogue unifié.
- Extensions (2) : `akismet` 5.3.1 · `mesmerize-companion` 1.6.147 (verrou thème↔contenu)
- **À traiter à part** dans les devis : c'est le site GEME, pas le catalogue.

### 5.4 `Boutique` — WooCommerce
- DB `editionsk884` @ `editionsk884.mysql.db:3306` · préfixe `mod973_` · WP **7.0** (PHP min 7.4)
- Thème : `storefront` (thème officiel WooCommerce)
- Extensions (19) : cf §7 (groupe boutique/paiement/dette). WooCommerce **10.9.1**.

---

## 6. Contrat de données du catalogue (⚠️ le plus fragile)

### 6.1 CPT & taxonomies — **définis dans le thème**
Dans `www/wp-content/themes/cenote_child/functions.php` (303 lignes),
**dupliqué** dans `LaDispute/…/cenote_child/functions.php` :
- `register_post_type('catalogue', …)` — L153 (`myplugin_register_catalogue_post_type`, hook `init` L155)
- `create_author_taxonomy` → `register_taxonomy('auteur'…)` — L160/164 (init prio 0)
- `create_collection_taxonomy` → `register_taxonomy('collection'…)` — L187/191
- `create_parution_taxonomy` → `register_taxonomy('parution'…)` — L214/218

**Conséquence** : le type de contenu est un artefact du **thème**. Changer/refaire
le thème **orpheline tout le catalogue**. C'est *plus grave* que « ne pas renommer
un champ » : la structure elle-même dépend de la présentation.

### 6.2 Champs ACF — **en base uniquement**
Pas de `acf-json` dans `www` ni `LaDispute` → les définitions de champs vivent
**dans chaque base** (non versionnées, éditables depuis wp-admin, non
reproductibles). Extension ACF elle-même **divergente** (6.2.0 vs 6.8.5).

Champs du `book` (source : `wp-headless/es-headless-rest.php` + `wp-headless/CLAUDE.md`) :
`isbn`, `prix`, `pages`, `date_parution`, `plus_loin` (HTML), `table` (URL PDF),
`extrait` (URL PDF), `boutique` (lien produit Woo), `parislibrairies`,
`lalibrairie`, `authors[{name,slug}]`, `collection{name,slug}|null` (**premier
terme seulement**), `cover{url,width,height}` (taille `large`) `|null`.

### 6.3 Le pont headless (mu-plugin)
`wp-headless/es-headless-rest.php` (versionné **dans ce repo**) :
- rend `auteur/collection/parution` visibles en REST (`show_in_rest`),
- ajoute un champ REST consolidé `book` sur le CPT `catalogue`,
- repli sur la meta brute si `get_field` (ACF) absent.
- Déployé à la main dans `wp-content/mu-plugins/` de `www` et `LaDispute`.
  **Absent des miroirs** → n'existe (en principe) qu'en prod ; à **redéployer**
  s'il disparaît (point unique de défaillance, cf `COHABITATION.md`).

Le nouveau site lit `/wp-json/wp/v2/catalogue?_fields=id,slug,title,book` (liste)
/ `…,content,book` (fiche). Tout champ requis côté front **doit** vivre dans `book`.

---

## 7. Extensions — inventaire complet (33 installées, 27 distinctes)

Regroupé par fonction, avec le **sort visé dans une refonte** (cf artefacts client).
Sites : **ES**=www · **LD**=LaDispute · **GM**=BioMarx · **Bq**=Boutique.

### Cœur des données — *→ base PostgreSQL + atelier*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| Advanced Custom Fields | **6.2.0 / 6.8.5** (divergent) | ES, LD | Champs du livre. (Le CPT `catalogue`, lui, est dans le thème.) |

### Boutique & commandes — *→ Stripe + commerce léger*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| WooCommerce | 10.9.1 | Bq | Moteur boutique (lourd) |
| WooCommerce Admin | n/d | Bq | Ancien module admin, fusionné au cœur — résidu |
| Woo Discount Rules | n/d | Bq | Remises / promotions |
| WooCommerce Cart Tab | 1.1.2 | Bq | Onglet panier flottant |
| Flexible Shipping | 6.8.0 | Bq | **Frais de port par poids/zone** (besoin réel) |
| Advanced Order Export (woo-order-export-lite) | 4.1.0 | Bq | **Export commandes → compta** (besoin réel) |
| File Upload Types | 1.5.0 | Bq | Types de fichiers autorisés à l'upload |

### Paiement — *→ Stripe natif, Paybox résilié après drainage*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| WooCommerce Stripe Gateway | 10.8.3 | Bq | Extension à jour mais **jamais utilisée en production** (`enabled=no`, compte mode test `acct_1SQlxX…`, 0 commande Stripe depuis 2018 — tentative de config juin 2026) ⚠️ |
| Paybox WooCommerce Gateway | 0.9.9.9 | Bq | **La passerelle de production réelle** (~1 500 commandes/an, 5 606 commandes au total) — pré-1.0, non maintenue ; vérifiée vivante par checkout de test le 2026-07-11 (commande 7730) |

### Dette technique & sécurité — *→ à supprimer*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| **WooCommerce Legacy REST API** | 1.0.5 | Bq | 🔴 Réactive une API **retirée du cœur WC pour raisons de sécurité** — qqch en dépend encore (§11) |
| Jetpack | 15.9.1 | Bq | Suite lourde Automattic (appels externes, grosse surface) |
| PHP Compatibility Checker | 1.6.3 | Bq | Outil de **dev laissé en prod** (préparation migration PHP) |
| Duplicator | 1.5.5.1 / 1.5.16.1 | ES, LD | Sauvegarde/migration manuelle (dossiers `backups-dup-lite` **protégés** par .htaccess, sans archive exposée) |

### Formulaires, pop-ups & newsletter — *→ un seul outil (Brevo) + formulaires natifs*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| Contact Form 7 | 6.1.6 | Bq | Formulaires (outil #1) |
| WPForms Lite | 1.9.8.4 | Bq | Formulaires (outil #2) |
| Everest Forms | 3.5.1 | LD | Formulaires (outil #3) |
| Popup Builder | 4.4.0 / 4.4.4 | LD, Bq | Pop-ups marketing |
| Newsletter — Addons Manager | 1.1.3 | Bq | Extension d'un outil newsletter |

### Admin & édition — *→ inutiles avec un atelier moderne*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| Classic Editor | 1.6.3 / 1.6.7 | ES, LD | Fige l'ancien éditeur (pas Gutenberg) |
| Advanced Editor Tools (ex-TinyMCE Advanced) | 5.9.2 | Bq | Barre d'édition enrichie |
| Admin Menu Editor | 1.11.1 / 1.14.1 | ES, LD | Réorganise le menu admin |
| Admin Bar Disabler | 1.4.2 | ES, LD | Masque la barre d'admin |
| WordPress Importer | 0.9.5 | Bq | Import de contenu (ponctuel, laissé actif) |
| Orthotypo | 1.0.2 | Bq | Orthotypographie FR automatique |

### Anti-spam & thème — *→ natif / disparaît*
| Extension | Version | Où | Rôle |
|---|---|---|---|
| Akismet | 5.3.1 | GM | Anti-spam commentaires |
| Mesmerize Companion | 1.6.147 | GM | Companion du thème Mesmerize (verrou thème↔contenu) |

---

## 8. Paiement & e-commerce (Boutique)

- **WooCommerce 10.9.1** (thème Storefront), sur `boutique.editionssociales.fr`
  (rattaché au slot Pro, DB `editionsk884`, préfixe `mod973_`).
- **Deux passerelles** — ⚠️ correction 2026-07-11 (le relevé initial « Stripe active »
  était faux) : **Paybox** (0.9.9.9) est **la passerelle de production réelle**
  (`_payment_method` : 5 566 `paybox_std` + 40 `paybox_3x` + 97 `cheque`, **zéro
  commande Stripe depuis 2018** ; confirmé par checkout de test le 11/07/2026,
  commande 7730). L'extension **Stripe** (10.8.3) est installée mais `enabled=no`,
  adossée à un compte **mode test** (`acct_1SQlxX…`, webhooks d'essai juin 2026).
  → La migration commerce est une **bascule de PSP** (Paybox→Stripe), pas une
  continuité — à présenter ainsi au client. Elle reste à faible risque : un compte
  Stripe **live et opérationnel** existe depuis juillet 2026
  (`acct_1TqsjgL6ffEZ7VRj` « Éditions sociales », charges/payouts activés, 0 pièce
  due — vérifié par API le 11/07) et sert d'abord aux dons.
- **Legacy REST API** réactivée → dette de sécurité + dépendance à identifier.
- Besoins métier confirmés par les extensions : **frais de port par poids/zone**
  (flexible-shipping), **export commandes pour la compta** (order-export),
  **remises** (discount-rules). À reproduire nativement dans une refonte.
- TVA : livres = **TVA réduite 5,5 %** (à gérer dans toute logique commerce).

---

## 9. Le nouveau site & couplage à l'existant

- App **Next.js 16 / React 19 / TS / Tailwind v4** (ce repo). Modèle `Book`,
  **ports & adaptateurs** (`src/lib`). Voir `CLAUDE.md`, `src/lib/CLAUDE.md`.
- Lecture **REST WP** + **WooCommerce Store API** :
  - `WP_ES_URL` (déf. `https://editionssociales.fr`) → `/wp-json/wp/v2/catalogue`
  - `WP_LD_URL` (déf. `https://ladispute.fr`)
  - `WC_STORE_URL` (déf. `https://boutique.editionssociales.fr`) → `/wp-json/wc/store/v1/products`
  - `WP_REVALIDATE` (déf. `3600`) — fenêtre de cache/ISR.
- Le port `CatalogueSource` (`src/lib/catalogue-source.ts`) a un adaptateur http
  (`catalogue-http.ts`) et un adaptateur mémoire (tests). **C'est le point de
  bascule** : remplacer WordPress-REST par une base propre **ne touche pas le
  front** — clé de toutes les propositions hybrides.
- Déploiement **Vercel** (team `solidz`, provisoire ; transférable). **Pas encore
  de repo Git connecté** → déploiements via `vercel deploy` CLI (cf `COHABITATION.md`).
- Dépend du **mu-plugin** `es-headless-rest.php` en prod (cf §6.3).

---

## 10. Implications pour devis & propositions hybrides ⭐

> Section la plus importante : de quoi cadrer plusieurs devis et proposer des
> chemins intermédiaires entre « rafraîchir la façade » et « tout refaire ».

### 10.1 La stack se décompose en couches migrables **indépendamment**
Grâce aux ports & adaptateurs, chaque couche peut être migrée seule :

| Couche | Aujourd'hui | Cible refonte | Effort relatif | Peut être fait seul ? |
|---|---|---|---|---|
| Hébergement app | Vercel (déjà) | Vercel / Clever Cloud | — | déjà fait |
| Catalogue (ES+LD) | 2 WP + REST + mu-plugin | PostgreSQL + atelier | moyen | **oui** (via le port) |
| Boutique/commerce | WooCommerce | Stripe + commerce léger | **élevé** | oui |
| Paiement | Stripe + Paybox (Woo) | Stripe natif | faible→moyen | oui (déjà Stripe) |
| Admin/CMS | 4× wp-admin | Payload (rôles) | moyen | avec le catalogue |
| Médias | OVH `wp-content` | S3 + CDN | faible | oui, à tout moment |
| E-mails/newsletter | extensions WP | Brevo | faible | oui, à tout moment |
| Surveillance | néant | Sentry + uptime + Plausible | faible | **oui, tout de suite** |
| Campagnes | page en dur | module réutilisable | moyen | oui |
| Événements | page en dur | module agenda/billetterie | faible→moyen | oui |

### 10.2 Menu de propositions hybrides
- **H0 — Gains rapides (quelques jours)** : surveillance + Stripe natif pour les
  dons. Dé-risque une campagne **sans** refonte. À proposer avant tout.
- **H1 — Façade seule (« Chemin A »)** : garder les 4 WP sur OVH + le pont REST ;
  le moins cher, garde toute la dette + 2 infras à vie. (OVH ne pouvant pas
  héberger l'app, le double hébergement est structurel.)
- **H2 — Catalogue d'abord** : migrer **ES+LD** vers PostgreSQL + atelier Payload,
  éteindre `www`+`LaDispute` (+DB `editionskes`/`editionsk712`, thème cenote, le
  CPT-dans-le-thème). **Garder la Boutique WooCommerce** un temps (achat = renvoi
  Woo). Retire 2 des 4 installs et le risque le plus grave. Le front ne bouge pas.
- **H3 — Commerce natif d'abord** : migrer paiement/boutique vers **Stripe +
  commerce léger** (compte Stripe live opérationnel depuis juillet 2026 ; la
  passerelle legacy réelle est Paybox, cf. §8), éteindre `Boutique`+DB
  `editionsk884` ; garder le catalogue sur WP/REST encore un temps. Bon si la
  douleur boutique > douleur catalogue.
- **H4 — Refonte complète (« Chemin B »)** : tout migrer, éteindre les 4 WP +
  l'hébergement web OVH ; PostgreSQL unique, Payload, Stripe, S3, Brevo,
  surveillance. Voir l'artefact « Le socle complet ».
- **Add-ons indépendants** (n'importe quand) : médias→S3, newsletter→Brevo,
  module campagnes, module événements.

**GEME (BioMarx)** est un chantier **séparé** (site marketing sur thème
mesmerize) : à laisser sur WP, à refaire en page Next simple, ou à ignorer selon
le périmètre — ne pas le mélanger au catalogue dans un devis.

### 10.3 Ce qui pèse dans un devis
- **Le plus lourd** : le commerce (panier, stock, TVA 5,5 %, factures,
  expédition, remboursements) et la **migration des données** (catalogue : mapping
  CPT+ACF+taxonomies → schéma ; boutique : produits/commandes/clients — les
  commandes historiques peuvent rester en export plutôt que migrées).
- **Moyen** : atelier + rôles, module campagnes, modèle de données.
- **Faible** (grâce à l'archi existante) : rebranchement du front (le port est
  déjà là), surveillance, médias→S3, e-mails.
- **Déjà acquis / gratuit** : le front, les ports, **Stripe**, les domaines,
  l'Email Pro.
- La **migration du catalogue peut réutiliser la forme `book`** déjà normalisée
  par le mu-plugin (même contrat que le front) → moins de travail de mapping.

### 10.4 Coûts de fonctionnement (rappel)
Stack cible ≈ **40–70 €/mois** typiques (~21 € sobre → ~106 € tout activé) + frais
de transaction (Stripe ≈1,5 %+0,25 € ; HelloAsso 0 %). Détail : artefact « Le
socle complet ». À comparer aux **2 hébergements OVH actuels** pour un socle qui
ne peut même pas faire tourner le nouveau site.

---

## 11. Questions ouvertes / à confirmer

- **Statut associatif** (loi 1901) → éligibilité **HelloAsso** (dons 0 % +
  reçus fiscaux auto). Change le module dons/campagnes.
- **De quoi dépend la Legacy REST API** de la boutique (export compta ? appli ?
  ancien connecteur ?) — à tracer avant de la retirer.
- **`editionsk896`** = bien le site **GEME/BioMarx** ? Et **`1413613-1`** (base
  « module », `sqlpersoId: null`) : contenu / encore utilisée ?
- **Le mu-plugin `es-headless-rest.php` est-il bien en prod** sur `www` et
  `LaDispute` ? (absent des miroirs).
- **Slot `la-dispute.fr` (Performance 1, vide, PHP 7.3)** : migration avortée ?
  coût récurrent pour rien ?
- **Dépense OVH mensuelle réelle** (non relevée ici) : utile pour le « vs
  aujourd'hui ». Récupérable via `/me/bill` (API OVH).
- **Volumes réels** (nb commandes/an, taille listes newsletter, trafic) : calibre
  les paliers gratuits/payants de la stack.

---

## 12. Références

- `README.md` — vue d'ensemble, mapping bases, dev local (MariaDB 3307).
- `COHABITATION.md` — plan de migration en 4 phases, état courant.
- `wp-headless/CLAUDE.md` + `wp-headless/es-headless-rest.php` — contrat REST.
- `src/lib/CLAUDE.md`, `src/app/CLAUDE.md`, `src/components/CLAUDE.md` — archi du nouveau site.
- Artefacts client (hors repo) : « Deux chemins » (diagnostic), « Le socle
  complet » (archi + coût de la stack), « Sous le capot » (état des lieux WordPress).

<!-- Maintenir à jour si l'infra change. Toujours re-vérifier via §1 avant un devis. -->

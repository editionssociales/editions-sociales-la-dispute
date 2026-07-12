# Phase 2 — Bascule unique : site + catalogue Postgres + commerce
## Plan d'implémentation — VERSION BASCULE UNIQUE (réécrite le 2026-07-12)

*Réécrite le 2026-07-12, après la décision client d'abandonner la cohabitation
longue au profit d'une **bascule unique**, actée en séance ce jour. Trois
changements structurants par rapport à la version du 09/07 : (1) le
découplage CMS (`cms-es`/`cms-ld`, ancienne phase 2 de `COHABITATION.md`)
n'est **plus un préalable obligatoire** au flip — le site ne lira plus
WordPress après bascule (`CATALOGUE_SOURCE=pg` : build vérifié **316/316
pages, zéro appel WordPress**) ; (2) les deux flips DNS ES/LD, jusqu'ici
espacés de ≥ 48 h, fusionnent en **un seul geste**, dans la **même fenêtre**
que le swap catalogue et le commerce ; (3) le commerce natif — jusqu'ici une
phase 4 calée en septembre — **bascule ce même jour** : WooCommerce/Paybox
cessent de vendre au flip. Le client autorise jusqu'à **24 h de site
indisponible** (marge de réparation, pas un objectif) ; le déroulé ci-dessous
vise une coupure réelle de **quelques minutes** (gel édition WP → migration
finale → `compare-sources` → déploiement pg → flips DNS). Ce qui reste
valide de la version du 09/07 — table de redirections (E4), gate
ladispi/MXPLAN (E8), protocole de transfert de propriété (E9), recette,
risques, questions Q1–Q8 — est repris et adapté ici ; ce qui a disparu
(double flip espacé, découplage CMS obligatoire, période à double source)
ne l'est plus. **Vérifié ce jour (12/07)** : PR #9 mergée (catalogue pg,
build vert, zéro appel WordPress), PR #10 + PR #12 mergées (commerce natif
complet derrière `COMMERCE_NATIVE`), Sentry S1a livré et vérifié E2E,
migration catalogue idempotente **prouvée sur Neon réel** (295 livres / 256
auteurs / 611 médias).*

*`plan/04-commerce.md` et `plan/07-cloture.md` n'ont pas été réécrits par
cette passe : leur calendrier (commerce en septembre, extinction boutique en
octobre) et leur découpage en phases séparées sont **superseded** par ce
document sur ces points précis. Leur substance technique — modèle de
données, moteur de port, protocole de transfert Vercel/GitHub, contenu exact
de l'archive, table de matching produits — reste la référence et est
largement reprise ici. Une passe de cohérence documentaire de ces deux
fichiers reste à faire ; elle n'est pas dans le périmètre de cette
réécriture.*

---

## Objectif et livrable

Faire basculer **en une seule fenêtre** : le site vitrine (ES + La Dispute)
sur les domaines réels, le catalogue lu depuis Postgres/Payload
(`CATALOGUE_SOURCE=pg`), et le commerce natif (`COMMERCE_NATIVE=1`)
remplaçant WooCommerce/Paybox — plutôt que trois bascules espacées dans le
temps. Le client accepte jusqu'à **24 h d'indisponibilité** comme marge de
réparation ; la panne réelle visée se compte en minutes.

**Livrable final** : `https://editionssociales.fr`, `https://ladispute.fr`
et `https://boutique.editionssociales.fr` servent le site Next.js/Payload ;
toute ancienne URL WordPress ou WooCommerce redirige vers son équivalent ;
l'équipe édite le catalogue et les commandes dans **Payload `/admin`** (les
trois WordPress restent vivants en lecture/administration seulement pendant
la fenêtre de recouvrement, sur des hostnames techniques non publics) ; les
emails et le slot OVH Pro sont strictement intacts ; le projet Vercel et le
repo GitHub passent au nom du client (E9) ; un rapport de recette signé
client.

**Ce qui bascule en même temps, et pourquoi ce n'est plus étalé** :
- Le site lit déjà 316/316 pages depuis Postgres sans aucun appel WordPress
  (build vérifié) → il n'y a plus besoin d'un hostname `cms-*` intermédiaire
  **pour que le site continue de fonctionner** au flip DNS ; le découplage
  CMS ne sert plus qu'à garder un accès d'appoint aux trois WordPress
  pendant la fenêtre tampon (cf. §cms-*).
- Le commerce natif (panier, checkout Stripe, port, stock, exports) est
  **déjà écrit et mergé** (PR #10 + #12), derrière le flag `COMMERCE_NATIVE`
  qui garde la prod strictement iso-rendu tant qu'il n'est pas basculé à
  `"1"` — il n'y a donc plus de raison de le reporter à une phase séparée.
- Séparer les flips (ES puis LD 48 h après, catalogue le 20/07, commerce en
  septembre) multipliait les fenêtres de risque et les allers-retours DNS ;
  un seul geste coordonné, avec un rollback DNS unique, réduit la surface
  d'erreur — au prix d'une préparation plus dense en amont (cf. Runbook).

---

## Décisions actées le 12/07 (rappel — gouvernent tout ce document)

- **Bascule unique big-bang**, 24 h de down autorisées (marge), déroulé visé
  = quelques minutes réelles.
- **Le commerce bascule le même jour** que le site et le catalogue — plus de
  phase commerce séparée en septembre. WooCommerce/Paybox cessent de vendre
  au flip.
- **Stocks** : le routeur (distributeur) envoie **un seul fichier .xls
  mensuel couvrant les deux maisons** (colonnes `EAN`/`TIT`/`AUT`/`ABR`/
  `PUB`/`FIN`, `FIN` = stock, `EAN` numérique — ~34 anciens codes non-ISBN
  connus) ; import dans `/admin` qui **écrase** ; **décrément automatique**
  à chaque commande payée (idempotent au rejeu, `commerce.stock` jamais
  re-crédité automatiquement en cas de remboursement) ; **hors-routeur =
  suivi manuel** comme les goodies (champ `commerce.stockSuivi` :
  `routeur`|`manuel`, décompte saisi à la main dans la fiche) ; **« à
  paraître » (date de parution future) prime sur le stock** (statut
  `upcoming` avant tout calcul de disponibilité) ; alerte stock bas =
  **dashboard `/admin` uniquement, pas d'email**.
- **Arbitrages produits** : règle « l'ISBN tranche, sinon doublon → *drop
  oldest* » (la fiche la plus ancienne d'un titre disputé reste sans
  commerce natif). **Les 11 cas sont résolus** (208 produits appariés, 0 en
  attente d'arbitrage) — voir détail §Stocks et arbitrages. Une **erreur de
  saisie ACF côté WordPress** (fiche `decouvrir-le-programme-du-cnr` dont le
  lien boutique pointait par erreur vers le produit Victor Hugo) est à
  **signaler au client** ; le script de migration ne la corrige pas (contrat
  lecture seule).
- **Les 67 fiches en ligne absentes du fichier routeur** sont la backlist
  pré-2020 (clivage **temporel** de la fusion opérationnelle du 2020-06-03,
  pas une question de maison) : elles vivent en suivi manuel. **Question
  ouverte au 15/07** : sont-elles encore expédiables par le routeur ?

---

## Ce qui est déjà livré (code mergé sur `main` au 12/07)

### E1–E4 (hardening production) — déjà en code

Les pages légales (`src/app/mentions-legales`, `confidentialite`, `cgv`),
le SEO de base (`src/app/robots.ts` gâté par `SITE_INDEXABLE`,
`src/app/sitemap.ts` gâté par `revalidate = 3600`, canonicals) et la table
de redirections (`next.config.ts`, fonction `redirects()`) sont **déjà
écrits, testés et mergés** — ce n'est plus un chantier de code, seulement un
paramétrage d'environnement à poser le Jour J (`SITE_INDEXABLE=1`,
`NEXT_PUBLIC_SITE_URL`, `REDIRECTS_PERMANENT`). Le détail des règles de
redirection (toujours valide) est conservé au §Table de redirections
ci-dessous.

### Catalogue Postgres (PR #9)

`compare-sources.ts` corrigé (761 → **0 diff bloquant** : le classifieur
« réhébergement OVH → Payload » a été étendu aux champs URL nus et aux hôtes
`cms-*`), réécriture E11 des ~50 liens internes de l'HTML éditorial
(`rewrite-html.ts`), correctif « pages décimales » (`catalogue-wp-map.ts`,
artefact de saisie ACF). **Build `CATALOGUE_SOURCE=pg` vert, 316/316 pages,
zéro appel WordPress.** Le swap catalogue n'est donc plus un acte isolé du
20/07 comme le décrivait `plan/03-catalogue.md` — il rejoint la fenêtre de
bascule unique, posé en même temps que les autres flags Jour J.

### Commerce natif — lot 1 (PR #10) et lot 2 (PR #12)

Modèle de données : `Books.commerce` (`sellable`, `stock` nullable
uniforme, `stockSuivi` routeur|manuel, `reducedShippingFlag`), collections
`orders` + `promo-codes`, global `reglages-boutique` (seuil stock bas,
défaut 3), `scripts/migrate-products.ts` (idempotent), import stock
`/admin` (xlsx SheetJS, rapport à 4 sections dont l'alerte « anciennement
routeur disparu du fichier », persistante — `stock-import-core.ts`) +
widget stock bas (`StockLowWidget.tsx`).

Flag **`COMMERCE_NATIVE`** (`'0'` par défaut = site **strictement
iso-rendu**, tout le commerce n'existe qu'à `'1'` — `src/lib/env.ts`) ;
moteur de port pur en centimes (`shipping-core.ts`, grille Woo recopiée :
0–10 € → 2,00 / 11–24 € → 4,50 / 25–49 € → 5,50 / 50–500 € → 6,50, port
« manifeste » 2,50 € si panier 100 % `reducedShippingFlag`, offert si
coupon `free_shipping` ET panier ≥ 50 €, zones FR/BE/CH, **>500 € refusé**,
**quatre trous de grille paramétrés dans `GRID_HOLE_DECISIONS`** avec
défaut conservateur « rattacher au palier supérieur » — **décision client
15/07**) ; adaptateur produits pg (`catalogue-pg.ts`, à flag `1` : prix,
stock, `sellable` lus depuis Payload, **plus aucun appel Store API**) +
`PurchaseStatus` dérivé (`resolveNativePurchase`, `catalogue-core.ts` :
`upcoming` prime sur le stock ; `stock: null` = suivi absent = disponible
si `sellable` ; un livre n'est jamais retiré du catalogue) ; routes
`/boutique` + `/boutique/[slug]` (15 orphelins, gâtées par le flag,
volontairement absentes du sitemap tant que le flag est off) ; panier
client (`localStorage` ids + quantités, re-validation serveur) ; checkout
Stripe `kind:"order"` (invité, locale fr, re-validation serveur intégrale :
prix/stock/promo/zone — `src/app/api/checkout/route.ts`) ; webhook étendu
par `metadata.kind` (dons intacts ; `order` → création `Order` +
**décrément stock idempotent au rejeu** (`order-handler.ts`,
`decrementStock`, plancher 0, jamais si `stock` non suivi) ; `refund` →
statut sans re-crédit) ; emails = reçus Stripe (dons) + interface
order-mail en log (Brevo à provisionner) ; exports CSV `GET /api/orders/export/preparation` (décalque AOE) et `GET /api/orders/export/compta` (TVA 5,5 % ventilée, `order-export.ts`) —
**colonnes exactes = décision client 15/07**.

### Sentry (S1a)

Fait et vérifié E2E : org `ldes` région UE, 4 variables Vercel posées,
source maps uploadées, event de test reçu, alerte email par défaut active.

### Migration catalogue — preuve Neon réelle

`scripts/migrate-catalogue/import.ts` re-vérifié **idempotent sur Neon
réel** : 295 livres / 256 auteurs / 611 médias importés, re-run = 0 créé /
0 mis à jour. La preuve de non-régression du swap `CATALOGUE_SOURCE=pg` ne
repose donc plus sur une hypothèse — elle a tourné en vrai.

---

## Stocks et arbitrages produits (état au 12/07)

**Modèle de stock.** Un fichier `.xls` mensuel du routeur couvre les deux
maisons (colonnes `EAN`/`TIT`/`AUT`/`ABR`/`PUB`/`FIN`) ; l'import écrase
`commerce.stock` des fiches appariées par ISBN normalisé (chiffres
uniquement — un EAN routeur et un ISBN saisi `978-2-35367-036-9` matchent
à la même clé) et pose `stockSuivi: 'routeur'`. Les fiches jamais couvertes
par le routeur (goodies, backlist) restent en `stockSuivi: 'manuel'` :
décompte saisi à la main dans la fiche, comportement **normal**, pas une
alerte. La **vraie alerte** du rapport d'import : une fiche déjà en suivi
`routeur` qui disparaît du fichier suivant (titre retiré du routeur) —
persistante tant que l'anomalie n'est pas résolue côté fichier ou basculée
en suivi manuel assumé.

**Les 67 fiches en ligne absentes du fichier routeur** ne sont donc **pas**
une anomalie de maison : elles datent d'avant la fusion opérationnelle du
distributeur (2020-06-03) — clivage **temporel**, backlist pré-fusion. Elles
vivent en suivi manuel. Reste ouvert : le routeur peut-il encore les
expédier (question posée au client pour le 15/07) ?

**Arbitrages produits (`scripts/migrate-products.ts`)** : sur 213 liens
`buy.boutiqueUrl` pour 223 produits Store API, 204 étaient valides pour 203
produits distincts (un produit disputé par deux fiches). Le client a
tranché le 12/07 les **11 cas** qui restaient : 4 liens cassés (dérive
« -prevente », coquille de nom) rattachés à leur candidat vérifié un à un ;
2 doubles réclamations résolues par « l'ISBN tranche » (chacune sa fiche —
la seconde, `decouvrir-le-programme-du-cnr`, révèle une **erreur de saisie
ACF côté WordPress** à signaler au client, correction hors périmètre du
script lecture seule) ; 5 fiches tranchées « restent sans produit »
(3 doublons *drop oldest*, 2 fiches sans aucun produit correspondant,
recherche par similarité incluse). **Total : 208 produits appariés, 0 en
attente.** Le script est idempotent, rejoué sur dump frais à J−1 (cf.
Runbook).

**Ce qui manque encore côté code, à faire avant le Jour J** : la table de
redirections des anciennes URLs `/produit/<slug>/` vers leur fiche/`/boutique/<slug>` (`next.config.ts` ne contient aujourd'hui aucune règle
host `boutique.editionssociales.fr` — seul le `remotePattern` d'image existe)
doit être générée à partir du rapport de `migrate-products.ts` et branchée
dans `redirects()` avant J−7.

---

## `cms-*` : statut revu — plus un prérequis, sauf pour la boutique

Le découplage CMS (donner à chaque WordPress un hostname `cms-*` non
public) **n'est plus une précondition du flip** : le site ne lit plus
WordPress après bascule, quel que soit l'état de `cms-es`/`cms-ld`.

- **`cms-es.editionssociales.fr` / `cms-ld.editionssociales.fr`** :
  **filet optionnel**, pas cher (DNS A + attachedDomain + garde noindex,
  cf. l'ancienne étape E3 — la mécanique reste valide si on la fait) et
  recommandé : il donne à l'équipe un accès de secours à wp-admin pendant
  la fenêtre tampon, et sert de cible temporaire pour les rares URLs
  `/wp-content/*` non couvertes par la migration média (cf. la décision
  Blob vs cms-es minimal ci-dessous). **Sans lui**, ces deux WordPress
  restent simplement joignables par leur hostname de cluster technique
  OVH existant (sans SSL propre) — suffisant pour une consultation de
  secours, pas pour une redirection publique propre.
- **`cms-boutique.editionssociales.fr` : OBLIGATOIRE.** Le drainage des
  commandes `wc-processing` pendant les ~2 semaines de recouvrement se fait
  depuis wp-admin de la Boutique — et ce wp-admin doit rester joignable
  après que le domaine public a basculé vers Vercel. Sans ce hostname, le
  drainage est impossible (cf. Runbook, préparation J−7).
- **Cible des redirections `/wp-content/*`** (ES et LD) : les couvertures,
  PDF et images déjà migrés vers Payload/Vercel Blob n'ont plus besoin de
  WordPress ; mais la migration catalogue (P3) peut laisser un résidu non
  couvert. **Décision à prendre avant de câbler la règle** : rediriger
  directement vers les URLs Blob (si la couverture est complète — à
  vérifier par le contrôle SQL « zéro URL OVH résiduelle en base », déjà
  utilisé en clôture) ou vers `cms-es`/`cms-ld` minimal en filet (si un
  résidu subsiste). Par défaut : `cms-es`/`cms-ld` en filet le temps de la
  fenêtre tampon, à retirer ensuite — c'est le choix le moins risqué tant
  que le contrôle SQL n'a pas tourné sur les données fraîches de J−1.

---

## Préconditions et provisioning (qui fait quoi)

| # | Précondition | Qui | Détail / vérif |
|---|---|---|---|
| P1 | Accès OVH API compte ES (écriture zone DNS + hosting) | Youri | `OVH_ES_*` du shell, helper `~/.config/claude/ovh_api.py` — vérifiés fonctionnels. |
| P2 | Accès SFTP/SSH aux installs OVH `www`, `LaDispute`, `Boutique` | Youri | Pour `wp-config.php` (defines `WP_HOME`/`WP_SITEURL`) et l'archive `wp-content` avant gel. |
| P3 | Accès Vercel team `solidz` (domaines + env vars) + GitHub | Youri | ⚠️ Utiliser les tokens shell (`VERCEL_TOKEN`/`GH_TOKEN`), pas ceux de `site/.env` (scopés compte client, deviennent les bons **après** E9). |
| P4 | Informations légales de la structure (SIRET, forme juridique, directeur de la publication…) | **Client** | Engagement devis C90. **Placeholders bloquants pour le Jour J** — les pages légales existent déjà en code, mais leur contenu doit être complet avant que le site serve les vraies adresses. |
| P5 | Décisions du 15/07 (gate d'entrée de la fenêtre de bascule) | **Client** | Les **quatre trous de la grille de port**, les **colonnes des deux exports** (préparation/compta), les infos légales (P4), le sort des **67 fiches backlist pré-2020** (expédiables par le routeur ?), la **date exacte de la fenêtre**, Q1–Q8 ci-dessous. Rien de daté avant le 15/07 ne peut être calé plus précisément que « fenêtre 24–28/07 ». |
| P6 | Décision client : feu vert bascule | Client | Obtenu en séance le 15/07 avec la date précise. |
| P7 | Génération de la table de redirections `/produit/<slug>` | Youri/agent | À partir du rapport `migrate-products.ts` (208 appariés) — code restant à écrire avant J−7 (cf. §Stocks). |
| P8 | Moniteurs Better Stack sur `/`, `/catalogue`, `POST /api/checkout` + les 3 WP + expiration TLS `cms-*` si créés | Youri | Souhaitable avant le Jour J ; non bloquant. |
| P9 | Compte Google du client (Search Console) | **Client** | Repli : propriétés créées sous le compte de Youri, transfert tracé à la recette (aligné E9). |
| P10 | Transfert de propriété (E9) : team Vercel `ldes` en plan Pro + carte client ; compte GitHub `editionssociales` prêt | **Client** (Youri accompagne) | Cf. §E9. Date à acter le 15/07. |

Aucun secret Stripe à provisionner (déjà réel, phase Dons livrée) ; clés
**test** en preview pour la recette commerce, clé **live** en production.

---

## Table de redirections

Les tables ES/LD **sont déjà en code** (`next.config.ts`, fonction
`redirects()`) et restent valides telles quelles ; elles sont rappelées ici
pour mémoire et pour le point ouvert sur `/wp-content`.

### Host `editionssociales.fr`

| # | source | destination | statut |
|---|---|---|---|
| 1 | `/catalogue/page/:n(\d+)` | `/catalogue/editions-sociales` | r |
| 2 | `/catalogue/:slug((?!editions-sociales$)(?!la-dispute$)[^/]+)` | `/catalogue/editions-sociales/:slug` | r |
| 3 | `/auteur/:slug` | `/catalogue/editions-sociales?author=:slug` | r |
| 4 | `/collection/:slug` | `/catalogue/editions-sociales?collection=:slug` | r |
| 5 | `/parution/:slug` | `/catalogue/editions-sociales?upcoming=1` | r |
| 6 | `/catalogue-collection`, `/catalogue-auteur` | `/catalogue/editions-sociales` | r |
| 7 | `/les-emissions-sociales` | `/a-propos` *(défaut, Q2)* | r |
| 8 | `/la-geme` | `https://gememarxengels.org` *(défaut, Q2)* | r |
| 9 | `/newsletter` | `/` *(phase Newsletter la re-ciblera)* | t |
| 10 | `/marx-passe-lagreg` | `/catalogue/editions-sociales` *(défaut, Q2)* | r |
| 11 | `/feed`, `/feed/:rest*`, `/comments/feed` | `/` | r — 3 règles séparées (accolades interdites, path-to-regexp Next 16) |
| 12 | `/wp-content/:path*` | selon décision §cms-\* : Blob direct ou `cms-es.editionssociales.fr` filet | r |
| 13 | `/wp-admin/:path*`, `/wp-login.php` | vers `cms-es` si créé, sinon vers `/admin` (Payload) | t |
| 14 | `/wp-json/:path*` | `cms-es` si créé, sinon règle retirée | t |

### Host `ladispute.fr` (catch-all final — déménagement complet du domaine)

| # | source | destination | statut |
|---|---|---|---|
| 1–9 | (identiques à la V1 : archive page/n, fiche, catalogue, auteur, collection, parution, a-propos, catalogue-auteurs/collection) | `https://editionssociales.fr/...` | r |
| 10 | `/wp-content/:path*` | idem §cms-\* (Blob ou `cms-ld` filet) | r |
| 11 | `/wp-admin/:path*`, `/wp-login.php`, `/wp-json/:path*` | `cms-ld` si créé, sinon retirée | t |
| 12 | `/:path*` (catch-all, dernier) | `https://editionssociales.fr/` | r |

### Host `boutique.editionssociales.fr` — À CÂBLER avant J−7 (P7)

Table générée depuis le rapport `migrate-products.ts` (208 produits
appariés + 5 « sans produit » + arbitrages tranchés) :

| source | destination | statut |
|---|---|---|
| `/produit/<slug-matché>/` | `/catalogue/<edition>/<slug-fiche>` ou `/boutique/<slug>` (orphelin conservé) | r (302 → 301 à E7) |
| `/produit/<slug-sans-produit>/` | `/catalogue` (repli, aucune fiche ne le porte) | r |
| `/panier`, `/commander`, `/mon-compte` | `/panier` | r |
| `/categorie-produit/:cat` | `/catalogue/editions-sociales` ou `/catalogue/la-dispute` (table catégories) | r |
| `/` (host boutique) | `/catalogue` | r |
| `/wc-api/*`, `/?wc-api=*` | **rewrite** (pas redirect) vers `cms-boutique.editionssociales.fr` | actif pendant tout le recouvrement — callbacks Paybox résiduels |

**Toujours interdit** : `permanent: false` (émettrait des 307) — `statusCode`
explicite partout, 302 pendant le recouvrement, 301 seulement après
validation client (E7).

---

## Runbook Jour J unique (J−7 → recouvrement)

Remplace les anciennes étapes E5/E6 (deux flips DNS espacés) et le Jour J
séparé de `plan/04-commerce.md` §12 : **un seul calendrier**, un seul flip,
tous les domaines et tous les flags le même matin.

### J−7 (préparation)

1. **Abaisser les TTL** sur tous les enregistrements qui bougeront le Jour
   J : zone `editionssociales.fr` — `@` (A, id `5080168574`), `www` (A id
   `5080168577` **et** CNAME parasite préexistant id `5080168571`,
   coexistence irrégulière héritée, les deux à retirer), les 4
   enregistrements A/AAAA de `boutique` et `www.boutique` (213.186.33.17 +
   2001:41d0:1:1b00:213:186:33:17 chacun — **IDs à relever avant ce jour**,
   non capturés dans les recons précédentes contrairement à ES/LD) ; zone
   `ladispute.fr` — `@` (A id `5115393735`), `www` (A id `5115393736`).
2. **Export de zone committé** dans `ops/dns/` pour les deux zones
   (`editionssociales.fr` couvre aussi les sous-domaines boutique) —
   artefact de rollback.
3. **Créer `cms-boutique.editionssociales.fr`** (A vers l'IP du cluster,
   attaché au slot OVH path `Boutique`, SSL), poser `WP_HOME`/`WP_SITEURL`
   en **constantes `wp-config.php`** (elles priment sur les options en
   base — vérifié : `siteurl`/`home` sont en base pour cette install, un
   hostname technique brut sans ces constantes boucle en redirection
   canonique), tester wp-admin dessus. **Obligatoire** (drainage).
4. **Optionnel** (filet, cf. §cms-\*) : `cms-es`/`cms-ld` selon la même
   mécanique que l'ancienne étape E3 (DNS A, attachedDomain, garde
   noindex mu-plugin `es-cms-guard.php` — code déjà écrit, à redéployer
   www → vérif → LaDispute).
5. Ajouter les domaines au projet Vercel (`editionssociales.fr` + `www`,
   `ladispute.fr` + `www` **en domaine normal, pas en Redirect to
   Primary** — casserait le mapping `/catalogue/<slug>` →
   `/catalogue/la-dispute/<slug>`, ce sont les règles host de
   `next.config.ts` qui font foi ; `boutique.editionssociales.fr` +
   `www.boutique`). Les domaines restent « misconfigured » jusqu'au flip —
   normal, active le run pré-flip de `verify-redirects` en Host spoofé.
6. `verify-redirects.mjs` en mode Host spoofé sur la preview Vercel : 0
   échec sur les trois hosts (ES, LD, boutique).
7. Câbler la table de redirections boutique (P7) et le rewrite `/wc-api/*`
   → `cms-boutique` dans `next.config.ts` ; merger sur `main`.

### J−2

- Re-vérifier la propagation TTL 300 sur les deux zones.
- Re-run `verify-redirects.mjs` complet (Host spoofé, les trois hosts).
- Confirmer la date et la fenêtre horaire avec un référent client
  joignable (matin, trafic faible).

### J−1 (soir)

1. **Gel de saisie WordPress** sur les trois installs (ES, LD, Boutique) —
   l'équipe cesse d'éditer catalogue et commandes.
2. **Coupure du checkout WooCommerce** (mode lecture seule : page d'info +
   paiement désactivé, réversible) — purge les IPN Paybox en vol avant que
   le domaine ne réponde depuis Vercel (un IPN émis après le flip
   n'atteindrait jamais Woo).
3. **Dump OVH frais** des trois bases (`editionskes`, `editionsk712`,
   `editionsk884`).
4. **Re-run des scripts de migration, idempotents, sur les dumps frais** :
   `migrate-catalogue/import.ts` (catalogue → Payload — le parachute
   `contentTouched` protège toute fiche déjà rééditée à la main dans
   Payload : la migration ne l'écrase pas) puis `migrate-products.ts`
   (produits → `commerce`/`origin: boutique`, table ARBITRAGES déjà
   tranchée le 12/07, aucune nouvelle décision à prendre sur re-run).
5. **`compare-sources.ts`** : re-vérifier **0 diff bloquant** sur les
   données fraîches (déjà prouvé le 12/07, à rejouer sur J−1 pour la
   fraîcheur).
6. **Générer l'archive** (dumps + `wp-content` des trois installs) — la
   remise formelle et la confirmation écrite du client suivent le
   protocole de `plan/07-cloture.md` (hors périmètre de ce document), mais
   l'archive doit **exister** avant que quoi que ce soit devienne
   définitif.

### Jour J (matin, fenêtre proposée 9h–11h)

1. **Poser les flags Vercel (production)** en un seul redéploiement :
   `COMMERCE_NATIVE=1`, `CATALOGUE_SOURCE=pg`, `SITE_INDEXABLE=1`,
   `NEXT_PUBLIC_SITE_URL=https://editionssociales.fr`
   (`REDIRECTS_PERMANENT` reste `0` — 302 pendant tout le recouvrement).
2. **Flip DNS** (valeurs Vercel : A `76.76.21.21`, CNAME
   `cname.vercel-dns.com.`) :
   - Zone ES : `@` → A Vercel ; supprimer `www` A + CNAME parasite ; créer
     `www` CNAME Vercel ; remplacer les 4 A/AAAA de `boutique`/`www.boutique`
     par CNAME Vercel.
   - Zone LD : `@` → A Vercel ; `www` A → CNAME Vercel.
   - `refresh` des deux zones.
3. `editions-sociales-la-dispute.vercel.app` → « Redirect to Primary
   Domain » (évite le contenu dupliqué post-flip), **simultanément** à la
   création du second endpoint webhook Stripe sur `https://editionssociales.fr` (les deux endpoints coexistent — Stripe ne suit
   pas les 307/308).
4. **Vérifications immédiates** :
   - `dig` sur les trois hosts → cible Vercel ; certificats émis.
   - `verify-redirects.mjs` en mode direct (plus de spoof) sur les trois
     hosts → 0 échec.
   - `robots.txt`/`sitemap.xml` conformes.
   - **Boutique** : parcours d'achat réel jusqu'au paiement, **1–2
     commandes réelles à faible montant, remboursées ensuite** (smoke test
     + démonstration du geste SAV).
   - **Email intact** : envoi/réception sur `toutes@editionssociales.fr` et
     les 4 boîtes `@la-dispute.fr` ; `dig MX` inchangé sur les deux zones.
   - **Édition catalogue** : une modification dans **Payload `/admin`**
     déclenche `revalidatePath` immédiatement (`src/payload/hooks/revalidate.ts`) — pas d'attente de fenêtre ISR fixe, contrairement à
     l'ancien modèle WordPress.
   - GSC : soumettre le sitemap des deux propriétés.
5. Retirer/adapter le lien `legacyUrl` des pages `/editions/[slug]` (ES et
   LD pointent désormais sur le site lui-même).

### Recouvrement (défaut 2 semaines)

- **Drainage des commandes `wc-processing`** (107 au dernier relevé, le
  chiffre réel est celui du gel) via wp-admin sur `cms-boutique`.
- **Proxy `/wc-api/*` et `/?wc-api=*`** actif (rewrites Vercel →
  `cms-boutique`) pour les callbacks Paybox résiduels de ces commandes.
- Résiliation du contrat Paybox (VAD banque) : **décision client, après**
  le drainage complet — jamais avant.
- **E7 (302 → 301)** sur validation écrite du client, après revue des 404
  dans les logs Vercel — cf. §Recette.
- Retrait des `cms-*` optionnels (s'ils ont été créés) et du proxy
  `/wc-api/*` : traité par la phase de clôture, pas avant la fin de la
  fenêtre tampon (cf. `plan/07-cloture.md`).

**Rollback** (tant que la fenêtre tampon court) : remettre les
enregistrements DNS d'origine depuis l'export de zone, supprimer les
defines `wp-config.php`, réactiver le checkout Woo. Effectif en ~5 min côté
DNS (TTL 300), avec la même limite documentée qu'en V1 : la normalisation
trailing-slash de Next (308 permanent servi dès le jour 1) peut faire
boucler un visiteur entre son 308 en cache et le 301 inverse de WordPress —
consigne « vider le cache / navigation privée » en cas de rollback réel.

---

## E8 — Gate ladispi / MXPLAN / facturation Email Pro — ⚠️ toujours actif

**Fait établi (API OVH, absent des docs)** : `la-dispute.fr` porte **4
boîtes mail actives** (`a-cukier@`, `la-dispute@`, `m-simonin@`,
`c-laspalas@`) + 1 redirection, sur l'offre **« MXPLAN 1000 hosting »** —
créée le **même jour** que le slot `ladispi` (2020-06-03), même expiration
(2027-06-01), serviceIds adjacents (31854572 / 31854542). Le suffixe
« hosting » suggère un plan email **inclus dans l'hébergement** →
**résilier le slot risque de supprimer 4 boîtes mail vivantes**. Ce serait
une violation directe de « les MX/emails ne sont jamais touchés ».

**E8.0 — revue de facturation Email Pro** (engagement C94, ~15–30 min,
aucun risque DNS) : identifier et traiter la ligne Email Pro facturée en
double (22,87 €), **jamais** le service porteur des MX.

**Procédure gâtée**, inchangée par rapport à la V1 :
1. **Gate bloquant** : confirmer auprès d'OVH si la résiliation de
   `ladispi.cluster028.hosting.ovh.net` emporte le service email
   `la-dispute.fr`.
2. **Si emporté** → décision client (Q5) : migrer les 4 boîtes avant
   résiliation, ou garder le slot (287 €/an = le prix de 4 boîtes mail).
3. **Si indépendant** → vérifier le slot vide, puis résiliation par le
   client dans le manager OVH.
4. **Détachement des attachedDomains devenus orphelins** (`editionssociales.fr`,
   `www.editionssociales.fr`, `ladispute.fr`, `www.ladispute.fr`) —
   **jamais pendant le recouvrement** (le rollback DNS a besoin des
   attachedDomains). Motif : risque de casser le renouvellement Let's
   Encrypt du certificat multi-domaines du slot, ce qui emporterait le
   HTTPS des `cms-*` s'ils existent.

Ce gate n'a **aucune dépendance** avec le calendrier de bascule unique — il
tourne en parallèle, sur son propre rythme (réponse OVH, décision client),
sans bloquer le Jour J.

---

## E9 — Transfert de propriété au client (résiduel, protocole inchangé)

Le devis engage : version transférée « sans perte d'historique au plus
tard à la mise en production », comptes au nom de la structure, Youri
invité ensuite. **Protocole de référence : `plan/07-cloture.md` §Étape 9**
— repo GitHub d'abord, puis projet Vercel, puis **transferts séparés** de
l'intégration Marketplace Neon et des stores Vercel Blob (ils ne suivent
**pas** un transfert de projet), critère de preuve = propriété visible dans
le dashboard du compte client, fallback = remise de la team entière.

**Séquencement** : dry-run sur projet jetable avant la fenêtre de bascule ;
exécution dans les jours qui suivent la recette (une seule pièce mobile à
la fois — pas pendant le flip lui-même). La **facturation Vercel** (team
`ldes` en Pro, carte du client) doit être posée **dès la mise en
production**, indépendamment de la date d'exécution technique du transfert
complet — c'est l'exigence contractuelle non négociable. Décision « team
entière vs projet + ressources séparément » : posée le 15/07, tranchée
avant la fenêtre de bascule.

**Post-transfert** : re-vérifier l'endpoint webhook Stripe et re-poser les
secrets ; re-lier l'intégration Git Vercel sur le nouveau slug.

---

## Recette et critères d'acceptation (point de vue client)

1. **Le site répond sur les vraies adresses** : `editionssociales.fr`,
   `ladispute.fr` et `boutique.editionssociales.fr` affichent le nouveau
   site, cadenas TLS valide.
2. **Aucun lien ancien n'est cassé** : échantillon écrit (fiches, PDF,
   pages auteur, anciens produits boutique les plus vendus) → 0 échec sur
   `verify-redirects`, rapport remis en annexe.
3. **La vente fonctionne** : un achat réel de bout en bout sur le nouveau
   checkout Stripe (panier → paiement → email → commande visible en
   `/admin` → ligne correcte dans l'export compta), la grille de port
   validée sur chaque tranche (y compris les trous arbitrés).
4. **Les emails fonctionnent à l'identique** : `toutes@editionssociales.fr`
   et les 4 boîtes `@la-dispute.fr`.
5. **L'équipe édite dans Payload `/admin`** — ceci remplace wp-admin
   ES/LD comme outil d'édition courant du catalogue ; une modification
   apparaît immédiatement (`revalidatePath`, pas de fenêtre ISR à
   attendre). wp-admin sur `cms-boutique` reste utilisé **uniquement**
   pour le drainage des commandes en cours.
6. **Pages légales** complètes (SIRET, directeur de publication réels, pas
   de placeholder), CGV incluant désormais la section vente (rétractation,
   médiation, livraison).
7. **SEO** : `robots.txt` permissif, `sitemap.xml` soumis, propriétés GSC
   au nom du client (ou transfert tracé).
8. **404 propre** : `not-found.tsx`, pas d'erreur brute.
9. **Slot ladispi** : décision Q5 actée ; si résiliation, confirmation OVH
   écrite et **aucune boîte mail perdue** (re-test après résiliation).
10. **Continuité de la vente** : à aucun moment le parcours d'achat n'a été
    indisponible ou dédoublé ; les anciennes URLs `/produit/...` redirigent
    (en IPv4 comme en IPv6).
11. **Réversibilité démontrée + propriété transférée** : document de
    rollback remis, aucune suppression WordPress, projet Vercel et repo
    GitHub au nom du client, trace écrite.
12. **Archive** : commandes + clients + newsletter + catalogue remis et
    confirmés sains **avant** toute extinction (protocole `07-cloture.md`).

---

## Risques et parades

| Risque | Gravité | Parade |
|---|---|---|
| **Résiliation ladispi supprime les 4 boîtes mail** | Critique | Gate E8 obligatoire avant toute résiliation ; décision client Q5 ; re-test mail post-résiliation. |
| MX/DKIM/SPF cassés par une manip de zone | Critique | Records touchés désignés par ID, re-vérifiés ; export de zone committé avant ; test mail dans la fenêtre. |
| **Panne au-delà des 24 h autorisées** (la bascule unique concentre site + catalogue + commerce dans le même geste) | Critique | Runbook séquencé (gel → migration → compare-sources → deploy → DNS) avec vérifications à chaque étape ; rollback DNS ~5 min ; `compare-sources` déjà prouvé 0 bloquant en amont, rejoué sur données fraîches à J−1 seulement pour la fraîcheur, pas pour découvrir un problème structurel. |
| **Table de redirections boutique non prête** (§Stocks : encore à câbler) | Élevée | P7 explicitement daté avant J−7 dans les préconditions ; `verify-redirects` couvre les trois hosts avant tout flip. |
| Trous de la grille de port non tranchés au Jour J | Moyenne | Défaut conservateur déjà codé (`GRID_HOLE_DECISIONS`, rattacher au palier supérieur) — le Jour J n'est jamais bloqué par cette décision, seulement moins optimal tant qu'elle n'est pas prise. |
| IPN Paybox en vol / drainage impossible | Élevée | Checkout Woo coupé à J−1 soir (purge avant flip) ; `cms-boutique` + constantes `wp-config` testées à J−7 ; proxy `/wc-api/*` actif pendant tout le recouvrement. |
| Hotlinks `/wp-content` cassés silencieusement | Élevée | Décision Blob vs `cms-es` filet prise avant de câbler la règle (§cms-\*) ; contrôle SQL « zéro URL OVH résiduelle » rejouable sur les données fraîches. |
| Pattern `/catalogue/:slug` avale les routes natives | Élevée | Lookahead négatif déjà en code + cas négatifs dans `verify-redirects.mjs`. |
| Commandes perdues (webhook Stripe raté) | Moyenne | Idempotence par `stripeSessionId` (déjà en code, testée) ; Sentry sur le handler. |
| **Transfert Vercel/GitHub (E9) exécuté au mauvais moment** | Moyenne | Dry-run avant la fenêtre ; carte + Vercel Pro posées dès la mise en production quelle que soit la date d'exécution technique complète. |
| Rollback DNS incomplet côté navigateurs (308 trailing-slash en cache) | Faible (bornée) | Documenté au dossier de rollback ; consigne « vider le cache ». |

---

## Dépendances et interfaces avec les autres phases

- **`plan/04-commerce.md`** : son calendrier (kickoff septembre, jour J
  29/09) est **superseded** par ce document — le commerce bascule dans
  cette même fenêtre. Sa substance (modèle de données, moteur de port,
  contenu de l'archive, table de matching) reste la référence technique et
  est reprise ci-dessus.
- **`plan/03-catalogue.md`** : son « swap `CATALOGUE_SOURCE=pg` du 20/07 »
  comme événement isolé est **superseded** — le swap rejoint cette fenêtre.
- **`plan/07-cloture.md`** : reste la référence pour le protocole de
  transfert de propriété (E9, étape 9), le contenu exact de l'archive, et
  l'extinction définitive des trois WordPress après la fenêtre tampon — non
  modifié par ce document.
- **Phase Newsletter (Brevo)** : indépendante, fournit les emails de
  commande (aujourd'hui en log) — pas un bloquant du Jour J.
- **`COHABITATION.md`** : phases 2–4 remplacées par ce document (pointeur
  explicite dans ce fichier).

---

## Calendrier

| Quand | Étape |
|---|---|
| **15/07** | Démo + décisions gate : 4 trous de grille, colonnes d'export, infos légales (SIRET, directeur de publication), sort des 67 fiches backlist pré-2020, date exacte de la fenêtre, Q1–Q8, modalités E9. |
| 16–20/07 | Câblage de la table de redirections boutique (P7) ; création éventuelle de `cms-es`/`cms-ld` (filet) et obligatoire de `cms-boutique` ; dry-run E9 ; `verify-redirects` vert en mode Host spoofé. |
| J−7 (à caler selon la date retenue) | Baisse des TTL, export de zone, `cms-boutique` créé et testé, domaines attachés au projet Vercel. |
| J−2 | Re-vérification TTL + `verify-redirects`. |
| J−1 soir | Gel WP, coupure checkout Woo, dump frais, re-run migration + `compare-sources`, archive générée. |
| **Jour J** | Flags Vercel + flips DNS (ES, LD, boutique) en un seul geste, vérifications, smoke tests. |
| J → J+14 | Recouvrement : drainage `wc-processing`, proxy `/wc-api/*` actif. |
| Fin de recouvrement | E7 (302 → 301) sur validation écrite ; résiliation Paybox (décision client). |
| **Butée** | 15/08 — lancement de la campagne dons. |

**Fenêtre proposée : 24–28/07.** Le 21/07, évoqué dans les versions
antérieures pour le seul catalogue, est devenu **agressif** maintenant que
le commerce entre dans la même fenêtre (câblage de la table de
redirections boutique, décisions du 15/07 à intégrer, dry-run E9) — 24–28/07
est réaliste, avec la marge du 15/08 comme butée absolue (la campagne dons
ne doit pas dépendre d'un chantier encore ouvert).

---

## Questions ouvertes / décisions client

| # | Question | À trancher au plus tard | Défaut recommandé |
|---|---|---|---|
| Q1 | Informations légales complètes + forme juridique (C90) | 15/07 — placeholders bloquants pour le Jour J | Publier avec les infos fournies ; SIRET + directeur de publication non négociables |
| Q2 | Destinations des pages orphelines (`/les-emissions-sociales`, `/la-geme`, `/marx-passe-lagreg`) | Avant E7 (301) | Défauts du tableau de redirections ; ajustables tant qu'en 302 |
| Q3 | Domaine canonique (`editionssociales.fr`) + sort des domaines défensifs `editions-sociales.fr`/`.com` (page parking OVH, aucune redirection aujourd'hui) | 15/07 | Oui, canonique ; défensifs → Redirect to Primary post-E7 |
| Q4 | Reçus fiscaux dons (dépend du statut juridique) | Avant mise en réel des dons | Ne pas promettre de reçu fiscal tant que le statut n'est pas confirmé |
| Q5 | Sort du slot `ladispi` (E8) | Après recette, pas d'urgence (renouvellement 2027-06-01) | Différer la résiliation si couplage confirmé, présenter les deux chiffrages |
| Q6 | **Date exacte de la fenêtre de bascule** | 15/07 | 24–28/07 ; à défaut tout mardi/jeudi matin avant le 31/07 |
| Q7 | Date et modalités du transfert de propriété (E9) — team entière vs projet + ressources séparément | 15/07 | Facturation Vercel côté client dès la mise en production ; transfert technique complet dans les jours qui suivent la recette |
| Q8 | **Les quatre trous de la grille de port** : recopier strictement (checkout bloqué) ou combler ? | 15/07 | Combler par rattachement au palier supérieur (déjà codé en défaut) |
| Q9 | **Colonnes exactes des deux exports** (préparation/compta) | 15/07 | Décalque AOE pour « préparation », profil proposé pour « compta » — à valider par la personne compta |
| Q10 | **Les 67 fiches backlist pré-2020 sont-elles encore expédiables par le routeur ?** | 15/07 | En l'absence de réponse, rester en suivi manuel (défaut déjà actif) |

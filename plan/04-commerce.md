# Commerce natif — livré (lots 1–2, mergés le 12/07), reste : décisions client + jour J

*Mise à jour du 2026-07-12, après décisions client actées le jour même et merge de
`feat/commerce-modele-stock` (PR #10) + `feat/commerce-lot2-vente` (PR #12) dans `main`.
Remplace la version « B phasé / kickoff 07/09 » : le commerce n'est plus une phase de
septembre déclenchée par un kickoff à venir — le modèle de données, la migration
produits, la gestion de stock, le moteur de port, le panier, le checkout Stripe, le
webhook et les exports sont **écrits, testés, mergés**. Ce qui reste est : des décisions
client encore ouvertes (15/07), une poignée d'intégrations résiduelles (Brevo, recette
Stripe en clés test, formation équipe), et la bascule elle-même — qui n'est plus un
cutover de sous-domaine isolé en septembre mais **le jour J commun** à tout le chantier
(catalogue + commerce + DNS + indexation, en une seule fenêtre, cf. `plan/02`).*

---

## Ce qui a changé le 12/07 (à ne pas relire comme la version de juillet précédente)

- **Abandon de la cohabitation longue durée.** Le client a acté une **bascule unique
  big-bang** : plus de fenêtre de recouvrement de plusieurs semaines avec deux caisses
  qui coexistent à des dates différentes. 24 h de site indisponible sont **autorisées**
  par le client (marge de réparation) mais le déroulé visé réduit le down réel à
  quelques minutes : gel de l'édition WordPress → migration finale → `compare-sources`
  → déploiement Postgres → flips DNS. Le runbook détaillé de cette fenêtre vit dans
  `plan/02-mise-en-production.md` (pointeur, section « Jour J ») — ce document ne le
  duplique pas.
- **Le commerce bascule le même jour.** Il n'y a plus de « phase commerce de
  septembre » séparée : WooCommerce/Paybox cesse de vendre au flip, dans la même
  fenêtre que le passage `CATALOGUE_SOURCE=pg` et les flips DNS ES/LD/boutique.
- **La gestion de stock est dans le périmètre** (routeur + suivi manuel) — ce n'était
  jusqu'ici qu'un toggle `in_stock/out_of_stock` hors périmètre vendu ; le client a
  demandé et obtenu un import mensuel du fichier du routeur avec décrément automatique
  à la commande, cf. ci-dessous.
- Les 11 cas d'arbitrage produits (liens cassés, doublons, double réclamation) sont
  **résolus** — plus une ligne TODO dans le script de migration.

---

## ① Ce qui est fait (livré et mergé le 12/07)

### Modèle de données (Payload/Postgres, PR #10)

- **`Books.commerce`** (groupe ajouté à la collection existante) : `sellable`
  (checkbox), `stock` (nombre, `min: 0`, nullable — `null` = non suivi, **pas** de
  bascule séparée `in_stock`/`out_of_stock` : le stock **est** la disponibilité,
  décision client du 12/07 ; `0` = épuisé sans retirer la fiche du catalogue),
  `stockSuivi` (`routeur` | `manuel`, défaut `manuel`), `reducedShippingFlag`
  (checkbox, port réduit « manifeste »), `stockUpdatedAt` (posé automatiquement par
  l'import routeur, jamais saisi à la main).
- **Collection `orders`** : adresses (facturation/livraison, pays limité à
  FR/BE/CH), `number`, `status` (`paid`/`prepared`/`shipped`/`cancelled`/`refunded`/
  `failed`), `email`, `lines[]` (référence livre + **snapshot** titre/ISBN/quantité/
  prix unitaire TTC au moment de la vente), `shippingMethod`
  (`standard`/`reduit`/`offert`), `shippingCostTTC`, `promoCode` + `discountTTC`,
  `totalTTC`, `stripeSessionId` (unique — clé d'idempotence), `stripePaymentIntentId`.
  Écrite uniquement par le webhook ; le back-office ne modifie que `status`.
- **Collection `promoCodes`** : décalque des coupons Woo natifs (`fixed_cart`,
  `free_shipping`), gérée par l'équipe dans Payload.
- **Global `reglages-boutique`** : `seuilAlerteStockBas` (défaut **3** exemplaires) —
  seul réglage transverse posé à ce stade, consommé par le widget stock bas du
  back-office.
- Migration Drizzle versionnée (`src/migrations/20260712_175030_stock_updated_at.*`),
  pas de `push` en prod — conforme à la discipline du dépôt.

### Migration produits (PR #10, arbitrages tranchés en PR #35f2e87)

- Script `scripts/migrate-products.ts` (+ cœur pur `migrate-products-core.ts`,
  `pnpm payload run scripts/migrate-products.ts -- [--dry-run]`), idempotent
  (upsert par slug, un re-run sans changement de source = 0 création/0 màj — vérifié).
  Lit la Store API live, apparie par slug extrait de `boutique_es` (URL-décodé,
  piège `%e2%80%89`) — même clé que la fusion du front.
- **Chiffres du dernier run (base locale, 12/07)** : **208 fiches appariées** (+6
  depuis le run précédent), **15 orphelins** conservés (produits sans fiche
  catalogue → deviennent des fiches `origin: "boutique"`, `edition: null`, servies
  par `/boutique/[slug]`), **0 en attente d'arbitrage** (contre 11 avant décision
  client), **0 conflit**. Second run de contrôle : 0 màj/208 inchangées — idempotence
  confirmée. 223 produits Store API = 208 + 15, la somme boucle.
- **Règle d'arbitrage appliquée aux 11 cas (décision client du 12/07)** : l'**ISBN
  tranche** l'identité d'édition ; en cas de doublon (deux fiches disputant un même
  produit), **drop oldest** — la fiche à la parution la plus récente reçoit le
  produit natif, la plus ancienne reste sans commerce natif (mais visible au
  catalogue, jamais retirée). Trois cas relevaient de ce motif
  (`larrangement-des-sexes` 2002 perd contre `larrangement-des-sexes-
  nouvelle-edition` 2026 ; `le-capital-livre-1` 2016 perd contre `le-capital-livre-
  1-2` 2022 ; `pensee-et-langage` 2019 perd contre `pensee-et-langage-2` 2025).
  Deux cas de coquille/dérive `-prevente` résolus par candidat univoque
  (`decouvrir-gorz`, `linstitution-du-handicap`/`romuald-bodin-…`,
  `jean-marc-schiappa-decouvrir-la-revolution-francaise`). Deux fiches sans aucun
  produit correspondant (recherche exacte + similarité infructueuse sur les 223
  produits) : rien n'est écrit, rien n'est inventé.
- **Double réclamation résolue** : `stephane-haber-decouvrir-victor-hugo`
  (produit Store API id 2165) revient à la fiche du même nom ; la fiche
  `decouvrir-le-programme-du-cnr` reçoit son propre produit, jusque-là non
  réclamé (`laurent-douzou-decouvrir-le-programme-du-cnr`, id 2168).
  **⚠️ À signaler au client** : le champ ACF `buy.boutiqueUrl` de la fiche CNR
  pointe à tort vers le produit Victor Hugo dans WordPress (erreur de saisie/
  copier-coller) — la source n'est pas corrigée par ce script (contrat lecture
  seule) ; correction à faire côté WP par l'équipe.

### Gestion de stock : routeur + suivi manuel (PR #10, décision client du 12/07)

- Le routeur (distributeur commun aux deux maisons) envoie **un fichier `.xls`
  mensuel** couvrant les deux fonds (colonnes `EAN`/`TIT`/`AUT`/`ABR`/`PUB`/`FIN` —
  `FIN` = stock déclaré, EAN numérique, feuille unique `Feuille1`).
- Import : `POST /api/books/import-stock` (endpoint Payload authentifié
  admin/éditeur) + panneau admin `StockImportPanel.tsx` ; cœur pur
  `stock-import-core.ts` (XLSX/SheetJS, `normalizeIsbn` fait tomber EAN routeur et
  ISBN WordPress saisi avec espaces/tirets sur la même clé). **Le fichier écrase**
  `commerce.stock` des fiches appariées (le fichier fait foi, pas d'accumulation) ;
  `FIN` négatif ramené à 0 (artefact de compta routeur observé sur le fichier réel
  du 06/07, jamais un stock physique négatif).
- **Chiffres constatés sur le fichier réel** : **228 fiches en ligne appariées**
  au routeur (`stockSuivi: "routeur"`), **67 fiches en ligne absentes du fichier**.
  Ces 67 sont la **backlist pré-2020** : le clivage est **temporel** (elles datent
  d'avant la fusion opérationnelle du distributeur au 2020-06-03), pas une question
  de maison. Elles vivent en **suivi manuel**, comme les goodies — ce n'est **pas**
  une alerte (décision client du 12/07 : « hors routeur = suivi manuel »).
- **Rapport d'import à quatre sections** : (1) fiches appariées et mises à jour ;
  (2) lignes du fichier routeur sans fiche correspondante (compte seul — normal,
  le fichier couvre aussi le fonds papier pur) ; (3) fiches en suivi manuel absentes
  du fichier (informatif, normal) ; (4) **la vraie alerte** — fiches
  **anciennement** en `stockSuivi: "routeur"` qui disparaissent du nouveau fichier
  (titre disparu du routeur) : le stock n'est **pas** touché, `stockSuivi` reste
  `routeur`, et l'alerte **persiste** à chaque import suivant tant que l'anomalie
  n'est pas corrigée (fichier ou passage manuel assumé) — elle ne s'auto-résout
  jamais silencieusement.
- **« À paraître » prime sur le stock** : une fiche à date de parution future ne se
  vend pas même si elle est cochée vendable avec du stock en préparation (ordre de
  règles posé dans `resolveNativePurchase`, cf. moteur de disponibilité ci-dessous).
- **Alerte stock bas** : dashboard `/admin` uniquement (widget `StockLowWidget.tsx`,
  seuil `reglages-boutique.seuilAlerteStockBas`, défaut 3) — **pas d'email**.
- **Décrément automatique** à chaque commande payée (webhook, idempotent — voir
  checkout/webhook ci-dessous).

### Moteur de frais de port (PR #12, module pur `src/lib/shipping-core.ts`)

Recopie fidèle de la grille réelle (valeur du panier, pas poids), en **centimes
entiers** (jamais de flottant sur de l'argent) :

| Tranche panier TTC | Coût | Statut |
|---|---|---:|
| 0 – 10,00 € | 2,00 € | palier standard |
| 11,00 – 24,00 € | 4,50 € | palier standard |
| 25,00 – 49,00 € | 5,50 € | palier standard |
| 50,00 – 500,00 € | 6,50 € | palier standard |
| Panier « manifeste » (uniquement articles `reducedShippingFlag`) | 2,50 € | forfaitaire, prioritaire sur la grille standard |
| Coupon `free_shipping` **ET** panier ≥ 50 € | 0 € | prioritaire sur tout le reste |

Zones vendues : **FR/BE/CH uniquement**, refus explicite hors zone.

**Quatre trous non couverts par la grille publiée** — chacun tranché par une table
de décision dédiée (`GRID_HOLE_DECISIONS`, un seul point à modifier le jour de la
décision, aucun autre fichier à toucher) :

| Trou | Intervalle exact | Défaut posé (en attendant l'arbitrage) |
|---|---|---|
| 1 | **10,01 € – 10,99 €** | rattaché au palier 11–24 € (4,50 €) |
| 2 | **24,01 € – 24,99 €** | rattaché au palier 25–49 € (5,50 €) |
| 3 | **49,01 € – 49,99 €** | rattaché au palier 50–500 € (6,50 €) |
| 4 | **> 500,00 €** | **refus** avec message — hors grille automatisée, commande à traiter par email (ce n'est pas un choix de tarif) |

Le défaut conservateur retenu pour les trois premiers trous : le client ne paie
jamais moins cher que ce que la grille publiée lui donnerait droit sur le palier
voisin. **Décision client attendue le 15/07** pour chacun des trois premiers (le
quatrième n'est pas négociable : au-delà de 500 €, hors parcours automatisé).
Tests unitaires sur chaque ligne de la grille + les quatre cas limites.

*Repère historique (usage réel constaté sur les commandes Woo, pour dimensionner
l'impact des trous) : « entre 11 et 24 » 2 055 commandes · « moins de 49 » 1 269 ·
« plus de 50e » 811 · livraison gratuite 785 · « moins de 10 » 542 · « manifeste »
46. Coupons Woo natifs : **821 usages** au total (mécanisme réel — Woo Discount
Rules, 4 règles toutes désactivées, est inutilisé).*

### Adaptateur produits Postgres + flag `COMMERCE_NATIVE`

- **`COMMERCE_NATIVE`** (`'0'` par défaut) gouverne, **indépendamment** de
  `CATALOGUE_SOURCE` : à `0`, le catalogue lit la Store API WooCommerce pour les
  prix/stock/vendabilité, quel que soit le contenu des fiches (site strictement
  iso-rendu) ; à `1`, tout vient de Payload — **plus aucun appel Store API**,
  `listProducts()` n'est même plus invoqué.
- **`resolveNativePurchase`** (`src/lib/catalogue-core.ts`), ordre de règles :
  1. parution future → « à paraître », prime sur tout le reste ;
  2. `sellable` ET (`stock == null` [non suivi] OU `stock > 0`) → disponible,
     panier natif (permalien interne, mode `cart`) ;
  3. sinon lien(s) externe(s) (Paris Librairies / La Librairie) → « en librairie » ;
  4. sinon indisponible — **jamais retiré du catalogue**.
- Routes `/boutique` (liste, redirige vers `/catalogue` tant que le flag est à `0`)
  et `/boutique/[slug]` (fiche minimale, même composants panier/achat que
  `/catalogue`) pour les 15 orphelins conservés. **Absente du sitemap tant que le
  flag n'est pas passé à `1`** — à faire dans la même PR que le flip (reste à
  faire, cf. §②).

### Panier, checkout, webhook, exports (PR #12)

- **Panier client** : état `localStorage` (ids + quantités seulement, jamais de
  prix côté client), badge dans l'en-tête, `/panier` réel avec re-validation
  serveur.
- **Checkout** `POST /api/checkout` : garde `COMMERCE_NATIVE` vérifiée **en tout
  premier**, avant même de lire le corps de la requête (503 sinon, défense en
  profondeur). Re-validation serveur **intégrale** depuis Payload : prix,
  vendabilité/stock, code promo, zone — le client n'envoie que `{id, qty}` + zone +
  code promo optionnel. Session Stripe Checkout `mode: payment`, invité uniquement,
  locale `fr`, `metadata.kind: "order"` (dupliquée sur `payment_intent_data` — c'est
  ce qui permet à `charge.refunded` de la porter aussi).
- **Webhook** (`src/app/api/stripe/webhook/route.ts` + `order-handler.ts`) étendu
  par discrimination `metadata.kind` : chemin dons intact (aucune écriture, best
  effort) ; chemin `order` délégué en entier au handler commande — **création de
  la commande idempotente par `stripeSessionId`** (un event rejoué ne recrée pas la
  commande) et **décrément de stock idempotent au rejeu** (le décrément ne
  s'applique qu'à la première écriture de la commande, jamais deux fois) ;
  `charge.refunded` retrouve la commande par `stripePaymentIntentId` et passe son
  statut à `refunded` **sans re-créditer le stock** (décision assumée — le
  réassort reste un geste humain, pas un automatisme).
- **Emails de commande** : interface `OrderMailer`/`OrderMailPayload` posée
  (`src/lib/order-mail.ts`), implémentation **LOG uniquement** pour l'instant — ne
  jette jamais (un échec d'envoi ne doit pas faire échouer le webhook, la commande
  est déjà en base). Le reçu Stripe natif couvre déjà la confirmation immédiate ;
  Brevo (compte provisionné par la phase communication) vient combler l'interface
  sans rien débloquer entre-temps.
- **Exports CSV** (`src/lib/order-export.ts` + `order-export-handler.ts`,
  `GET /api/orders/export/{preparation,compta}`, bornes `from`/`to`) :
  - **« préparation »** — décalque exact du profil Advanced Order Export
    réellement utilisé : `E-mail du client, Article #, UGS(ISBN), Nom, Quantité,
    Prix du produit, Code de coupon, Réduction` (statuts `paid`/`prepared`).
    L'UGS Woo était vide (0/223 SKU) — le nouvel export y met l'ISBN, amélioration
    gratuite.
  - **« compta »** — n° commande, dates, statut, email, adresses complètes
    facturation/livraison, total TTC, port TTC, remise TTC, **part TVA 5,5 %
    calculée** (`TTC / 1,055`, jamais recalculée au checkout — conforme à
    `woocommerce_calc_taxes = no`), moyen de paiement, référence Stripe
    (PaymentIntent).
  - **Les colonnes exactes restent une décision client** (cf. §②) — celles
    ci-dessus sont livrées et fonctionnelles, mais pas encore formellement
    validées par la personne compta.

### État du build

Sans lien direct avec `main..HEAD` de cette phase mais support de la fenêtre de
bascule commune : le build `CATALOGUE_SOURCE=pg` est **vert, 316/316 pages, zéro
appel WordPress** (PR #9, catalogue) — l'adaptateur produits Postgres du commerce
s'appuie sur les mêmes fiches `books`, donc sur la même preuve de fraîcheur.

---

## ② Ce qui reste avant le jour J

### Décisions client — tranchées le 13/07 (relayées par Youri), reste le 15/07

| # | Question | Décision |
|---|---|---|
| 1–3 | **Trous de la grille de port** (10,01–10,99 · 24,01–24,99 · 49,01–49,99 €) | **TRANCHÉ 13/07 : grille lissée** — chaque palier s'étend jusqu'au centime sous le suivant (`shipping-core.ts`), tarifs inchangés (ex-défaut « palier supérieur » entériné). Refus > 500 € conservé |
| 4 | **Colonnes exactes des deux exports** (préparation + compta) | **VALIDÉ 13/07 (délégué à Youri)** : colonnes conservées telles quelles — la préparation est le décalque exact du profil Advanced Order Export déjà utilisé par le client, la compta porte adresses, totaux, part TVA 5,5 % et référence Stripe |
| 5 | **Backlist pré-2020 (67 fiches) + toute fiche sans produit Woo apparié** | **TRANCHÉ 13/07 : tout ce qui est sur le site est vendable** — `sellable` par défaut à true + backfill (migration `20260713_035502`), stock en **suivi manuel** (fallback goodies) tant que le routeur ne les réintègre pas ; disponibilité gouvernée par le stock (0 = épuisé) et « à paraître » |
| 6 | Contenus légaux bloquants pour un site public sur domaine réel : **SIRET, directeur de publication** (placeholders aujourd'hui) | Cf. `plan/02`, pages légales — bloquant pour le flip, pas urgent pour le dev (confirmé 13/07) ; contenus client attendus avec les paliers le 20/07 |
| 7 | **Q1–Q8 du plan `02-mise-en-production.md`** (destinations des pages orphelines, sort des domaines défensifs, reçus fiscaux, date/modalités du transfert de propriété…) | Voir `plan/02` — hors commerce mais sur le chemin critique de la même fenêtre de bascule |
| 8 | **Date de la fenêtre de bascule** | 21/07 devenu **agressif** maintenant que le commerce y entre (plus de marge de préparation qu'un simple flip catalogue) ; **24–28/07 réaliste** ; butée = campagne dons du 15/08, qui ne doit pas glisser |

### E9 résiduel — intégrations à finir avant le jour J

- **E2E Stripe en clés TEST sur preview** : parcours d'achat complet rejoué sur
  preview Vercel (clés test) — panier multi-lignes, chaque tranche de port + les
  quatre trous, promo valide/expirée/sous-minimum, livre passé `stock=0` entre
  panier et checkout (refus propre), pays hors FR/BE/CH refusé. Pas encore fait.
- **Brevo** : compte + branchement des emails de commande (l'interface
  `OrderMailer` est prête et n'attend que l'implémentation réelle — cf. §①) ;
  dépend du provisioning Brevo (phase communication).
- **Formation équipe Payload `/admin`** : prise en main du back-office commandes
  (suivi `paid → prepared → shipped`), de l'import stock routeur (panneau + lecture
  du rapport à 4 sections), des codes promo, des exports CSV. Pas encore faite.

---

## ③ Jour J et drainage

Le commerce ne bascule plus seul : il fait partie de la **fenêtre de bascule
unique** (catalogue + commerce + DNS + indexation), déroulée en **un seul
runbook**, désormais documenté dans `plan/02-mise-en-production.md` (section
Jour J) — **ce document ne le duplique pas**, seul le résumé commerce-pertinent
suit.

**Résumé côté commerce, dans l'ordre** :

1. **Gel d'édition WordPress** (catalogue **et** boutique) — dernière écriture
   possible avant migration finale.
2. **Migration finale** : `migrate-products.ts` rejoué sur un export frais (prix/
   stocks/produits à jour à l'exposition, pas au moment où ce document a été
   écrit) ; `migrate-catalogue` idem côté fiches. Idempotence déjà prouvée sur les
   deux scripts — le re-run ne fait que refléter le delta.
3. **`compare-sources`** : zéro divergence bloquante entre WordPress et Postgres
   avant de couper la source WordPress (déjà 0 sur la dernière passe, PR #9).
4. **Déploiement** : `CATALOGUE_SOURCE=pg` **et** `COMMERCE_NATIVE=1` **et**
   `SITE_INDEXABLE=1` **et** `NEXT_PUBLIC_SITE_URL` posés **dans la même fenêtre**
   de redéploiement — plus deux bascules de flag séparées à des dates différentes.
5. **Flips DNS** (ES, LD, boutique en CNAME Vercel) + redirections 302 + proxy
   `/wc-api/*` vers `cms-boutique` (callbacks Paybox résiduels des commandes en
   cours de traitement).
6. **Smoke tests** : 1–2 commandes réelles à faible montant, remboursées via le
   dashboard Stripe (démonstration du geste SAV au passage).
7. **`/boutique` et `/boutique/[slug]`** entrent dans `sitemap.ts` au moment du
   flip (pas avant — ces routes redirigent vers `/catalogue` tant que
   `COMMERCE_NATIVE=0`).

**Recouvrement (drainage), défaut ~2 semaines** :

- **wp-admin accessible via `cms-boutique`** pour drainer les **107 commandes
  `wc-processing`** (chiffre vérifié en base au 01/07 — le chiffre réel au gel sera
  celui constaté ce jour-là) : expédier ou annuler manuellement, callbacks Paybox
  routés via le proxy `/wc-api/*` pendant la fenêtre.
- Passage **302 → 301** des redirections `/produit/<slug>/` une fois le
  recouvrement validé et l'accord client écrit obtenu (jamais avant).
- `cms-boutique` est désormais **obligatoire** pour ce drainage (ce n'est plus un
  filet optionnel) ; `cms-es`/`cms-ld` restent une assurance pas chère mais ne
  conditionnent aucun geste commerce.

Détail complet (séquence horaire, IDs de records DNS, garde-fous Host/undici,
proxy exact, checklist post-bascule) : **`plan/02-mise-en-production.md`**.

---

## ④ Post-bascule

- **Résiliation du contrat Paybox** (VAD, banque du client) : **décision client**,
  **après drainage complet** des commandes en cours — jamais avant le cutover, et
  jamais à la place du client (démarche commerciale côté Paybox, hors périmètre
  technique). Le compte Stripe live (`acct_1TqsjgL6ffEZ7VRj`, opérationnel depuis
  le 11/07) est désormais **le** compte d'encaissement, dons et commandes
  confondus ; les payouts changent de canal bancaire à la bascule — nommé
  explicitement au client, ce n'est pas une migration invisible.
- **Archive avant extinction** (bloquant, condition sine qua non) : dump SQL
  complet de `editionsk884`, CSV commandes aplati (**5 753** commandes du
  2018-03-14 au dernier jour Woo — `wc-completed` 4 472, `wc-cancelled` 1 061,
  `wc-processing` 107, `wc-failed` 103, `wc-refunded` 10), CSV clients (**1 329**,
  `mod973_wc_customer_lookup`), CSV abonnés newsletter (**2 848** confirmés —
  ⚠️ liste figée depuis un import unique d'octobre 2020, à signaler avant tout
  envoi Brevo), copie de `wp-content` de l'install Boutique. **Confirmée saine**
  seulement quand : le dump se restaure et les comptages collent à la prod au jour
  de l'export, les CSV s'ouvrent et leurs totaux recoupent les chiffres ci-dessus,
  et le client a vérifié 5 commandes connues de lui et confirmé **par écrit**.
  Aucune extinction du WordPress Boutique avant cette confirmation écrite.
- L'extinction elle-même (301 définitifs, mise hors ligne réversible, nettoyage du
  code, PV) est portée par la clôture du chantier (`plan/07-cloture.md`) — cette
  page fournit les livrables (archive, table de matching produit→URL, logs
  d'accès `/wc-api/*` pendant le recouvrement), elle n'exécute pas la semaine de
  clôture.

---

## Repères de données conservés (toujours vrais, base WooCommerce `editionsk884`)

- **HPOS désactivé** (`woocommerce_custom_orders_table_enabled=no`) : les tables
  `wc_orders*` sont **vides** — source de vérité = `mod973_posts`
  (`shop_order`) + `mod973_postmeta` + `mod973_woocommerce_order_items`/
  `order_itemmeta`. Ne pas s'y fier pour un export ou un comptage.
- **Paiement** : `paybox_std` 5 566 + `paybox_3x` 40 + `cheque` 97, **zéro
  commande Stripe historique** — Paybox est la passerelle vivante, pas un vestige
  (`woocommerce_stripe_settings.enabled = "no"`, compte Stripe Woo caché = compte
  test abandonné). Le changement de PSP (Paybox → Stripe) est un **vrai**
  changement, pas une continuité invisible.
- **`woocommerce_enable_guest_checkout = no`** aujourd'hui — le nouveau site en
  guest-only (décision produit assumée) est un changement de pratique pour les
  1 329 clients qui avaient un compte ; leur historique est préservé dans
  l'archive, pas dans le nouveau site.
- **TVA** : `woocommerce_calc_taxes = no` — aucune taxe calculée en base
  aujourd'hui ; prix TTC partout, la part 5,5 % n'existe que dans l'export compta
  (calculée, jamais recalculée au checkout).
- **Legacy REST API** : 0 clé API, 0 webhook — aucun consommateur externe
  authentifié ; le seul utilisateur de `wc-api` est Paybox (mécanisme cœur
  WooCommerce, pas le plugin Legacy REST) — dette déjà tracée à 95 %, la preuve
  définitive (logs prod pendant le recouvrement) reste un livrable de fin de
  drainage.

---

## Risques et parades (ceux qui restent pertinents post-merge)

| # | Risque | Parade |
|---|---|---|
| 1 | **Changement de PSP réel** (Paybox → Stripe) : payouts sur un autre canal, réconciliation compta différente, contrat VAD à résilier | Nommé explicitement au client ; export compta avec `stripePaymentIntentId` pour la réconciliation ; résiliation Paybox = action client, après drainage (cf. §④) |
| 2 | **Grille de port mal recopiée** ou trous laissés en silence | Module pur testé ligne à ligne + les quatre cas limites (10,50/24,50/49,50/600 €) ; décision explicite du client sur les trois trous restants avant le jour J, jamais un défaut qui s'impose par oubli |
| 3 | **Décrément de stock en double** au rejeu d'un webhook Stripe | Idempotence par `stripeSessionId` posée dans `order-handler.ts` — la commande ET le décrément ne s'appliquent qu'à la première écriture, vérifié par test |
| 4 | **Backlist pré-2020 mal traitée** (67 fiches hors routeur) : traitée à tort comme une anomalie de stock plutôt qu'un fonds papier normal | Rapport d'import à 4 sections : ces fiches apparaissent en section informative « suivi manuel », jamais en section alerte ; alerte réservée aux fiches qui **disparaissent** du routeur après y avoir été |
| 5 | **Emails de commande jamais envoyés** faute de Brevo branché | Interface `OrderMailer` déjà posée et ne jette jamais ; reçu Stripe natif couvre la confirmation immédiate en attendant ; brancher Brevo reste sur la liste §② |
| 6 | Divergence prix/stock entre le run de migration et la réalité au jour J | Scripts idempotents, **rejoués sur export frais** juste avant le flip (cf. `plan/02`), jamais seulement au moment où ce document a été écrit |
| 7 | Fin du guest-checkout-interdit : 1 329 clients avaient un compte, le nouveau site n'en a pas | Changement de pratique assumé ; historique client préservé dans l'archive ; communication lecteurs au cutover |
| 8 | Colonnes d'export non validées par la personne compta | Les deux profils sont livrés et fonctionnels (§①) ; validation formelle = décision client encore ouverte (§②), pas un blocage technique |

---

## Dépendances et interfaces avec les autres phases/documents

- **`plan/02-mise-en-production.md`** — possède le runbook du jour J (DNS, TTL,
  redirections, garde-fous Host/undici, checklist post-bascule) ; ce document n'en
  fournit qu'un résumé côté commerce (§③).
- **`plan/03-catalogue.md`** — la collection `books` et l'adaptateur
  `pgCatalogueSource` sont la fondation sur laquelle `commerce.*` est posé ; le
  swap `CATALOGUE_SOURCE=pg` et le flip `COMMERCE_NATIVE=1` sont désormais
  **dans la même fenêtre**, pas deux événements séparés dans le temps.
- **Phase communication (Brevo)** — fournit le compte + `src/lib/brevo.ts` qui
  vient combler l'interface `OrderMailer` déjà posée ; le CSV abonnés de
  l'archive (2 848, import 2020) est un intrant partagé à signaler avant tout
  envoi.
- **`plan/07-cloture.md`** — possède la semaine de clôture (301 définitifs,
  extinction WordPress Boutique, PV) ; cette page **fournit** les livrables
  (archive, table de matching, logs `/wc-api/*`), elle n'exécute pas l'extinction.
- **Invariants inchangés** : MX/emails jamais touchés ; un livre n'est jamais
  retiré du catalogue faute d'être en vente ; le stock est décrémenté seulement à
  la commande **payée** ; le rollback du flag `COMMERCE_NATIVE` reste un re-flip à
  une ligne tant que Woo n'est pas éteinte.

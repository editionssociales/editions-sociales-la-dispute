Inventaire complet. Voici le document final.

# RECON R2 — Inventaire des données réelles (dumps SQL du 2026-07-01)

**Source** : MariaDB locale `127.0.0.1:3307` (root, sans mot de passe), 4 bases chargées : `editionskes` (ES, préfixe `es_`), `editionsk712` (LD, préfixe `es_`), `editionsk884` (Boutique, préfixe `mod973_`), `editionsk896` (GEME, non inspectée — hors périmètre). Dumps : `/Users/yourihamon/marina_es/_databases/*.20260701.sql.gz`. Toutes les tables sont en `utf8mb4_unicode_ci` (pas de piège latin1). Rien n'a été modifié.

---

## 1. Catalogue ES (`editionskes`) et LD (`editionsk712`)

### 1.1 Volumes

| | ES | LD |
|---|---|---|
| CPT `catalogue` publiés | **117** | **176** |
| Brouillons/autres statuts | **0** | **0** |
| `post_content` (résumé) vide | 0 | 0 |
| `_thumbnail_id` (couverture) | 117/117 | 176/176 (thumbnails tous distincts) |

**La base LD est un clone historique de la base ES** : mêmes IDs pour les posts `livre` (80, 115), même groupe ACF ID 98. Un CPT legacy `livre` (2 posts publiés identiques dans chaque base : « Principes du communisme », « Annales franco-allemandes ») existe encore — invisible du front, à ignorer ou archiver.

### 1.2 Champs ACF — définitions (posts `acf-field`, 10 champs par site, PAS 16)

3 groupes par site : « Informations complémentaires », « Pour aller plus loin », « Extraits ». Champs (`post_excerpt` = meta_key) :

| meta_key | Type ACF | ES field_key | LD field_key | Notes |
|---|---|---|---|---|
| `isbn` | text | field_5f3a88af147b1 | idem | LD : valeurs avec **espace final** fréquent (`"9782843033612 "`) → TRIM obligatoire |
| `nombre_pages` | number | field_5f3a8935147b2 | idem | |
| `date_parution` | date_picker | field_5f3a8967147b3 | idem | stocké **`YYYYMMDD`** (ex. `20260904`) |
| `prix` | number | field_5f3a89d9147b4 | idem | décimales possibles (`9.99`) |
| `parislibrairies` | url | field_5f8439bf42572 | field_351 | |
| `lalibrairie` | url | field_5f8439e142573 | field_352 | |
| `boutique_es` | url | field_5fa959f547594 | field_375 | **URL produit Woo** — la clé de matching |
| **ES : `pour_aller_plus_loin`** / **LD : `plus_loin`** | wysiwyg | field_5f7e40539df23 | field_5f7e40efe14f4 | ⚠️ **noms divergents entre sites**, voir 1.3 |
| `table` | file (pdf) | field_5f84394dd0efe | field_346 | valeur = ID d'attachment |
| `extrait_choisi` | file (pdf) | field_5f84396ad0eff | field_347 | quasi vide partout |

### 1.3 Taux de remplissage (postmeta non vides, sur posts publiés)

| meta_key | ES (/117) | LD (/176) |
|---|---|---|
| `isbn` | 117 | 176 |
| `date_parution` | 117 | 176 |
| `prix` | 117 | 176 |
| `nombre_pages` | 115 | 176 |
| `lalibrairie` | 108 | 163 |
| `parislibrairies` | 107 | 164 |
| `boutique_es` | **95** (106 rows) | **118** | 
| `plus_loin` | **47** (84 rows) | 58 |
| `pour_aller_plus_loin` | **6** (59 rows) | — (absent) |
| `table` | 53 | 62 |
| `extrait_choisi` | **2** | **1** |
| legacy : `presse` (ES, 4 rows, 0 non vide) · `revues_de_presse` (LD, 5 rows, 3 non vides) | | |

⚠️ **Piège `plus_loin`/`pour_aller_plus_loin` côté ES** : les deux meta_keys pointent vers le **même** field_key `field_5f7e40539df23` (champ renommé en cours de vie). Les données anciennes sont sous `plus_loin` (47 non vides), les récentes sous `pour_aller_plus_loin` (6). **Le script de migration ES doit lire les deux clés et prendre la non-vide** ; vérifier ce que le mu-plugin renvoie aujourd'hui (risque de perte des 47 anciennes valeurs si `get_field` ne lit que le nom actuel).

### 1.4 Taxonomies

| Taxonomie | ES : termes / assignations | LD : termes / assignations |
|---|---|---|
| `auteur` | 120 / 160 | 202 / 230 |
| `collection` | 9 / 117 | 6 / 173 |
| `parution` | 1 terme (« À paraître ») / 4 posts | 1 terme / 1 post |

- `parution` n'est **pas** une date : c'est un simple **drapeau « À paraître »** (1 seul terme, slug `a-paraitre`).
- Chaque livre a **au plus 1 collection** (0 multi-collection) ; ES : 0 sans collection, LD : **3 sans collection** ; ES : **1 livre sans auteur**.
- Collections ES : Les propédeutiques 34, Les essentielles 24, GEME 14, Histoire 12, Les éclairées 10, Les parallèles 9, Hors collection 8, Les irrégulières 5, Ancien fonds 1. LD : Hors collection **94**, Le genre du monde 25, L'enjeu scolaire 21, Travail et salariat 19, Entretiens 10, Les lettres bleues 4.
- Taxonomies mortes : `category`, `post_tag` (0 assignation utile).

### 1.5 Couvertures

- Attachments : ES 351 (255 jpeg, 28 png, 68 pdf) ; LD 435 (319 jpeg, 32 png, 84 pdf). Les PDF = `table`/`extrait_choisi`.
- Fichier : `_wp_attached_file` (ex. `2020/08/Principes_Couv1.jpg`), métadonnées `_wp_attachment_metadata` (sérialisé PHP) avec **7 tailles** : `thumbnail` 150×150, `medium` ~175×300, `medium_large` 768, `large` ~597×1024, `1536x1536`, `2048x2048`, `post-thumbnail` 1200. Originaux jusqu'à ~1205×2067, certains `-scaled` (>2560px).
- Poids des uploads (miroirs locaux) : **www 427 Mo + LaDispute 562 Mo ≈ 0,99 Go** (catalogues) + Boutique 441 Mo. Le « ~1 Go de couvertures » inclut en réalité toutes les tailles générées + PDF ; **les originaux seuls sont nettement plus légers**.

---

## 2. Boutique (`editionsk884`, WooCommerce 10.9.1)

### 2.1 Produits

- **223 publiés** (+1 auto-draft), tous `simple`, gérés en stock (`_manage_stock=yes` : 222/223), **33 en rupture** (`_stock_status=outofstock`).
- **`_sku` : 0 rempli sur 223** → **aucun ISBN côté Woo**. **`_weight` : 6 produits seulement** (247/227/256/252 g + 2×5000 g). Pas de galerie (`_product_image_gallery` : 0), 1 image par produit (`_thumbnail_id` : 223/223). `_sale_price` : 1 seul. `post_content` vide : 9/223.
- ⚠️ **Les `post_title` produits contiennent du HTML** (`<i>…</i>`) et souvent le nom d'auteur (« Karl Marx, <i>… </i> ») → normalisation nécessaire, ne pas matcher par titre.
- `product_cat` mélange maisons et collections : La Dispute 110, Editions sociales 104, Hors collection 54, Les Propédeutiques 30, … + catégories mortes (Défraichis, Covid, Totebag : 0).
- Prix : `_price`/`_regular_price` 223/223, TTC (`woocommerce_prices_include_tax=yes`), EUR.

### 2.2 Matching produit ↔ fiche catalogue

**La clé est `boutique_es` (URL `https://boutique.editionssociales.fr/produit/<slug>/`) côté catalogue → `post_name` produit.** Résultat du join croisé (slug extrait de l'URL) :

- ES : 95 liens → **92 matchés**, 3 cassés (`karl-marx-le-capital-livre-1`, `jean-marc-schiappa-decouvrir-la-revolution-francaise`, `celine-marty-decouvrir-gorz-prevente`).
- LD : 118 liens → **112 matchés**, 6 cassés (dont 2× Pensée et langage, un slug avec **`%e2%80%89`** encodé — espace fine U+2009 dans le slug → décoder les URL avant comparaison).
- **20 produits publiés sans aucune fiche catalogue** : manuels « Je lis, j'écris » (CP/CE1/CE2 ×5), Correspondance Marx-Engels tomes 3/5/7, Jaurès Histoire socialiste, Ortho vert, etc. — dont plusieurs correspondent aux liens cassés côté catalogue (**dérive de slug après re-nommage post-prévente** : `…-prevente` → slug final). Le script doit réconcilier par slug, puis rattraper les ~9 cassés à la main ou par similarité de titre.
- Bilan : 293 livres, **213 avec lien boutique (204 valides)** ; ~80 livres sans produit (épuisés/à paraître) ; 20 produits sans fiche.

### 2.3 Commandes — ⚠️ HPOS DÉSACTIVÉ

`woocommerce_custom_orders_table_enabled=no` → les tables `mod973_wc_orders*` sont **vides**. **Source de vérité : `mod973_posts` (`post_type='shop_order'`) + `mod973_postmeta` + `mod973_woocommerce_order_items`/`order_itemmeta`.**

- **5 753 commandes**, du **2018-03-14** au **2026-07-01**. Statuts : `wc-completed` 4 472, `wc-cancelled` **1 061 (18 %)**, `wc-processing` 107, `wc-failed` 103, `wc-refunded` 10 (+10 posts `shop_order_refund`).
- Par an : 2018:71 · 2019:48 · 2020:279 · 2021:605 · 2022:680 · 2023:655 · 2024:1306 · 2025:1493 · 2026:616. **12 derniers mois : 1 399** (~117/mois confirmé).
- Meta commandes complètes pour l'export : `_billing_*`, `_shipping_*`, `_order_total`, `_order_shipping`, `_payment_method`, `_transaction_id` (4 532), `_date_paid`, `_date_completed`, `_customer_user`, etc. Items : `_product_id`, `_qty`, `_line_total`… **`woe_order_exported` présent sur 4 888 commandes → l'export compta (Advanced Order Export) est bel et bien utilisé activement.**
- Pays de livraison : **FR 5 054, BE 341, CH 168, IT 1**.

### 2.4 Paiement — ⚠️ CORRECTION MAJEURE DES ACQUIS

- `_payment_method` : **`paybox_std` 5 566 + `paybox_3x` 40 + `cheque` 97. ZÉRO commande Stripe, jamais** (2018→2026-07, dernières commandes du 01/07/2026 incluses en Paybox).
- `woocommerce_stripe_settings` : **`enabled = "no"`** — la passerelle Stripe est installée mais **désactivée**, et le compte Stripe caché en option est un **compte TEST** (`wcstripe_cache_test_account_data`, acct_1SQlxX…, webhooks test lancés ~26/06/2026 — vraisemblablement une tentative récente de configuration).
- **Paybox n'est pas « morte » : c'est la passerelle de production active** (~1 500 commandes/an, table dédiée `mod973_wc_paybox_payment`). Le postulat « ils sont déjà sur Stripe, migration invisible » **est faux en l'état des données** : la bascule Stripe sera un vrai changement de PSP pour les payouts (le compte Stripe existant est en mode test, à passer en live ou à remplacer).
- **→ Mise à jour 11/07 (orchestrateur)** : constat confirmé en live (checkout de test du 11/07, commande 7730 → formulaire `PBX_*` Paybox, `PBX_VERSION woocommerce-paybox-0.9.9.9`). Et tranché : un **nouveau compte Stripe live opérationnel** existe (`acct_1TqsjgL6ffEZ7VRj` « Éditions sociales », charges/payouts activés, 0 pièce due — vérifié par API), clé dans `site/.env`. Le compte test `acct_1SQlxX…` est abandonné (nettoyage de ses webhooks : phase 7).

### 2.5 Clients

- `mod973_wc_customer_lookup` : **1 329** clients, tous avec `user_id`. `mod973_users` : **1 220** (1 219 rôle `customer` + 1 `administrator`).
- ⚠️ **`woocommerce_enable_guest_checkout = no`** : l'achat invité est **interdit** aujourd'hui — chaque acheteur a un compte WP. Le nouveau site en guest-only est un changement de pratique (OK produit, mais à assumer) ; la table users est à inclure dans l'archive.

### 2.6 Newsletter (plugin The Newsletter, tables `mod973_newsletter*`)

- `mod973_newsletter` : **2 848 status `C` (confirmés) + 7 `U` (désinscrits)**, 0 non-confirmés. Listes : `list_1` = 1 983, `list_2` = 875 (vraisemblablement ES/LD).
- ⚠️ **`created` : min 2020-10-20, max 2020-10-21** → la liste entière est un **import unique d'octobre 2020, aucune inscription depuis 5 ans et demi**, et **3 emails envoyés en tout** (`newsletter_emails`). La « preuve de consentement » pour Brevo sera fragile (import 2020, pas d'opt-in tracé en base) ; colonnes dispo : `email,name,surname,status,token,created,ip,wp_user_id,…`. `sgpb_subscribers` (Popup Builder) : 0.

### 2.7 Livraison — grille EXACTE (zone + méthodes)

Réglages : `woocommerce_weight_unit = g`, **ventes restreintes** `woocommerce_allowed_countries = specific → [BE, FR, CH]` (on ne PEUT PAS commander d'ailleurs).

**Zone 2 « France, Belgique, Suisse »** (BE/FR/CH), tables `mod973_woocommerce_shipping_zones`/`_zone_locations`/`_zone_methods`, réglages dans `mod973_options` (`woocommerce_<method>_<instance>_settings`) :

| Instance | Méthode | Titre | Actif | Règle exacte | Coût |
|---|---|---|---|---|---|
| 12 | free_shipping | Livraison gratuite | **oui** | `requires=both` : **coupon free-shipping ET min 50 €** (`ignore_discounts=no`) | 0 € |
| 19 | flexible_shipping_single | « moins de 10 » | **oui** | condition **`value`** (valeur panier) 0–10 € | **2,00 €** |
| 21 | flexible_shipping_single | « entre 11 et 24 » | **oui** | `value` 11–24 € | **4,50 €** |
| 20 | flexible_shipping_single | « moins de 49 » | **oui** | `value` 25–49 € | **5,50 €** |
| 22 | flexible_shipping_single | « plus de 50e » | **oui** | `value` 50–500 € | **6,50 €** |
| 24 | flexible_shipping_single | « manifeste » | **oui** | condition **`weight`** 250–260 g, `cart_calculation=package` | **2,50 €** |
| 14 | flexible_shipping_single | « manifeste » (v1) | non | `weight` 200–250 g | 2,50 € |
| 7 | flexible_shipping (conteneur converti) | — | non | vide (`converted=yes`) | — |

**Zone 0 « Reste du monde »** : flat_rate instance 2 « Forfait » 15 € — **DÉSACTIVÉ** (cohérent avec la restriction FR/BE/CH). Le « forfait reste du monde » des acquis n'est **pas actif**.

⚠️ Corrections/pièges : (1) la grille est **à la VALEUR du panier, pas au poids** — seule la règle « manifeste » (un livre de 252 g) est au poids, et seuls 6 produits ont un poids en base ; (2) **trous de grille** : paniers de 10–11 € et 24–25 € ne matchent aucune règle (à reproduire tel quel ou corriger avec le client) ; >500 € non couvert ; (3) usage réel sur commandes (`order_items` type `shipping`) : entre 11 et 24 : 2 055 · moins de 49 : 1 269 · plus de 50e : 811 · **Livraison gratuite : 785** · moins de 10 : 542 · manifeste : 46 · anciennes méthodes disparues : « moins de 25 » 44, « Forfait Italie » 1, « moins de 30 » 1. Grille modifiée pour la dernière fois ~2026-01-28 (`method_rules_update_time`).

### 2.8 Remises / TVA

- **Woo Discount Rules (`mod973_wdr_rules`) : 4 règles, TOUTES `enabled=0`** (3 exemples du plugin + 1 « Règle sans titre » −5 % datée déc. 2025), `wdr_order_discounts` : **0 usage**. Le plugin est **inutilisé** — la « seule règle en base » est désactivée.
- **Le vrai mécanisme de remise = coupons Woo natifs** : 821 usages sur commandes. 10 coupons en base (dont expirés) : noël2024 (fixed_cart 8 €, 60 usages), Agreg2027 (**free_shipping**, 0 €, 15 usages, expire ~07/2026 — c'est lui qui déclenche « Livraison gratuite »), FGPCAPITAL/capital2019/Capital2021 (20 € fixed_cart)… + codes **supprimés mais historisés** dans les commandes : seve2025 (353 !), theories2024 (164), printemps (110), noel2025 (70).
- **TVA : `woocommerce_calc_taxes = no`** — la boutique **ne calcule AUCUNE taxe** (prix TTC, `_order_tax` à 0, 20 lignes `tax` historiques seulement). Les taux configurés (dormants) sont **20 %** (2 lignes `woocommerce_tax_rates`), classes `taux-reduit`/`taux-zero` existantes, **3 produits** seulement en `taux-reduit`. Le « 5,5 % configuré » des acquis est faux : **la TVA 5,5 % est une exigence métier, pas un existant à recopier** — la compta TVA se fait manifestement hors Woo.

---

## 3. Dette Legacy REST API — traçage RÉSOLU

- `mod973_woocommerce_api_keys` : **0 clé**. `mod973_wc_webhooks` : **0 webhook**. `woocommerce_api_enabled = yes` ; plugin activé le **2024-03-01** (préventivement, avant la suppression du cœur WC 9.0).
- **Aucun consommateur authentifié possible** (pas de clé) → rien d'externe ne dépend de l'API legacy JSON.
- Le suspect « export compta » est innocenté : `woo-order-export-lite` est un plugin wp-admin (meta `woe_order_exported`), zéro référence à `wc-api` dans son code.
- **Le vrai utilisateur de `wc-api` est Paybox** (miroir : `paybox-woocommerce-gateway/class/wc-paybox-abstract-gateway.php` L71, 286–296 : hooks `woocommerce_api_*` pour les callbacks IPN/retour). Mais c'est le mécanisme **du cœur WC** (query var `wc-api`), PAS l'API legacy du plugin. → **Le plugin Legacy REST API est très probablement supprimable sans casse** ; à re-vérifier en prod (logs serveur sur `/wc-api/v3`) par acquit de conscience, tant que Paybox reste la passerelle il ne faut pas confondre les deux mécanismes.

---

## 4. Surprises / incohérences (au-delà des corrections ci-dessus)

1. **Base `1413613-1` = un vieux site Joomla** (tables `jom_*`) — l'ancêtre pré-WordPress, abandonné. Question ouverte de LEGACY-STACK §11 résolue : résiliable après archivage du dump.
2. Tables **Wordfence** (`mod973_wf*`, ~25 tables) dans la boutique : le plugin a été retiré mais **ses tables restent** (poids mort dans les 95 Mo de la base).
3. ES a **2 posts `everest_form`** en base alors que le plugin n'y est pas installé (résidu du clonage ES→LD).
4. Champs legacy quasi vides à ne PAS migrer : `presse` (ES), `revues_de_presse` (LD), `extrait_choisi` (2+1 remplis en tout), CPT `livre`.
5. ES : 103 `_wp_old_date`, LD : 173 — dates de publication massivement retouchées (le `post_date` n'est pas fiable comme date de parution ; utiliser `date_parution` ACF, remplie à 100 %).
6. `_ame_cpe_post_policy` (Admin Menu Editor) sur 27 posts LD — bruit d'extension, à ignorer.
7. Taux d'annulation élevé : 1 061 `wc-cancelled` (18 %) — typique des retours Paybox non finalisés ; à garder en tête pour les stats de l'archive.
8. Emails de commande envoyés depuis `administrer@editionssociales.fr` (« La Boutique des Éditions sociales »).

## 5. Ce que les scripts de migration doivent lire (récap opérationnel)

- **Catalogue** (par site) : `es_posts` (type `catalogue`, status `publish` : title/slug/content) ; `es_postmeta` : `isbn`(TRIM), `prix`, `nombre_pages`, `date_parution`(Ymd), `parislibrairies`, `lalibrairie`, `boutique_es`, `table`/`extrait_choisi`(IDs d'attachment), **ES : COALESCE(`pour_aller_plus_loin`,`plus_loin`) / LD : `plus_loin`**, `_thumbnail_id` ; `es_term_relationships`+`es_term_taxonomy`+`es_terms` pour `auteur`/`collection`/`parution`(=flag à-paraître) ; `_wp_attached_file`+`_wp_attachment_metadata` pour les covers (rapatrier l'original, régénérer les tailles).
- **Produits** : `mod973_posts` (type `product`) + `mod973_postmeta` (`_price`,`_regular_price`,`_stock`,`_stock_status`,`_thumbnail_id`) + `product_cat`. Titres à dé-HTML-iser. Jointure par slug depuis `boutique_es` (URL-decode), rattrapage manuel ~9 liens cassés + 20 produits orphelins.
- **Archive commandes/clients** : `mod973_posts`(shop_order)+`mod973_postmeta`+`mod973_woocommerce_order_items`+`_itemmeta`+`mod973_users`/`usermeta`+`mod973_wc_customer_lookup` (HPOS vide, ne pas s'y fier).
- **Newsletter** : `mod973_newsletter` WHERE `status='C'` (2 848 ; consentement = import 2020, à signaler au client avant Brevo).
- **Port/livraison** : grille de la section 2.7 à recopier (décider avec le client du sort des trous 10–11 € / 24–25 € et de la règle « manifeste »).
- **À remonter à l'orchestrateur en priorité** : Stripe Woo désactivé + compte test (le postulat payouts unifiés est à re-valider — **tranché le 11/07 : nouveau compte live opérationnel, cf. §2.4**), Paybox = passerelle vivante, TVA non calculée en base, guest checkout interdit aujourd'hui, newsletter figée depuis 2020, Legacy REST API sans consommateur.
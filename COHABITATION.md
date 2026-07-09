# Plan de cohabitation — ancien(s) site(s) WordPress vs nouveau site unifié

Objectif : construire et valider le nouveau site (Next.js, headless) **sans jamais
interrompre** les 3 sites WordPress actuels (editionssociales.fr, ladispute.fr,
boutique.editionssociales.fr), jusqu'au jour du basculement.

## Pourquoi c'est possible sans risque

Le nouveau site est **lecture seule** vis-à-vis des WordPress existants (API REST
+ WooCommerce Store API). Il ne modifie ni leur contenu, ni leur trafic, ni leur
disponibilité. L'admin WordPress reste l'outil d'édition du catalogue pendant
toute la transition — aucune ressaisie, aucun gel de contenu.

## Les 4 phases

### Phase 1 — Preview beta (✅ cible de cette itération)
- Nouveau site déployé sur **Vercel**, en déploiement *preview* (pas de domaine
  public de production touché).
- Domaines actuels (`editionssociales.fr`, `ladispute.fr`,
  `boutique.editionssociales.fr`) **inchangés**, servent toujours WordPress.
- L'app lit les WP existants via leurs URLs publiques actuelles
  (`WP_ES_URL`, `WP_LD_URL`, `WC_STORE_URL`).
- Workflow : `git push` → build Vercel → URL de preview partagée pour démo/allers-retours,
  comme convenu à l'oral (méthode RP).

### Phase 2 — Découplage CMS (à faire *avant* tout flip DNS)
Risque identifié : le jour où `editionssociales.fr` pointera vers Vercel, l'URL
REST que l'app utilise aujourd'hui (`https://editionssociales.fr/wp-json`)
disparaît puisque le domaine ne servira plus WordPress.
- **Action** : donner à chaque WordPress un hostname stable et non public
  (ex. host de cluster OVH déjà attaché, ou sous-domaine `cms-*`), et rebrancher
  `WP_ES_URL` / `WP_LD_URL` dessus.
- Une fois fait, le domaine public peut être basculé sans jamais couper la
  source de données.
- La boutique n'a pas besoin de ce découplage tant qu'elle reste sur
  `boutique.editionssociales.fr` en WooCommerce (paiement inchangé).

### Phase 3 — Bascule (cutover), domaine par domaine
- DNS du domaine vitrine → Vercel, **après** la phase 2.
- **Redirections 301** de chaque URL WordPress existante vers l'équivalent sur
  le nouveau site (SEO + liens déjà partagés). Table à établir avant le cutover.
- Fait maison par maison (ES d'abord, puis La Dispute) pour limiter le risque.
- La boutique reste sur WooCommerce jusqu'à la décision Stripe natif (étape 2
  du chantier, à trancher avec le client).

### Phase 4 — Retrait progressif
- Une fois le nouveau site stable en prod, extinction des thèmes front-end WP
  (mais les WP restent vivants en *backend headless* pour l'admin catalogue).
- Migration finale (DB managée + paiement Stripe natif) traitée séparément.

## Règles à respecter pendant toute la cohabitation

- **Ne pas renommer** le CPT `catalogue`, les taxonomies (`auteur`, `collection`,
  `parution`) ni les champs ACF (`isbn`, `prix`, `date_parution`, …) : c'est le
  contrat de données du nouveau site. Ajouter = OK, renommer/supprimer = casse
  le site.
- **Préserver le mu-plugin** `wp-content/mu-plugins/es-headless-rest.php` sur
  `www/` et `LaDispute/` (source versionnée : `wp-headless/es-headless-rest.php`
  dans ce repo — à redéposer s'il disparaît lors d'une maintenance WP).
- Prévenir avant tout changement structurel WP (thème, permaliens, plugins REST)
  qui pourrait altérer la sortie de l'API.

## État actuel (voir aussi mémoire projet `es-site-rebuild`)

- [x] Sites WordPress + boutique en ligne, inchangés.
- [x] Couche data headless (REST + Store API) opérationnelle et vérifiée.
- [x] mu-plugin déployé sur www/ et LaDispute/.
- [x] Phase 1 — beta déployée : https://editions-sociales-la-dispute.vercel.app
      (team Vercel `solidz`, **provisoire** — projet transférable sans perte
      d'historique vers un compte dédié au client dès qu'il existe). Catalogue
      + boutique vérifiés avec données réelles ; les 3 sites WP restent à 200.
- [x] Workflow *push git → build → preview* **branché et vérifié** : dépôt
      `yourimerad/editions-sociales-la-dispute` (privé), `vercel[bot]` déploie
      `main` en Production et chaque branche en Preview depuis le 2026-07-02.
      CI GitHub Actions (typecheck/lint/test) depuis le 2026-07-09.
      Reste la **propriété** des comptes, pas la plomberie — cf. `DEVOPS.md` §6.
- [ ] Phase 2 — hostnames CMS découplés.
- [ ] Phase 3 — redirections 301 + cutover DNS.
- [ ] Phase 4 — retrait des front-ends WP.

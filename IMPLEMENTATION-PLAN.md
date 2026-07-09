# Plan d'implémentation — de la vitrine à la refondation

> **But.** Le plan détaillé, phase par phase, de l'option B du devis (refondation
> complète, 10 j). Il met en œuvre le cadrage de `IMPLEMENTATION-PROMPT.md` ; la stack
> d'exploitation et les runbooks de compte vivent dans `DEVOPS.md`.
>
> **Établi le 2026-07-09**, sur la base d'un `main` (`012fe02`) vérifié vert :
> `typecheck` ✓ · `lint` ✓ · `test` 55/55 ✓ · `build` ✓ (308 pages, 30 s).
>
> Chaque phase énonce : objectif, prérequis, tâches, **vérification**, **rollback**.
> Aucune phase n'éteint un WordPress avant que son remplaçant ne soit vérifié.

---

## 0. Le chemin critique

Une seule échéance est **dure** : la campagne de dons, ~**15 août 2026**. Elle évite
3 000–5 000 € de commissions Ulule — littéralement, *la campagne paie le site*.

| Date | Ce qui doit exister |
|---|---|
| ~~8 juil.~~ | Décision d'option (B) — *acquise* |
| **9 juil.** | **Paliers & contreparties 2026** (entrée client, attendue aujourd'hui) |
| **10 juil.** | **Mentions légales** (entrée client) |
| 🔴 **au plus tôt** | **Une clé Stripe `sk_test_…`** — sans elle la phase 1 ne démarre pas |
| fin juil. | Dons en production · catalogue en base · back-office |
| **15 août** | **Lancement de la campagne**, prestataire disponible pour surveiller |
| août | Équipe cliente fermée 2 semaines |
| sept. | Commerce natif (variante « B phasé ») |

**La phase 1 est bloquée par un placeholder.** `site/.env` contient
`STRIPE_SECRET_KEY=NOT_SET` — la chaîne littérale, pas une clé. Tout le reste du plan
avance sans elle ; les dons, non. C'est le seul point qui menace le 15 août, et il se
débloque en une action client (créer le compte Stripe, copier la clé de test).

**Ordre.** Les phases 1 et 2 sont indépendantes et peuvent se mener en parallèle. Les
phases 3 → 4 → 7 sont strictement séquentielles. Les phases 5 et 6 s'insèrent n'importe
où (6 gagne à être faite tôt : elle rend les incidents visibles).

---

## Phase 0 — Socle DevOps ✅ *(ce commit)*

**Objectif.** Qu'aucune ligne ne parte en production sans être vérifiée.

- [x] `.github/workflows/ci.yml` — `typecheck` · `lint` · `test` sur chaque PR.
      Le `build` reste chez Vercel : à froid il envoie ~300 requêtes PHP à l'OVH
      mutualisé du client (une par fiche livre), inutile de les doubler. Détail et
      justification : `DEVOPS.md` §5.
- [x] `packageManager: pnpm@10.34.3` — CI, Vercel et le poste du dev partagent enfin
      la même version de pnpm.
- [x] `DEVOPS.md`, `IMPLEMENTATION-PLAN.md`.
- [ ] **Transfert de propriété** (dépôt → `editionssociales`, Vercel → compte client),
      liaison Vercel↔Git, variables d'environnement, protection de `main`.
      → Runbooks prêts dans `DEVOPS.md` §6, **non exécutés** : ils touchent des comptes
      tiers. Attendent un accord explicite.

**Vérification.** La PR de ce commit est le premier build vert de l'histoire du dépôt.

---

## Phase 1 — Les dons, de bout en bout 🔴 *bloquée*

**Objectif.** Encaisser un don depuis `/souscription`, envoyer un reçu, avant le 15 août.

**Bloqueurs.**
1. `STRIPE_SECRET_KEY` = `NOT_SET` → besoin d'une clé **`sk_test_…`** du compte client.
2. **Stripe ou HelloAsso ?** Si la structure fusionnée est une **association loi 1901**,
   HelloAsso prend **0 %** (contre ~1,5 % + 0,25 €) et émet les **reçus fiscaux**
   automatiquement. Sur 85 000 € collectés en 2024, l'écart est de l'ordre de 1 300 €.
   Le devis chiffre les deux au même prix. **Trancher avant d'écrire une ligne.**

**Tâches** (voie Stripe ; la voie HelloAsso remplace 3 et 4 par l'intégration d'un widget)
1. Modéliser les paliers/contreparties 2026 en données (le module `campaign.ts` existe
   déjà et est testé : `CAMPAIGN_2024` y est codé en dur — l'étendre, pas le refaire).
2. Formulaire de don sur `/souscription` : montant libre + paliers, don ponctuel.
3. Route serveur → **Stripe Checkout Session** (redirection hébergée : pas de PCI, pas
   de champ carte chez nous). Clé `sk_test_…` en Preview, `sk_live_…` en Production
   seulement (`DEVOPS.md` §4.3).
4. **Webhook** `checkout.session.completed` → persistance du don + e-mail de reçu.
   Vérifier la signature ; traiter **idempotemment** (Stripe rejoue les webhooks).
5. Page de remerciement, page d'échec, et le cas « l'utilisateur ferme l'onglet ».

**Vérification.** Bout en bout en mode test (cartes `4242…`), puis **un vrai don de
1 € remboursé** avant l'ouverture publique. Rejouer le webhook depuis le dashboard
Stripe pour prouver l'idempotence.

**Rollback.** La page redevient statique (état actuel) ; aucune donnée en jeu tant que
`sk_live_` n'est pas posée.

> ⚠️ Une clé `live` ne doit **jamais** exister en Preview : une PR pourrait encaisser
> un vrai don.

---

## Phase 2 — Durcissement de la vitrine actuelle

**Objectif.** Rendre publiable le site tel qu'il est. Indépendant de la phase 1.

**Tâches**
1. 🔴 **`/mentions-legales` n'existe pas** — et `site-footer.tsx:61` **pointe dessus**.
   Le pied de page du site en ligne contient donc un lien mort qui affiche une 404.
   À créer avec CGV, politique de confidentialité, cookies. *(Entrée client attendue le
   10 juillet.)*
2. `sitemap.ts` et `robots.ts` — **aucun des deux n'existe**. Sans sitemap, les 295
   fiches ne se découvrent que par crawl.
3. `error.tsx` / `global-error.tsx` — **absents** : toute erreur de rendu tombe sur
   l'écran par défaut de Next.
4. **Table de redirections 301** ancienne URL WP → nouvelle. À établir *avant* le
   cutover : c'est tout le SEO accumulé et les liens déjà partagés.
5. **Découplage CMS** (`COHABITATION.md` phase 2) : donner à chaque WordPress un
   hostname stable non public, rebrancher `WP_ES_URL`/`WP_LD_URL` dessus.
   **Sans cela, le jour où le domaine pointe sur Vercel, le site perd sa source de
   données** — le WordPress ne répond plus sur ce nom.
6. Rendre les défauts d'environnement **fatals** au démarrage plutôt que silencieux
   (aujourd'hui une conf absente tape la prod, cf. `DEVOPS.md` §4.1).

**Vérification.** Le lien du pied de page résout ; `/sitemap.xml` liste 295 fiches ;
une erreur provoquée affiche la page d'erreur ; le site sert toujours le catalogue
après bascule de `WP_*` sur les nouveaux hostnames.

**Rollback.** Chaque point est additif et se révoque isolément.

---

## Phase 3 — Le catalogue prend sa base

**Objectif.** Le catalogue vit dans PostgreSQL. Les deux WordPress catalogue s'éteignent.

### ⚠️ Prérequis d'architecture — le port fuit

`IMPLEMENTATION-PROMPT.md` promet que « remplacer WordPress-REST par une base propre ne
touche pas le front ». **C'est vrai pour le front, faux pour le port.** Aujourd'hui
`CatalogueSource` renvoie des **formes WordPress brutes** :

```ts
interface CatalogueSource {
  listBooks(edition: EditionSlug): Promise<WpBook[]>;        // ← forme WP
  getBook(edition: EditionSlug, slug: string): Promise<WpBook | null>;
  listProducts(): Promise<WcProduct[]>;                       // ← forme WooCommerce
}
```

Un adaptateur PostgreSQL devrait donc **fabriquer de faux `WpBook`** (`title.rendered`,
`book.date_parution` en chaîne, `prix` tantôt `string` tantôt `number`…) pour nourrir un
cœur qui les re-transforme aussitôt. La dette WordPress survivrait à WordPress.

**Donc, avant toute migration** : inverser le port pour qu'il renvoie le domaine.

```ts
interface CatalogueSource {
  listBooks(edition: EditionSlug): Promise<Book[]>;
  getBook(edition: EditionSlug, slug: string): Promise<BookDetail | null>;
  listProducts(): Promise<Book[]>;
}
```

`toBook`, `buildCatalogue`, `resolvePurchase` migrent de `catalogue-core.ts` vers
l'adaptateur WordPress. Le cœur (`queryBooks`, `computeFacets`, `newReleases`,
`countByEdition`) reste pur et **ses 55 tests continuent de passer**. Refactor à rendu
identique, sans changement fonctionnel : c'est la seule étape qui rend le reste de la
phase honnête. **~0,5 j, à faire en premier.**

### Tâches
1. Le refactor du port ci-dessus (iso-rendu, tests verts).
2. Schéma PostgreSQL : `books`, `authors`, `collections`, `editions`, `parutions`,
   tables de liaison. Le contrat de sortie du mu-plugin (`book`) est déjà normalisé —
   il sert de cible de mapping et épargne un aller-retour.
3. Script de migration des **295 fiches** (le devis en annonce 293 : écart à expliquer,
   probablement des ajouts récents — **compter avant de migrer**). Idempotent, rejouable.
   Vérification par échantillon **et** par comptage.
   ⚠️ Piège connu : les formats de date ACF (`date_parution`) sont hétérogènes.
   `parseWpDate` sait déjà les lire — réutiliser, ne pas réécrire.
4. Rapatrier les **couvertures (~1 Go)** vers le stockage objet + CDN. Réécrire les URL.
   Retirer les `remotePatterns` OVH de `next.config.ts` une fois la bascule faite.
5. Écrire l'adaptateur PostgreSQL du port (désormais propre), le brancher :
   **une seule ligne change** — `src/lib/catalogue.ts:29`.
6. Back-office : tous les champs, statut de parution, rôles, éditeur. Prise en main avec
   l'équipe (« Floée comprise » — l'utilisatrice réelle, pas une abstraction).
7. Fenêtre de recouvrement : les deux WordPress **restent allumés en lecture**, la bascule
   se fait par variable d'environnement.
8. Après validation de l'équipe et fenêtre de rollback écoulée : extinction de `www` et
   `LaDispute`, export des bases `editionskes` / `editionsk712`.

**Vérification.** Comptage identique livre par livre entre WP et PostgreSQL ; diff des
pages rendues avant/après bascule d'adaptateur ; les 55 tests du cœur inchangés ;
build hermétique (plus aucune requête sortante).

**Rollback.** Repointer l'adaptateur sur WordPress (une variable). Tant que les WP sont
allumés, la bascule est réversible **en une minute**.

**Bénéfice de bord.** Le build cesse de dépendre du réseau : ~300 requêtes PHP → une
transaction. Le risque « catalogue tronqué en silence » (`DEVOPS.md` §5) disparaît, et
le job `build` peut rejoindre la CI.

---

## Phase 4 — Le commerce à la maison

**Objectif.** Panier + caisse Stripe unifiée (livres **et** dons). La boutique WordPress
s'éteint. *(Variante « B phasé » : septembre.)*

**Prérequis bloquants.**
- Phase 3 terminée (un livre = **une** fiche, plus une fiche WP + un produit Woo).
- Phase 1 terminée (la caisse est commune).
- **Tracer ce qui appelle la Legacy REST API** de WooCommerce avant de l'éteindre
  (export compta suspecté — `LEGACY-STACK.md` §11). Ne rien couper à l'aveugle.

**Tâches**
1. **Exporter d'abord** : 5 753 commandes + clients. Archive vérifiée, remise au client,
   **avant de toucher quoi que ce soit.** Zéro tolérance à la perte silencieuse.
2. Panier (`/panier` est aujourd'hui un décor statique, sans état ni ligne).
3. Caisse Stripe unifiée livres + dons, **achat en invité** (pas de compte client :
   hors périmètre, et le devis l'exclut explicitement).
4. **TVA 5,5 %** (livres). Ne pas généraliser : c'est un taux, pas une variable métier.
5. Frais de port **par poids/zone** — *recopier fidèlement* la grille `flexible-shipping`
   existante, y compris la livraison offerte. Ne pas redessiner ce que le client connaît.
6. E-mails de commande via service transactionnel (SPF/DKIM configurés).
7. Export CSV compta (remplace `woo-order-export-lite`), codes promo simples.
8. Migrer les **223 produits**, fusionnés avec les fiches catalogue.
9. Extinction de la boutique + export de `editionsk884`.

**Vérification.** Commande test bout en bout (TVA, port, e-mail, export). Réconcilier
l'export CSV avec le dashboard Stripe sur une journée réelle.

**Rollback.** Woo reste en ligne jusqu'à réconciliation d'une semaine de commandes.

---

## Phase 5 — Newsletter & contact

**Objectif.** Un seul outil, au lieu de trois.

- Import des **2 848 abonnés** vers **Brevo**, avec **preuve de consentement** (RGPD :
  sans preuve, l'import est une faute, pas un raccourci).
- Formulaire d'inscription + **un seul** formulaire de contact.
  *(La pile actuelle en compte trois : Contact Form 7, WPForms, Everest Forms.)*

**Vérification.** Un aller-retour double opt-in réel. SPF/DKIM validés.

---

## Phase 6 — Socle d'exploitation *(à faire tôt)*

**Objectif.** Que les incidents se signalent seuls, au lieu d'arriver par un lecteur agacé.

- Remontée d'erreurs (les `console.error` de `catalogue-http.ts` ne vont nulle part).
- Sonde de disponibilité + alerte.
- Statistiques **sans cookie** (pas de bandeau à négocier).
- Sauvegardes automatiques vérifiées — *une sauvegarde jamais restaurée n'est pas une
  sauvegarde.*

Peu coûteuse (0 € sur les paliers gratuits), elle rend visibles les phases suivantes.
**À placer avant la phase 3**, pour instrumenter la migration plutôt que la subir.

---

## Phase 7 — Bascule finale

- DNS **maison par maison** (ES, puis La Dispute), après les 301 de la phase 2.
- **Ne jamais toucher aux MX** : l'Email Pro du client vit sur les mêmes domaines.
- Extinction du dernier WordPress du périmètre. **GEME/BioMarx reste intact, hors
  périmètre** — ne pas le mêler au catalogue.
- Résilier le **slot OVH `la-dispute.fr` vide** (Performance 1, PHP 7.3 EOL) :
  **287 € TTC/an**, pour zéro octet servi. Il finance à lui seul l'abonnement Vercel.
- Fin du double hébergement.

---

## Ce qu'on ne construit pas

Le périmètre est discipliné par le devis. Résister à « tant qu'on y est » :

- pas d'espace client (achat en invité) · pas de multilingue · pas de GEME
- pas de refonte de la grille de frais de port — on la **recopie**
- les 5 753 commandes historiques restent un **export**, pas une migration

---

## Références

- `DEVOPS.md` — stack d'exploitation, comptes, CI/CD, secrets, runbooks, **bloqueurs**.
- `IMPLEMENTATION-PROMPT.md` — le cadrage haut niveau.
- `LEGACY-STACK.md` — inventaire vérifié de l'existant.
- `COHABITATION.md` — les 4 phases côté WordPress.
- `../devis/DEVIS-MULTI-OPTIONS.md` — option B, ligne à ligne.

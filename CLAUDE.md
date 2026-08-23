@AGENTS.md

# site — Éditions sociales × La Dispute (site unifié)

## Purpose

Site unique réunissant **Les Éditions sociales**, **La Dispute** et leur **boutique commune** : front Next.js + back-office Payload (`/admin`) + commerce natif (panier, checkout Stripe, commandes), le tout sur une seule source — Postgres (Neon, schéma `payload`). Coupure OVH actée : plus aucun WordPress/WooCommerce lu, le fonctionnement actuel est le fonctionnement final.

## Ownership

Owns : le front unifié, le modèle de domaine (`Book` / statut d'achat), la couche data (port + adaptateurs pg/mémoire), le back-office Payload (schéma `payload`, rôles), le moteur de commerce natif (port en centimes, panier, checkout, export), la présentation brutaliste, la sécurisation du HTML éditorial.
Does NOT own : le schéma SQL `public` (réservé — p. ex. dons) ; la jauge de dons (calculée depuis les charges Stripe, zéro stockage).

## Local Contracts

- Un livre n'est **jamais retiré** du catalogue faute d'être en vente (« à paraître » ou « indisponible en ligne ») ; tout HTML éditorial passe par `sanitizeCms` (marque `SafeHtml`) ; classes Tailwind **littérales** partout (le JIT ne compile pas le dynamique).
- **Payload** : Next et Payload montent **en tandem** (versions épinglées) ; écritures via `context.migration`/`context.disableRevalidate` ; URL Neon **poolée** (app/build) vs **directe** `DATABASE_URL_UNPOOLED` (`payload migrate`, `pg_dump`) ; imports `.ts` explicites sous le CLI payload ; scripts `payload run` en **top-level await** — et s'ils importent un seam marqué `server-only` (webhook, `order-source`, `contreparties`…), l'entrée npm porte `NODE_OPTIONS=--conditions=react-server` (le paquet jette sous Node/tsx nu ; précédent : `backfill:dons`). `DATABASE_URL` + `PAYLOAD_SECRET` REQUISES au boot (`env.ts`).
- **Commerce** : montants **toujours en centimes entiers** ; checkout = re-validation serveur intégrale (jamais un prix client) ; l'I/O Payload du parcours d'achat passe par les seams `commerce-source`/`order-source`. **Précommande** (client 2026-08-20) : un panier mixte (articles parus + articles à paraître en précommande, `commerce.preorder`) reste UN SEUL paiement Stripe mais scinde en DEUX `Orders` (`orderType` `commande`|`precommande`, idempotence webhook par le COUPLE `(stripeSessionId, orderType)` — `Orders.ts:indexes`) ; le barème de port est résolu UNE fois sur le panier combiné (`cart-quote.ts:computeCartQuote`) puis facturé une fois par envoi non vide (×1 homogène, ×2 mixte). **Don avec contrepartie** (client 2026-08-21) : un don par palier crée une commande `orderType: "don"` via le même webhook (composition figée en code `contreparties-core.ts`, encodée `metadata.donLines` au checkout, jamais recalculée au webhook ; lignes à 0 €, port offert, total = montant du don, stock décrémenté avec négatif autorisé — la contrepartie est toujours servie) ; étanchéité comptable DURE dons/ventes : jamais dans un agrégat de CA/TVA. Montant libre = don sec, zéro écriture (chemin historique).
- **Chaîne e-mail** : tout passe par Brevo, et `BREVO_API_KEY` en est l'unique interrupteur (`brevoConfigured()`). Absente, le site bascule SEUL sur un repli manuel — adresse publique `ecrire@editionssociales.fr` (source unique `src/lib/contact-address.ts`, constante dure) affichée en clair + `mailto:` pré-remplis, aucun formulaire muet ; posée, tout redevient normal sans toucher au code. L'adresse publique reste visible en permanence (pied de page, pages de remerciement) quel que soit cet état. Les mails transactionnels (confirmation de commande `order-mail.ts`, remerciement de don `donation-mail.ts`) partagent le même gabarit (`mail-shell.ts`) et `sendTransactionalEmail` ; côté dons SANS contrepartie (montant libre), faute de persistance, l'envoi (webhook Stripe) est du best-effort SANS idempotence garantie — un don AVEC contrepartie (client 2026-08-21, `orderType: "don"`) EST idempotent, porté par `Orders.confirmationSent` comme une commande.
- **Stock** : champ unique `stock` (nullable, livres ET boutique-seuls), `stockSuivi` `routeur`|`manuel` ; le stock EST la disponibilité ; décrément au paiement **idempotent** ; `upcoming` **prime toujours**, SAUF précommande ouverte (`commerce.preorder` coché sur la fiche — lève ce seul refus, les règles stock/vendable s'appliquent ensuite normalement) — règle énoncée une seule fois : `src/lib/sellability.ts`.

## Ubiquitous Language

- **Book** : livre du catalogue unifié (deux fonds + boutique). **maison/edition** : `editions-sociales`|`la-dispute`. **origin** : `catalogue` (fonds) | `boutique` (article boutique-seul). **PurchaseStatus** : `available`|`preorder`|`external`|`upcoming`|`unavailable` (`preorder` : à paraître mais achetable, panier natif comme `available`).
- **CatalogueSource** : port de lecture des fonds (`src/lib`) — adaptateurs pg (Payload) et mémoire (tests).
- **parachute `*LegacyHtml`/`contentTouched`** : le HTML hérité de WordPress fait foi tant qu'un humain n'a pas réédité la fiche dans Payload. Ces champs sont **lisibles publiquement** (la lecture front garde `overrideAccess: false` — un champ réservé aux connectés serait invisible du rendu) ; TOUTE écriture humaine, API REST comprise, pose `contentTouched=true`.
- **`stockSuivi`** / **routeur** : origine du stock (import mensuel du distributeur vs saisie manuelle).
- **Historique Woo importé** : les `Orders` au `stripeSessionId` préfixé `woo-<id>` sont l'historique WooCommerce 2018→2026 (import one-shot `scripts/import-orders-woo.ts`, idempotent par ce préfixe, depuis le dump final du 2026-08-20) — `number` = n° Woo brut (jamais `CMD-*`), `createdAt` antidaté, aucun objet Stripe réel (l'export compta les étiquette « Stripe », constante du module) ; lignes de produits disparus rattachées à la fiche brouillon `archive-boutique-woo` (jamais publiée), vrai titre conservé en snapshot.

## Decisions

- **Coupure OVH brute** (2026-07-18, remplace la bascule fenêtrée du plan) : l'axe WordPress/WooCommerce (adaptateur http, Store API, flags `CATALOGUE_SOURCE`/`COMMERCE_NATIVE`, scripts de migration, rewrites `wc-api`, redirects `cms-*`) est supprimé du code — pg + commerce natif sont le seul chemin. Historique : `plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md`.
- **ld-es.fr** : domaine canonique du site. Tous les hosts legacy (editionssociales.fr, ladispute.fr, la-dispute.fr, boutique.\*, editions-sociales.\*) redirigent vers lui via les règles host `redirects()` de `next.config.ts` — 302 par défaut, 301 quand `REDIRECTS_PERMANENT` = `1`. Les adresses email restent `@editionssociales.fr`.
- **Ports & adaptateurs** : cœur pur testable, adaptateurs pg (Payload) / mémoire (tests) derrière le même port.
- **Médias en Blob direct** (audit coûts Vercel 2026-08-23) : `media.url` = URL Blob publique directe (`disablePayloadAccessControl`, `payload.config.ts`) — plus de fonction `/api/media/file/*` dans le chemin de l'optimiseur d'images ; `images` : WebP seul, `minimumCacheTTL` 31 j, `remotePatterns` épinglé sur le store (hostname dérivé du token, `next.config.ts`) ; `cacheControlMaxAge` posé explicitement (la route d'upload client ignore le défaut serveur du plugin) ; les anciennes URLs `/api/media/file/*` (contenu legacy, caches externes) sont redirigées vers Blob au niveau edge (`redirects()`) ; en dev sans `BLOB_READ_WRITE_TOKEN`, plugin coupé → stockage local, URLs relatives.
- **Fraîcheur par purges, ISR en filet** (audit coûts Vercel 2026-08-23, remplace la fenêtre 1 h) : `revalidate = 86400` sur le catalogue — la fraîcheur réelle vient des purges **ciblées** : à l'édition back-office, `revalidateTag(…, { expire: 0 })` (read-your-writes) + chemins **littéraux** des listes et des seules fiches liées au doc sauvé (relation inverse pour auteurs/libellés/médias — un upload d'image ne purge plus tout le catalogue) ; au paiement, le webhook purge tag + listes + fiches vendues (`revalidateCatalogueNow`, `order-handler.ts`) ; purge large réservée aux suppressions et au repli d'erreur ; la bascule « à paraître → paru » (purement temporelle, aucun événement d'écriture) est couverte par un cron quotidien vers minuit Paris (`vercel.json` → `/api/cron/parutions`, gardé par `CRON_SECRET`). Les motifs `revalidatePath` avec groupe de routes ou segment dynamique sont inopérants sur Vercel (constat live 2026-07-19, `src/payload/hooks/revalidate.ts`). **Back-office dans l'app** : Payload 3.x épinglé, schéma Postgres dédié `payload`, migrations versionnées, jamais de `push` en prod.

## Work Guidance

- **`@AGENTS.md`** : cette version de Next.js diffère de tes acquis — lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- **Dépôt, CI/CD, comptes, secrets** : `DEVOPS.md` — bascules de compte jamais sans accord explicite. **Opérations** : `OPERATIONS.md` (runbook, monitoring/alertes).
- `plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md` : documents d'époque de la refonte — historiques, ne plus s'y référer pour l'état courant.

## Verification

- `pnpm typecheck` · `lint` · `test` · `knip` (exports/fichiers/dépendances morts) · `build` — rejoués sur chaque PR (`ci.yml`, job `verify`) ; `pnpm generate:types` après tout changement de schéma Payload. `typecheck` joue `tsc` SANS attendre le `build` qui le suit dans le même job : les déclarations de modules image vivent dans `src/image-types.d.ts` (`next-env.d.ts` est gitignoré, généré au build).
- `pnpm build` : hermétique (Postgres uniquement) — rejoué dans `ci.yml` après `pnpm knip` sur un **Postgres 17 jetable** (service container, `pnpm migrate` + catalogue vide : zéro transfert Neon, cf. `DEVOPS.md` § « Pipeline CI/CD »), en plus du build de déploiement (`vercel-build` = migrate:prod + next build ; un échec laisse l'ancien déploiement en ligne). Il n'y a plus de preview Vercel sur PR : ce job « verify » est la SEULE vérification du build avant merge.

## Child Index

- **`src/lib`** — modèle de domaine + couche data.
- **`src/components`** — présentation brutaliste.
- **`src/app`** — App Router : `(site)` front + `(payload)` back-office.
- **`src/payload`** — collections, accès et surface admin du back-office (dashboard, vues `/admin/stock` · `/admin/ventes` · `/admin/sante`, cœurs purs + endpoints dans `lib/`).

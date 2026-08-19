# src/app

## Purpose

Surface App Router en deux groupes étanches, sans root layout parent : **`(site)/`** — routes publiques fines (lisent `src/lib`, composent `src/components`) ; **`(payload)/`** — `/admin` + API (générés, à une exception : `custom.scss`, seul point d'entrée CSS manuel de l'admin).

## Ownership

- **Owns** : structuration des routes, métadonnées, politique de fraîcheur (statique/ISR/dynamique).
- **Does NOT own** : logique data (`src/lib`), primitives (`src/components`), contenu Payload (généré).

## Local Contracts

- **Multi-root-layouts** : `(site)/layout.tsx` et `(payload)/layout.tsx` complets indépendants, aucun layout parent. Full page load entre groupes (attendu). Pas de collision d'URL. Sans root layout, pas de 404 racine possible : toute URL hors routes est aspirée par le catch-all `(site)/[...rest]` → `notFound()` → la 404 brandée de `(site)/not-found.tsx`.
- **Métadonnées** : défauts OG/Twitter posés par `(site)/layout.tsx`, qui porte aussi un JSON-LD `Organization`/`WebSite` persistant (issue #87d, toutes pages) ; un `openGraph` de page REMPLACE celui du layout (fusion superficielle par champ, pas de deep-merge) — toute page qui le définit doit reposer `siteName`/`locale` (cf. fiche livre). Titres absolus (`{ absolute }`) quand le template dupliquerait le nom du site. Image de partage par convention de fichier `opengraph-image.jpg` (+ `.alt.txt`) colocalisé : og:image généré SANS toucher l'objet `openGraph` hérité (évite le piège de fusion — cf. souscription). **`opengraph-image` et `twitter-image` sont deux conventions de fichier INDÉPENDANTES** (aucun repli automatique de l'un vers l'autre, constat #87a) : ne déclarer `twitter: { card: "summary_large_image" }` QUE si un `twitter-image` colocalisé existe OU si `twitter.images` est posé explicitement avec une URL réelle (cf. fiche livre/boutique, `book.cover.url`) — sinon `"summary"`, qui reflète ce qui est réellement émis.
- **Modules colocalisés privés** : une route au rendu volumineux extrait ses sous-arbres en `_components/` (et ses assets en `_dossier/`, préfixe `_` = hors routing) plutôt que de gonfler `src/components` avec du non-réutilisable — précédent : `souscription/_components/{shelf,tiers-rail}.tsx`. Ces modules suivent les contrats de `src/components` (primitives sans marges d'emplacement : la disposition est l'affaire de l'appelant) et restent SERVEUR par défaut — seul `souscription/_components/collecte-ticker.tsx` est client (liseré de collecte fixé au viewport, piloté par le scroll).
- **Politique de fraîcheur** : pas de `force-dynamic`. Vues catalogue à `searchParams` (`/catalogue`, `/catalogue/[edition]`) : DYNAMIQUES à chaque requête, pas de `revalidate` (un export ici ne décrivait rien de réel — la fraîcheur vient du data-cache tagué `catalogue`, `src/lib/catalogue.ts`, purgé par les hooks back-office ; constat #74). Fiches livre, boutique : ISR `revalidate = 3600` avec `generateStaticParams` VIDE (rien de pré-rendu au build — génération à la première visite, `dynamicParams` défaut ; le Data Cache Vercel n'existe pas au build, pré-rendre rejouait la lecture Postgres à chaque deploy/CI — quota Neon épuisé 2026-07-26). Pages légales, accueil, souscription : statique ou ISR. `/editions/[slug]` : pages de présentation par maison (retour client 2026-07-23, cf. `NAV_HOUSES`) ; `/editions` (index) et `/a-propos` : `permanentRedirect()` vers l'accueil ; `/boutique` (liste) : `permanentRedirect()` vers `/panier` (goodies au checkout, fiches `[slug]` conservées). Détail des pages : voir commentaires dans le code.
- **Repli e-mail (Brevo non provisionné)** : `/contact` aiguille au rendu sur `brevoConfigured()` — clé absente ⇒ `_components/manual-contact` (adresse en clair + `mailto:` à objet pré-rempli) À LA PLACE du formulaire, jamais un formulaire qui n'aboutit nulle part ; `(site)/layout.tsx` descend le même prédicat au pied de page (`newsletterEnabled`). Lecture au PRÉRENDU assumée : sur Vercel une variable ajoutée n'atteint le runtime qu'au déploiement suivant, la page reste donc statique sans rien coûter à la réversibilité. Échec d'envoi à l'exécution : la server action renvoie le `mailto:` pré-rempli dans son état (`contact/state.ts`, champ `fallback`), jamais un canal parallèle.
- **Injection HTML** : `dangerouslySetInnerHTML` accepte uniquement `SafeHtml` (sanitisé `src/lib`) — fiches livre, boutique, pages légales. Champ vide = fallback JSX.

## Work Guidance

- Une route front ne fusionne pas de données ni n'appelle le réseau : toute capacité manquante va en `src/lib`.

## Verification

- `pnpm build` : statique/ISR pré-rendus, `/admin` et `/api` dynamiques, aucune collision entre groupes.

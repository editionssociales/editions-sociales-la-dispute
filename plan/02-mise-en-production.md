All contested points are now verified. Writing the final document.

# Phase 2 — Durcissement production du site lecture seule
## Plan d'implémentation détaillé — VERSION FINALE (révisée après relecture adversariale)

*Architecte de phase — 2026-07-09. Tout ce qui suit est vérifié : code du repo (`next.config.ts`, `src/app/*`, `src/lib/browse.ts`, `parse-filters.ts`, `site-footer.tsx:61`, `editions.ts:26`), docs Next 16 embarquées (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md` — `has:[{type:"host"}]` et `statusCode` documentés, « instead of the `permanent` property, but not both » ; `03-file-conventions/01-metadata/sitemap.md`, `robots.md`), path-to-regexp embarqué de Next (`/feed{/:rest*}` **ne compile pas** — « Unexpected MODIFIER » ; `/feed` et `/feed/:rest*` compilent, le lookahead négatif du pattern catalogue aussi — testés ce jour), comportement Host de Node (**`fetch`/undici supprime silencieusement un en-tête `Host` custom — vérifié empiriquement ce jour ; `http.request` et `curl -H "Host:"` le transmettent**), dumps SQL locaux (MariaDB :3307 interrogée ce jour : Stripe Woo `enabled="no"`, commandes 2026 = 601 paybox_std + 5 paybox_3x + 10 cheque + 0 stripe ; terme `parution` LD count=1), API OVH en GET ce jour (records de zone avec IDs — dont un **CNAME `www` préexistant** dans la zone ES ; `ovhConfig` : **PHP 8.4/stable64 actif sur les 4 chemins `www`, `LaDispute`, `Boutique` et racine** ; zones `editions-sociales.fr/.com` : **aucune redirection configurée** — elles servent la page parking OVH « Site en construction », vérifié par HTTP live), API Vercel en GET (`recommendedIPv4: 76.76.21.21`, `recommendedCNAME: cname.vercel-dns.com.`), normalisation trailing-slash de Next (`load-custom-routes.js:566` : `/:path+/` → redirection **permanente** servie dès le jour 1).*

---

## Objectif et livrable

Rendre le site lecture seule **présentable et exploitable en production sur les domaines réels**, sans rien casser de l'existant : pages légales publiées et validées, SEO de base (sitemap, robots, canonical, métadonnées), table de redirections exhaustive (302 puis 301 après validation client), découplage CMS (COHABITATION phase 2), bascule DNS maison par maison (COHABITATION phase 3, ES puis LD), résiliation du slot OVH vide, **transfert de propriété Vercel/GitHub au client (engagement du devis §9)**, recette.

**Livrable final** : `https://editionssociales.fr` et `https://ladispute.fr` servent le site Next.js ; toute ancienne URL WordPress redirige vers son équivalent ; les WordPress restent vivants et administrables sur des hostnames `cms-*` non publics ; la boutique WooCommerce et **tous les emails sont strictement intacts** ; le projet Vercel et le repo GitHub sont **au nom du client** (Youri invité) ; un rapport de recette signé client.

**Périmètre vendu** : devis §5 ligne « Mise en production (légales, 301, sitemap, DNS, résiliation slot vide, recette) » — **1 j / 200 €**. Le transfert de comptes relève du devis §9 (« transférée sans perte d'historique, au plus tard à la mise en production ») : il appartient à cette phase puisque c'est **elle** qui constitue la mise en production. Écart estimé : voir Calage calendrier.

Rappel de séquencement (COHABITATION) : **découplage CMS avant tout flip DNS** ; la bascule DNS **n'attend pas** la migration catalogue (le site lit WordPress en headless via les hosts `cms-*`).

---

## Préconditions et provisioning (qui fait quoi)

| # | Précondition | Qui | Détail / vérif |
|---|---|---|---|
| P1 | Accès OVH API compte ES (écriture zone DNS + hosting) | Youri | Vars `OVH_ES_*` du shell — **vérifiées fonctionnelles ce jour** (GET OK). Les écritures (POST/PUT record, POST attachedDomain) utilisent le même helper `~/.config/claude/ovh_api.py`. |
| P2 | Accès SFTP/SSH aux installs OVH `www` et `LaDispute` (dépôt mu-plugin + édition `wp-config.php`) | Youri (identifiants OVH du client) | Même canal que le déploiement historique du mu-plugin. À confirmer avant E3. |
| P3 | Accès Vercel team `solidz` (ajout domaines + env vars) | Youri | ⚠️ **Utiliser le `VERCEL_TOKEN` du shell** (`VERCEL_TEAM=solidz`), PAS celui de `site/.env` (scopé team client `ldes` vide, accès refusé — recon R4). Idem GitHub : `GH_TOKEN` shell, pas le `GITHUB_PAT` de `.env`. **Ces tokens `.env` deviendront les bons APRÈS le transfert E9** — ne pas les supprimer. |
| P4 | Informations légales de la structure | **Client** | Raison sociale, forme juridique (SARL / association — le « statut À CONFIRMER » du devis §10), SIRET, RCS le cas échéant, siège, capital, n° TVA intra, **directeur de la publication**, email/tél de contact. À demander **avant la démo du mercredi 15/07**. |
| P5 | Merge de la PR #5 (CI sur `main`) | Youri | La CI n'existe que dans `worktree-devops-foundation` (recon R4). À merger avant les PRs de cette phase pour qu'elles soient couvertes. `git -C /Users/yourihamon/marina_es/site pull` (checkout local en retard d'1 commit). |
| P6 | Décision client : feu vert bascule DNS | Client | À obtenir à la démo du 15/07 (le nouveau site remplace le front WP public — c'est l'objet de l'option B validée, mais la *date* se confirme ensemble). |
| P7 | MariaDB locale :3307 lancée (construction table 301) | Youri/agent | Vérifiée fonctionnelle ce jour. Dumps du 2026-07-01 — suffisant pour pages/taxonomies ; les slugs de fiches se vérifient contre le REST live. |
| P8 | (Interface phase Ops) Moniteurs Better Stack sur `/`, `/catalogue` + les 3 WP + **expiration TLS de `cms-es`/`cms-ld`** | Youri | Souhaitable avant le flip ; sinon vérifs curl manuelles pendant la fenêtre. Non bloquant. |
| P9 | **Compte Google du client** (propriétés Search Console) | **Client** | Absent de la liste « comptes à créer » du devis §10 — à collecter à la démo du 15/07. Repli : propriétés créées sur le compte de Youri avec **transfert de propriété GSC tracé** à la recette (même logique que E9). |
| P10 | **Transfert de propriété (E9)** : team Vercel `ldes` passée en plan Pro avec la carte du client ; compte GitHub `editionssociales` prêt à recevoir le repo | **Client** (Youri accompagne) | Les coquilles existent déjà (recon R4 : team `ldes` vide, compte GitHub `editionssociales` vide). Le devis §9 impose facturation Vercel côté client « dès la mise en production ». Date à acter à la démo (Q7). |

Aucun secret à provisionner (Stripe = phase Dons).

---

## Étapes

Ordre : E1–E2 (code, parallélisables) → E3 (découplage CMS) → E4 (redirections, dépend des hosts cms-\*) → E5 (flip ES) → E6 (flip LD) → E7 (302→301) → E8 (revue facturation Email Pro, résiliation ladispi + nettoyages, gâtée) → E9 (transfert de propriété — exécutant du protocole phase 7) → Recette. **E1bis (contenus réels)** court en parallèle : collecte à la démo du 15/07, intégration avant E5 (**bloquant pour le flip ES**, au même titre que les pages légales).

### E1 — Pages légales (3 routes + footer)

**Quoi.** Trois pages statiques server components, mêmes conventions que `/a-propos` (Tailwind littéral, server par défaut, zéro donnée externe → full statique sans `revalidate`).

**Fichiers créés :**
- `src/app/mentions-legales/page.tsx` — le footer y pointe **déjà** (`src/components/site-footer.tsx:61`, lien mort aujourd'hui : 404). Contenu (LCEN art. 6-III) : identification de la structure (P4), directeur de la publication, hébergeur du site (**gabarit avec placeholder `[ADRESSE LÉGALE VERCEL — vérifier sur vercel.com/legal au moment de la rédaction]`** — ne pas hardcoder une adresse d'anciens filings — + « médias servis par OVH SAS, 2 rue Kellermann, 59100 Roubaix pendant la période de transition »), contact, propriété intellectuelle (couvertures, textes).
- `src/app/confidentialite/page.tsx` — RGPD : responsable de traitement (la structure), finalités et sous-traitants **effectivement actifs à la date de publication** : hébergement (Vercel, USA — clauses contractuelles types), **police Effra via Adobe Fonts (Typekit)** — ressource tierce chargée au rendu (`layout.tsx:39`), à déclarer —, achat en ligne (renvoi vers la boutique WooCommerce et sa propre politique tant que le commerce n'est pas natif). **Ne PAS déclarer de traitement inexistant** : la mention « statistiques sans cookie (Vercel Web Analytics) » n'entre dans la page **qu'au déploiement effectif de l'analytics (phase Ops)** — soit la phase Ops active l'analytics avant la publication (une ligne, à synchroniser), soit la section est ajoutée par une PR triviale au moment de l'activation. Idem dons (Stripe — texte préparé avec la phase Dons, publié à la mise en réel) et newsletter (Brevo — avec la phase Newsletter). Droits d'accès/rectification/effacement + contact.
- `src/app/cgv/page.tsx` — intitulé « Conditions générales & conditions de don ». Périmètre honnête pour cette phase : (a) **section dons** (coordonnée avec la phase Dons : don ≠ achat, pas de droit de rétractation, reçu par email, mention reçu fiscal **seulement si** statut éligible — question ouverte Q4) ; (b) **section vente** : renvoi explicite « la vente en ligne est opérée sur boutique.editionssociales.fr » + rappels prix TTC, TVA livres 5,5 %, prix unique du livre (loi du 10 août 1981). Les CGV complètes du commerce natif (rétractation 14 j, médiateur de la consommation, livraison) arrivent avec la phase Commerce en septembre — **ne pas les publier avant que le site vende**.
- `src/components/site-footer.tsx` — ajouter les liens `/confidentialite` et `/cgv` à côté du lien existant (chaînes de classes `LINK_CLASS` existantes, iso-rendu pour le reste).

**Circuit de validation** (promis au devis : « contenu à faire valider par le client ») : rédaction gabarits avec placeholders `[À COMPLÉTER : SIRET]` → preview Vercel → envoi client avec la démo du 15/07 → intégration retours → publication. La page mentions légales **doit** être complète au plus tard au flip ES (site public sur domaine réel).

**Vérifier :** `pnpm typecheck · lint · test · build` ; les 3 routes rendent en preview ; plus aucun lien mort dans le footer ; aucune section « sous-traitant » ne décrit un service non déployé ; relecture client tracée (email).

### E1bis — Passe de contenus réels (engagement C91)

**Quoi.** Remplacer les derniers contenus provisoires par les contenus réels fournis par le client — **collecte à la démo du 15/07**, **~0,25 j d'intégration** :
- **Liens réseaux sociaux** dans le footer (`src/components/site-footer.tsx`) ;
- **Textes définitifs** de `/a-propos` et `/editions/[slug]` (les deux maisons) ;
- **Événements réels** de `/rencontres` **OU** exécution du retrait de la page — selon la décision client **Q8** déjà prévue dans ce plan (le sitemap E2 et la règle LD #8 suivent la même décision).

**Bloquant pour le flip ES du 21/07 au même titre que les pages légales** : un site public sur domaine réel ne peut pas afficher de contenus placeholder.

**Vérifier :** footer sans lien mort ni placeholder ; `/a-propos` et `/editions/[slug]` relus par le client (email faisant foi) ; `/rencontres` conforme à Q8 (événements réels, ou page retirée + sitemap et règle LD #8 ajustés).

### E2 — SEO : sitemap, robots, canonical, métadonnées

**Conventions Next 16 vérifiées** dans les docs embarquées (`03-api-reference/03-file-conventions/01-metadata/{sitemap,robots}.md`) : `app/sitemap.ts` et `app/robots.ts` sont des conventions de fichiers typées `MetadataRoute.Sitemap` / `MetadataRoute.Robots`, cachées au build par défaut.

**Fichiers :**

1. **`src/app/layout.tsx`** — ajouter au `metadata` existant (`:20`) :
   ```ts
   metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr"),
   ```
   Env `NEXT_PUBLIC_SITE_URL` ajoutée à `.env.example` ; côté Vercel (production : `https://editionssociales.fr`), la poser **au moment du flip (21/07, E5 Jour J) plutôt qu'au merge (16–17/07)** — sinon les canonicals/liens absolus émis entre-temps pointeraient vers un domaine encore servi par WordPress. (L'inverse resterait acceptable — le site est noindexé jusqu'au flip — mais poser au flip est plus propre.)

2. **`src/app/robots.ts`** — indexabilité gâtée par env (le domaine `*.vercel.app` ne doit pas être indexé avant le flip ; aujourd'hui il n'y a **aucun** robots.txt sur la beta) :
   ```ts
   import type { MetadataRoute } from "next";
   export default function robots(): MetadataRoute.Robots {
     const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr";
     if (process.env.SITE_INDEXABLE !== "1")
       return { rules: { userAgent: "*", disallow: "/" } };
     return {
       rules: { userAgent: "*", allow: "/", disallow: ["/panier"] },
       sitemap: `${base}/sitemap.xml`,
     };
   }
   ```
   `SITE_INDEXABLE=1` posée sur Vercel (production uniquement) **le jour du flip ES** — un redéploiement a lieu de toute façon ce jour-là.

3. **`src/app/sitemap.ts`** — via la façade `@/lib/catalogue` (insensible au futur swap d'adaptateur) : `/`, `/catalogue`, `/catalogue/editions-sociales`, `/catalogue/la-dispute`, les ~295 fiches (`getAllBookParams()` — exclut déjà les boutique-only), `/editions`, `/editions/[slug]` ×2, `/souscription`, `/a-propos`, les 3 pages légales, et `/rencontres` **conditionnellement** (cf. décision Q8 : le devis §10 prévoit « on la retire au lancement » si le client ne fournit pas d'événements réels — la liste du sitemap suit la décision). Exporter `export const revalidate = 3600;` pour suivre la fenêtre ISR. ~310 URLs → un seul sitemap, pas besoin de `generateSitemaps`.

4. **Canonical** — `alternates: { canonical: <chemin> }` dans le `metadata`/`generateMetadata` de chaque page indexable ; pour `/catalogue` et `/catalogue/[edition]` (pages à `searchParams`), canonical **sans** query string (les vues filtrées/paginées canonicalisent vers la vue de base). La fiche livre garde son JSON-LD existant.

5. **Google Search Console** — propriétés « domaine » pour `editionssociales.fr` et `ladispute.fr` (validation par TXT DNS — **additif**, aucun risque MX), **sur le compte Google du client (P9 ; repli : compte Youri + transfert de propriété tracé, aligné E9)**. Soumettre le sitemap après le flip ES. Après passage 301 (E7), utiliser l'outil **« Changement d'adresse »** sur la propriété ladispute.fr → editionssociales.fr.

**Vérifier :** `curl -s https://<preview>/robots.txt` → `Disallow: /` (gate active) ; `curl -s https://<preview>/sitemap.xml | grep -c "<loc>"` ≈ 310 ; `pnpm build` vert.

### E3 — Découplage CMS (COHABITATION phase 2) — AVANT tout flip

**Choix de hostname** : `cms-es.editionssociales.fr` (→ install `www`) et `cms-ld.editionssociales.fr` (→ install `LaDispute`), **tous deux dans la zone `editionssociales.fr`** — une seule zone à gérer, elle reste chez OVH quoi qu'il arrive, et on ne dépend pas de la zone `ladispute.fr` qui va bouger. Le hostname de cluster existant `editionsk.cluster006.ovh.net` est écarté (pas de SSL, recon R4 — les hosts `cms-*` avec Let's Encrypt sont propres). La boutique n'a **pas** besoin de découplage (`boutique.editionssociales.fr` ne bouge pas, COHABITATION §phase 2).

**3a. DNS** (compte ES, helper `ovh_api.py`, environnement `OVH_ES_*` comme documenté LEGACY-STACK §1.1) :
```bash
python3 $H POST /domain/zone/editionssociales.fr/record \
  '{"fieldType":"A","subDomain":"cms-es","target":"213.186.33.17","ttl":3600}'
python3 $H POST /domain/zone/editionssociales.fr/record \
  '{"fieldType":"A","subDomain":"cms-ld","target":"213.186.33.17","ttl":3600}'
python3 $H POST /domain/zone/editionssociales.fr/refresh '{}'
```
(A vers l'IP du cluster — 213.186.33.17, identique aux A existants de la zone, re-vérifiée ce jour. Ne PAS utiliser de CNAME vers `editionssociales.fr` : il pointera vers Vercel après le flip.)

**3b. Attacher au slot** (shape de l'objet vérifiée par GET : `{domain, path, ssl}`) — attendre que `dig cms-es.editionssociales.fr` réponde, puis :
```bash
python3 $H POST /hosting/web/editionssociales.fr/attachedDomain \
  '{"domain":"cms-es.editionssociales.fr","path":"www","ssl":true}'
python3 $H POST /hosting/web/editionssociales.fr/attachedDomain \
  '{"domain":"cms-ld.editionssociales.fr","path":"LaDispute","ssl":true}'
# suivi : GET /hosting/web/editionssociales.fr/attachedDomain/cms-es.editionssociales.fr → status "created", ssl true
```
Le certificat Let's Encrypt multi-domaines du slot se régénère avec les nouveaux hosts (le slot gère déjà du multi-SSL — GET `/ssl` répond « Web has multiple SSLs »).

**3c. Vérifier le REST sur les hosts cms** (WordPress répond au REST sur tout host attaché ; la redirection canonique WP ne s'applique qu'au front) :
```bash
curl -sS "https://cms-es.editionssociales.fr/wp-json/wp/v2/catalogue?per_page=1&_fields=id,slug,book" | head -c 300
curl -sS "https://cms-ld.editionssociales.fr/wp-json/wp/v2/catalogue?per_page=1&_fields=id,slug,book" | head -c 300
curl -sSI "https://cms-es.editionssociales.fr/wp-content/uploads/" | head -1   # les médias servent aussi
```

**3d. Garde noindex** — nouveau fichier versionné `site/wp-headless/es-cms-guard.php` (fichier **séparé** : ne pas toucher `es-headless-rest.php`, c'est le contrat), déployé par SFTP dans `wp-content/mu-plugins/`. **PHP vérifié ce jour via `GET /hosting/web/editionssociales.fr/ovhConfig` : les chemins `www`, `LaDispute` et `Boutique` tournent tous en PHP 8.4 (container stable64)** — la question ouverte de LEGACY-STACK §0 est levée. Par défense en profondeur (un mu-plugin qui fatale emporte front + REST + wp-admin ; le PHP d'un dossier peut être changé après nous), le code n'utilise **aucune fonction PHP ≥ 8** :
```php
<?php
/** Hosts cms-* : jamais indexés. Compat PHP 5+ volontaire (pas de str_starts_with). */
add_action('send_headers', function () {
  $h = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
  if (strpos($h, 'cms-') === 0)
    header('X-Robots-Tag: noindex, nofollow');
});
add_filter('robots_txt', function ($output) {
  $h = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
  if (strpos($h, 'cms-') === 0)
    return "User-agent: *\nDisallow: /\n";
  return $output;
}, 99);
```
**Ordre de dépôt prudent** : déployer d'abord sur `www`, vérifier que front + REST + wp-admin répondent, **puis** sur `LaDispute`. En profiter pour **redéployer `es-headless-rest.php` versionné** (recommandation recon R3 : la prod exécute une révision antérieure — `cover` string au lieu de `{url,width,height}` ; le front tolère les deux formes, zéro risque, gain des ratios exacts) — même séquence www → vérif → LaDispute.

**3e. Côté front** (une PR) :
- `next.config.ts` : **ajouter** aux `remotePatterns` `{ protocol: "https", hostname: "cms-es.editionssociales.fr", pathname: "/wp-content/**" }` et idem `cms-ld` (garder les hosts publics pendant toute la cohabitation).
- Helper pur `rebaseWpMediaUrl(url)` (dans `src/lib/cms-html.ts` ou un petit `src/lib/media.ts`, au choix de l'implémenteur dans le respect de `src/lib/CLAUDE.md`) : réécrit `https://(www.)?editionssociales.fr/wp-content/…` → `https://cms-es.editionssociales.fr/wp-content/…` et `(www.)?ladispute.fr` → `cms-ld…`. Appliqué (a) dans la transformation d'images/liens de `sanitizeCms` (qui réécrit déjà http→https), (b) dans `toCover` (`catalogue-core.ts`). Motif : `post_content` et `plus_loin` contiennent ~190 URLs absolues codées en dur vers les domaines publics (recon R3 §6) qui casseraient après le flip. Tests ajoutés dans `cms-html.test.ts` et `catalogue-core.test.ts`.
- Vercel env : `WP_ES_URL=https://cms-es.editionssociales.fr`, `WP_LD_URL=https://cms-ld.editionssociales.fr` (cibles production **et preview et development** — combler au passage l'absence de cible preview relevée en R4). `WC_STORE_URL` **inchangée**.

**Vérifier :** redéploiement → la prod beta rend toujours les 295 fiches avec couvertures (spot-check 5 fiches dont 1 avec PDF `table` et 1 avec images dans `plus_loin`) ; `pnpm test` vert.

### E4 — Table de redirections 301 (implémentation + vérification exhaustive)

**Formes d'URLs WordPress** (vérifiées dans les dumps : `permalink_structure = /%postname%/`, CPT `rewrite slug = catalogue`, taxonomies `auteur`/`collection`/`parution`) :
fiche `/catalogue/<slug>/` · archive `/catalogue/` · taxos `/auteur/<slug>/`, `/collection/<slug>/`, `/parution/a-paraitre/` · pages listées ci-dessous · flux `/feed/`. Les slugs du nouveau site **sont** les slugs WP (passés tels quels par le REST) → les patterns couvrent 100 % des fiches, y compris celles créées après aujourd'hui.

**Où** : `next.config.ts`, fonction `redirects()` (vérifiée docs Next 16 : `has:[{type:"host",…}]` et `statusCode` explicite supportés — `statusCode` **remplace** `permanent`, jamais les deux ; premier match gagnant ; s'applique avant le filesystem). ⚠️ **Syntaxe des sources : pas d'accolades `{}`** — `/feed{/:rest*}` ne compile pas avec le path-to-regexp embarqué de Next 16 (« Unexpected MODIFIER », vérifié ce jour) ; toujours deux règles séparées (`/feed` + `/feed/:rest*`). Statut piloté par env :
```ts
const PERM = process.env.REDIRECTS_PERMANENT === "1";
const r = (o: { source: string; destination: string }) => ({ ...o, statusCode: PERM ? 301 : 302 });
const t = (o: { source: string; destination: string }) => ({ ...o, statusCode: 302 }); // toujours temporaire
const onHost = (host: string, rules: any[]) =>
  rules.map((x) => ({ ...x, has: [{ type: "host", value: host }] }));
```

**Règles host `editionssociales.fr`** (ordre significatif — les spécifiques d'abord ; `/a-propos` et `/rencontres` existent nativement, aucune règle) :

| # | source | destination | statut |
|---|---|---|---|
| 1 | `/catalogue/page/:n(\\d+)` | `/catalogue/editions-sociales` | r |
| 2 | `/catalogue/:slug((?!editions-sociales$)(?!la-dispute$)[^/]+)` | `/catalogue/editions-sociales/:slug` | r |
| 3 | `/auteur/:slug` | `/catalogue/editions-sociales?author=:slug` | r |
| 4 | `/collection/:slug` | `/catalogue/editions-sociales?collection=:slug` | r |
| 5 | `/parution/:slug` | `/catalogue/editions-sociales?upcoming=1` | r |
| 6 | `/catalogue-collection`, `/catalogue-auteur` | `/catalogue/editions-sociales` | r |
| 7 | `/les-emissions-sociales` | `/a-propos` *(défaut, Q2)* | r |
| 8 | `/la-geme` | `https://gememarxengels.org` *(défaut, Q2)* | r |
| 9 | `/newsletter` | `/` *(la phase Newsletter la re-ciblera)* | t |
| 10 | `/marx-passe-lagreg` | `/catalogue/editions-sociales` *(défaut, Q2)* | r |
| 11 | `/feed`, `/feed/:rest*`, `/comments/feed` | `/` | r — **3 règles séparées** (pas d'accolades) |
| 12 | `/wp-content/:path*` | `https://cms-es.editionssociales.fr/wp-content/:path*` | r — garde vivants les 118 PDF + images partagés |
| 13 | `/wp-admin/:path*`, `/wp-login.php` | `https://cms-es.editionssociales.fr/…` | **t (302 pour toujours)** — les signets wp-admin de l'équipe ; le host cms disparaîtra en phase extinction |
| 14 | `/wp-json/:path*` | `https://cms-es.editionssociales.fr/wp-json/:path*` | t |

Les query params (`author=:slug`…) correspondent exactement au décodeur `parseBookFilters` (`src/lib/parse-filters.ts:14-25` — clés `edition, collection, author, q, sort, page, upcoming=1`) et les slugs de termes sont identiques côté WP et côté facettes (mêmes termes, passés par le REST).

**Règles host `ladispute.fr`** (tout part vers le domaine canonique, **catch-all final** — c'est le déménagement complet du domaine) :

| # | source | destination | statut |
|---|---|---|---|
| 1 | `/catalogue/page/:n(\\d+)` | `https://editionssociales.fr/catalogue/la-dispute` | r |
| 2 | `/catalogue/:slug` | `https://editionssociales.fr/catalogue/la-dispute/:slug` | r |
| 3 | `/catalogue` | `https://editionssociales.fr/catalogue/la-dispute` | r |
| 4 | `/auteur/:slug` | `https://editionssociales.fr/catalogue/la-dispute?author=:slug` | r |
| 5 | `/collection/:slug` | `https://editionssociales.fr/catalogue/la-dispute?collection=:slug` | r |
| 6 | `/parution/:slug` | `https://editionssociales.fr/catalogue/la-dispute?upcoming=1` | r — le terme `a-paraitre` existe côté LD (count=1, vérifié dans `editionsk712` ce jour) |
| 7 | `/a-propos` | `https://editionssociales.fr/editions/la-dispute` | r |
| 8 | `/rencontres` | `https://editionssociales.fr/rencontres` *(si Q8 retire la page : re-cibler vers `/editions/la-dispute`)* | r |
| 9 | `/catalogue-auteurs`, `/catalogue-collection` | `https://editionssociales.fr/catalogue/la-dispute` | r |
| 10 | `/wp-content/:path*` | `https://cms-ld.editionssociales.fr/wp-content/:path*` | r |
| 11 | `/wp-admin/:path*`, `/wp-login.php`, `/wp-json/:path*` | `https://cms-ld.editionssociales.fr/…` | t |
| 12 | `/:path*` (catch-all, **dernier**) | `https://editionssociales.fr/` | r — couvre `/` , `/article-0`, `/feed` et tout le reste |

**Méthode de construction/vérification exhaustive** (les patterns couvrent tout ; l'inventaire sert à le **prouver**) :

1. `scripts/build-redirect-inventory.mjs` : génère `scripts/redirect-inventory.csv` (colonnes `host,path,expected_status,expected_location`) depuis (a) la MariaDB :3307 — pages publiées, termes `auteur`/`collection` avec `count>0` (95 auteurs + 9 collections ES ; 176 + 6 LD — comptes vérifiés ce jour) + `parution`, (b) le **REST live** pour les slugs de fiches (295+, plus frais que le dump du 01/07), (c) un échantillon d'URLs `/wp-content/uploads/…` (couvertures + les 118 PDF depuis les champs `table`/`extrait`). ~620 lignes.
2. `scripts/verify-redirects.mjs` — ⚠️ **INTERDIT d'utiliser `fetch()`** : le fetch de Node (undici) **supprime silencieusement l'en-tête `Host` custom** (vérifié empiriquement ce jour : un serveur local reçoit `127.0.0.1:3999` malgré `headers: { Host: "editionssociales.fr" }`) — toutes les règles gâtées par `has:{type:"host"}` échoueraient et les cas négatifs passeraient par vacuité. Le script utilise **`node:http`/`node:https`.request** (transmet le Host — vérifié ce jour ; `curl -H "Host: …"` marche aussi et sert de contre-vérif manuelle) et embarque **deux garde-fous exécutés avant l'inventaire** :
   - **Self-test Host** : le script démarre un `http.createServer` éphémère, s'envoie une requête avec `Host: editionssociales.fr` par son propre client, et **s'arrête en erreur** si le serveur ne voit pas ce Host exact ;
   - **Test de compilation des sources** : import de la fonction `redirects()` de `next.config.ts` + `pathToRegexp` (depuis `next/dist/compiled/path-to-regexp`) sur chaque `source` — attrape toute syntaxe invalide avant le build (le `pnpm build` la casserait aussi, mais plus tard).
   Puis, pour chaque ligne de l'inventaire : requête `redirect: manual` (suivi manuel des `Location`, 3 sauts max), assertions statut + `Location`. **Cibles selon l'étape** :
   - *local* : `--target http://localhost:3000` après `pnpm build && pnpm start` — Host header direct (HTTP, pas de TLS) ;
   - *preview/prod pré-flip* : `--target https://editions-sociales-la-dispute.vercel.app` avec Host spoofé — le routage Vercel se fait sur l'en-tête Host et le certificat `vercel.app` reste valide ; **nécessite que les domaines soient déjà attachés au projet** (fait en E5 J−4). Repli si Vercel refusait ce montage : `curl --resolve editionssociales.fr:443:76.76.21.21 -k` (SNI réel, cert non vérifiable avant émission — assumé en pré-flip) ;
   - *post-flip* : URLs réelles directes, sans spoof.
   Cas **négatifs** inclus : `/catalogue/editions-sociales` et `/catalogue/la-dispute` sur host ES ne doivent **pas** rediriger (piège du pattern #2 — lookahead négatif, compilation vérifiée ce jour), `/a-propos`, `/` et `/souscription` doivent servir 200.
3. Ces scripts sont versionnés et relancés à chaque étape (E5, E6, E7).

**Vérifier :** `node scripts/verify-redirects.mjs --target http://localhost:3000` → self-test OK + compilation OK + 0 échec ; re-run sur la preview Vercel (mode Host spoofé).

### E5 — Bascule DNS `editionssociales.fr` (COHABITATION phase 3, maison 1)

Interdits absolus : **ne toucher à AUCUN enregistrement MX / SPF / DKIM / DMARC / TXT** (Email Pro en état hybride fragile + Brevo pré-câblé — recon R4) ; **ne pas toucher** aux records `boutique`, `www.boutique` (A + AAAA), `dev`, `www.dev`, ni aux records `cms-*` créés en E3. Seuls bougent — **IDs re-vérifiés ce jour** : **`@` (A, id 5080168574)** et **`www`, qui porte DEUX records : A (id 5080168577) ET un CNAME préexistant `www → editionssociales.fr.` (id 5080168571)** — coexistence irrégulière héritée, les deux sont à retirer au flip.

**J−4 (préparation) :**
1. Sauvegarde zone : `python3 $H GET /domain/zone/editionssociales.fr/export` → committer dans `ops/dns/editionssociales.fr.$(date +%F).zone` (artefact de rollback — il capture aussi le doublon A/CNAME de `www`).
2. Vercel : ajouter les domaines au projet (dashboard team `solidz` ou `vercel domains add`) : `editionssociales.fr` (primary) + `www.editionssociales.fr` (configuré « Redirect to editionssociales.fr », 308). Le domaine restera « misconfigured » jusqu'au flip — normal, et c'est ce qui **active le run pré-flip de `verify-redirects` en mode Host spoofé** (E4). ⚠️ **Ne PAS configurer `editions-sociales-la-dispute.vercel.app` en « Redirect to Primary Domain » à J−4** : le domaine final est encore servi par WordPress → les visiteurs de l'URL beta atterriraient 4 jours sur l'**ancien** site, l'endpoint webhook Stripe de la phase Dons (déclaré sur l'URL `vercel.app`) recevrait des 307/308 que **Stripe ne suit pas** (livraisons en échec), et la relecture client des dons sur la prod-beta casserait. Ce redirect se pose **le jour du flip** (Jour J, étape 4). Seul l'**attachement des domaines au projet** reste à J−4.
3. Merger E1–E4 sur `main` → déploiement prod (les redirections host ES sont inertes tant que le domaine ne pointe pas sur Vercel) ; `verify-redirects` en mode Host spoofé sur la prod Vercel → 0 échec.

**J−2 : abaisser les TTL** (records à TTL 0 = défaut de zone) :
```bash
python3 $H PUT /domain/zone/editionssociales.fr/record/5080168574 '{"ttl":300}'
python3 $H PUT /domain/zone/editionssociales.fr/record/5080168577 '{"ttl":300}'
python3 $H POST /domain/zone/editionssociales.fr/refresh '{}'
```

**Jour J (fenêtre 9h–11h, mardi — trafic faible, client joignable) :**
1. **WP_HOME/WP_SITEURL** de l'install `www` → host cms (fait DANS la fenêtre, pas avant : sinon le front public 301-erait vers `cms-es` pendant l'attente). Par SFTP, dans `wp-config.php` au-dessus de `/* That's all */` :
   ```php
   define('WP_HOME',    'https://cms-es.editionssociales.fr');
   define('WP_SITEURL', 'https://cms-es.editionssociales.fr');
   ```
   Vérifier : login sur `https://cms-es.editionssociales.fr/wp-admin` OK ; le REST émet désormais des URLs de covers en `cms-es` (le front accepte les deux hosts depuis E3e). Réversible en supprimant 2 lignes. **Aucune écriture en base** (pas de search-replace — principe n°1).
2. **Flip DNS** (valeurs vérifiées via l'API Vercel ce jour : A `76.76.21.21`, CNAME `cname.vercel-dns.com.`) :
   ```bash
   python3 $H PUT    /domain/zone/editionssociales.fr/record/5080168574 '{"target":"76.76.21.21","ttl":300}'
   python3 $H DELETE /domain/zone/editionssociales.fr/record/5080168577   # www A
   python3 $H DELETE /domain/zone/editionssociales.fr/record/5080168571   # www CNAME préexistant (doublon hérité)
   python3 $H POST   /domain/zone/editionssociales.fr/record \
     '{"fieldType":"CNAME","subDomain":"www","target":"cname.vercel-dns.com.","ttl":300}'
   python3 $H POST   /domain/zone/editionssociales.fr/refresh '{}'
   ```
   (Utiliser les valeurs affichées par le dashboard Vercel au moment T si elles diffèrent.)
3. Vercel env : `SITE_INDEXABLE=1` **et** `NEXT_PUBLIC_SITE_URL=https://editionssociales.fr` (production — posée au flip et non au merge, cf. E2.1) → **redéployer**.
4. **`editions-sociales-la-dispute.vercel.app` → « Redirect to Primary Domain »** (déplacé ici depuis J−4 — évite le contenu dupliqué post-flip), **simultanément** à la création du **second endpoint webhook Stripe sur `https://editionssociales.fr`** (la phase Dons garde les **deux** endpoints, `vercel.app` + domaine final — Stripe ne suit pas les 307/308).
5. **Vérifications** (dans l'heure) :
   - `dig +short editionssociales.fr @1.1.1.1` → 76.76.21.21 ; certificat auto-émis par Vercel (curl -sSI → 200, émetteur Let's Encrypt/Vercel).
   - `node scripts/verify-redirects.mjs --target https://editionssociales.fr --host-filter editionssociales.fr` → 0 échec (mode direct, plus de spoof).
   - `curl -s https://editionssociales.fr/robots.txt` → Allow + sitemap ; `/sitemap.xml` → 200.
   - **Boutique intacte** : `curl -sSI https://boutique.editionssociales.fr` → 200 OVH ; un achat de test jusqu'à l'écran de paiement (Paybox — cf. Recette #3).
   - **Email intact** : envoyer/recevoir un message sur `toutes@editionssociales.fr` ; `dig MX editionssociales.fr` inchangé (mx3/mx4/mxb.ovh.net).
   - **Chaîne d'édition intacte** : l'équipe modifie une fiche dans `cms-es…/wp-admin` → visible sur le site ≤ 1 h (fenêtre ISR), ou immédiatement après redéploiement.
   - **`editions-sociales.fr`/`.com` : rien ne change au flip et rien n'est à vérifier ici** — contrairement à ce que suggérait la recon R4, ces domaines **ne redirigent pas** aujourd'hui : zéro redirection configurée (`GET /domain/zone/…/redirection` → `[]`, vérifié ce jour) et ils servent la page parking OVH « Site en construction » (200, meta robots `none`, vérifié par HTTP live ce jour). Leur traitement (pointage vers Vercel en « Redirect to Primary ») est un bonus optionnel post-E7 — cf. E8.4bis.
   - GSC : soumettre le sitemap.
6. Retirer/adapter le lien `legacyUrl` de la page maison (`src/app/editions/[slug]/page.tsx:86` + `src/lib/editions.ts:26`) : « l'ancien site » ES pointe désormais sur… le site lui-même. Petite PR le jour même (retirer le bloc pour ES, garder pour LD jusqu'à E6).

**Rollback (tant que la période de recouvrement court)** : remettre `@` A → `213.186.33.17`, supprimer le CNAME `www → cname.vercel-dns.com`, recréer les records `www` d'origine depuis l'export de zone (A → `213.186.33.17` a minima), supprimer les 2 defines de `wp-config.php`. Effectif en ~5 min (TTL 300) **côté DNS** — avec une **limite connue et documentée** : la normalisation trailing-slash de Next (`/x/` → `/x`) est un **308 permanent servi dès le jour 1** (vérifié `load-custom-routes.js:566`), même pendant la période « 302 » ; un visiteur passé sur le nouveau site peut donc, après rollback, boucler entre son 308 en cache et le 301 inverse de WordPress. Exposition bornée aux visiteurs de la fenêtre ; consigne en cas de rollback réel : « vider le cache / navigation privée ». Cette limite figure dans le document de rollback remis au client (Recette #10). Garder TTL 300 une semaine, puis remettre 3600.

### E6 — Bascule DNS `ladispute.fr` (maison 2, après validation ES ≥ 48 h)

Même procédure, zone `ladispute.fr` (records re-vérifiés ce jour : `@` A id 5115393735, `www` A id 5115393736, pas d'AAAA ni de CNAME parasite ; **MX mx1/mx2/mxb intouchés**) :
- J−4 : export de zone ; ajouter `ladispute.fr` + `www.ladispute.fr` au projet Vercel. ⚠️ **`ladispute.fr` s'ajoute comme domaine normal, PAS en « Redirect to Primary »** — la redirection domaine de Vercel préserve le chemin tel quel, ce qui casserait le mapping `/catalogue/<slug>` → `/catalogue/la-dispute/<slug>` ; ce sont les règles host de `next.config.ts` (E4) qui font foi. `www.ladispute.fr` → redirect vers `ladispute.fr`. Run `verify-redirects` pré-flip en mode Host spoofé (`Host: ladispute.fr` sur l'URL vercel.app).
- J−2 : TTL 300 sur les 2 records.
- J : defines `WP_HOME/WP_SITEURL = https://cms-ld.editionssociales.fr` dans `wp-config.php` de `LaDispute` ; flip `@` → A 76.76.21.21, `www` → CNAME `cname.vercel-dns.com.` ; refresh ; `verify-redirects.mjs --host-filter ladispute.fr` (y compris le catch-all : `curl -sI https://ladispute.fr/nimporte-quoi` → 302 vers editionssociales.fr, et la règle #6 `/parution/a-paraitre`) ; test email : les MX de ladispute.fr (offre « redirect ») inchangés.
- Rollback identique (2 records + 2 defines, même limite 308 documentée).

### E7 — Passage 302 → 301 (après validation client — promis au devis)

Après la recette et validation explicite du client sur : les destinations des redirections « pages orphelines » (Q2), le bon fonctionnement général pendant ≥ 1 semaine de recouvrement.
- Vercel env : `REDIRECTS_PERMANENT=1` (production) → redéployer.
- `verify-redirects.mjs` : attend désormais 301 (le script lit la même env).
- GSC : outil « Changement d'adresse » pour ladispute.fr.
- Ne passent **jamais** en 301 : `/wp-admin`, `/wp-login.php`, `/wp-json`, `/newsletter` (règles `t`).

### E8 — Revue de facturation Email Pro, résiliation du slot OVH vide `ladispi` + nettoyages post-recouvrement — ⚠️ GATE

**Fait établi (vérifié par l'API OVH, absent des docs)** : `la-dispute.fr` porte **4 boîtes mail actives** (`a-cukier@`, `la-dispute@`, `m-simonin@`, `c-laspalas@`) + 1 redirection, sur l'offre **« MXPLAN 1000 hosting »** — créée le **même jour** que le slot `ladispi` (2020-06-03), même expiration (2027-06-01), serviceIds adjacents (31854572 / 31854542). Le suffixe « hosting » de l'offre indique très probablement un plan email **inclus dans l'hébergement** → résilier le slot risque de **supprimer 4 boîtes mail vivantes**. Ce serait une violation directe de « les MX/emails ne doivent JAMAIS être touchés ».

**E8.0 — Revue de facturation Email Pro** (engagement C94 du devis, ~15–30 min, **aucun risque DNS** — indépendante du gate ci-dessous) : avec le client dans le manager OVH, lister les services `/email/pro` et les factures récentes, identifier la ligne Email Pro **facturée en double (22,87 €)**, puis ouvrir un ticket OVH ou résilier le doublon — **JAMAIS le service porteur des MX**. Consigner le résultat dans la recette (point 9).

**Procédure gâtée :**
1. **Gate (bloquant)** : confirmer auprès d'OVH (le simulateur de résiliation du manager liste les services entraînés ; sinon ticket support) si la résiliation de `ladispi.cluster028.hosting.ovh.net` emporte le service email `la-dispute.fr`. Qui : Youri avec le client (compte OVH client).
2. **Si emporté** → décision client (Q5) : (a) migrer les 4 boîtes (vers l'Email Pro existant en ajoutant le domaine `la-dispute.fr`, coût ~qq €/boîte/mois, ou vers l'offre MX Plan du slot Pro) **avant** résiliation — effort hors périmètre vendu, à chiffrer (~0,25–0,5 j) ; ou (b) **garder le slot** (287 €/an = le prix de 4 boîtes mail, à présenter honnêtement).
3. **Si indépendant** → vérifier une dernière fois que le slot est vide : `GET /hosting/web/ladispi…` (quota 0 Mo), `GET …/attachedDomain` (= `ladispi…`, `la-dispute.fr`, `www.la-dispute.fr` — vérifié), `GET …/database` (aucune). Puis résiliation **par le client** dans le manager OVH (Youri accompagne). Le renouvellement est au 2027-06-01 : une résiliation « à expiration » est aussi acceptable si l'anti-prorata est défavorable.
4. Post-résiliation, le web de `la-dispute.fr` ne sert plus rien (le mail, s'il survit, continue — les MX de cette zone ne bougent pas). Optionnel (15 min, dans le périmètre « domaines conservés ») : pointer `@`/`www` de `la-dispute.fr` vers Vercel et ajouter une règle host → `https://editionssociales.fr/editions/la-dispute`.

**4bis. Nettoyages post-E7 (JAMAIS pendant le recouvrement — le rollback DNS a besoin des attachedDomains) :**
- **Détacher du slot Pro** les attachedDomains devenus orphelins : `editionssociales.fr`, `www.editionssociales.fr`, `ladispute.fr`, `www.ladispute.fr` (**ne toucher ni `boutique.*`, ni `gememarxengels.org`, ni `dev.*`, ni les `cms-*`**). Motif : après le flip ils ne résolvent plus vers le cluster → leurs renouvellements Let's Encrypt échoueront ; si les renouvellements du cert multi-domaines sont couplés, c'est le HTTPS de `cms-es`/`cms-ld` qui mourrait dans la fenêtre de 90 jours — potentiellement pendant la fermeture d'août. D'ici là : **check d'expiration TLS de `cms-es`/`cms-ld`** dans les vérifs hebdo (curl ou moniteur P8).
- **Optionnel (décision client, non bloquant)** : `editions-sociales.fr`/`.com` ne redirigent pas aujourd'hui (page parking OVH, vérifié ce jour — la « redirection OVH » supposée par R4 n'existe pas) ; les ajouter au projet Vercel en « Redirect to Primary Domain » (301) + flip A `@`/`www` (leurs MX « redirect » intouchés) = ~15 min pour récupérer deux domaines défensifs qui pointent enfin quelque part.

### E9 — Transfert de propriété au client (devis §9 — « au plus tard à la mise en production »)

Le devis engage : version de démonstration **transférée sans perte d'historique au plus tard à la mise en production**, comptes **au nom de la structure**, abonnements **payés par elle dès la mise en production**, Youri **invité** ensuite. Les coquilles existent (recon R4 : compte GitHub `editionssociales`, team Vercel `ldes` — vides). Cette étape les remplit.

**Séquencement recommandé** : fenêtre **30–31/07** (fin de la semaine de recette), **après E7** — une seule pièce mobile à la fois pendant les flips ; **dry-run calé au 17–20/07** (projet jetable + ressource factice) pour dérisquer la fenêtre. C'est un léger écart avec la lettre du devis (« au plus tard à la mise en production » = le flip du 21/07) : **écart à acter explicitement avec le client à la démo du 15/07 (Q7)**, avec l'alternative « transfert avant flip » s'il y tient (plus conforme, plus risqué opérationnellement). La **facturation Vercel bascule côté client au transfert** — et au plus tard à la mise en production selon le devis : si le client veut la conformité stricte, passer `ldes` en Pro avec sa carte dès le 21/07 même si le projet n'est transféré que le 30.

**Protocole de référence : phase 7, étape 9 — E9 en est le simple exécutant.** Ordre : transfert du **repo**, puis du **projet** Vercel, puis **transferts séparés** de l'intégration Marketplace **Neon** et des **stores Vercel Blob** — ces deux-là **ne suivent PAS un transfert de projet** (vérifié en doc par les phases 6 et 7). **Critère de preuve** à chaque pas : propriété visible **dans le dashboard du compte client**. **Fallback** si un transfert de ressource bloque : **remise de la team entière** au client. La décision « **team entière vs projet + ressources** » est une **décision client** : posée à la démo du 15/07 (Q7), tranchée avant le 28/07. **Post-transfert : re-vérifier l'endpoint webhook Stripe et re-poser les secrets.**

1. **GitHub (repo d'abord)** : transfert du repo `yourimerad/editions-sociales-la-dispute` → compte `editionssociales` (Settings → Transfer ownership), Youri ajouté **collaborateur admin**. GitHub redirige l'ancien slug.
2. **Vercel (projet ensuite)** : team `ldes` passée en plan **Pro** avec la carte du client (P10) → **transfert du projet** `editions-sociales-la-dispute` de `solidz` vers `ldes` (dashboard : Settings → Transfer). Le transfert de projet emporte domaines, env vars, déploiements et certificats — aucun changement DNS (A `76.76.21.21` et `cname.vercel-dns.com` sont génériques, le routage se fait par hostname) — **mais NI l'intégration Neon NI les stores Blob** (étape 3). **Re-vérifier/re-lier l'intégration Git Vercel** sur le nouveau slug (Settings → Git du projet) et re-merger un commit de test → build auto.
3. **Ressources (transferts séparés — protocole phase 7 étape 9)** : intégration Marketplace **Neon**, puis **stores Vercel Blob**. **Preuve** exigée pour chacun : propriété visible dans le dashboard du compte client. **Fallback** : remise de la team entière.
4. **Vérifications post-transfert** : prod 200, un redéploiement depuis `main` passe, les 4+3 env vars présentes, domaines « valid » ; **re-vérifier l'endpoint webhook Stripe** (les deux endpoints, cf. E5 Jour J étape 4) et **re-poser les secrets**.
5. **Recâblage outillage** : à partir d'ici, les tokens de `site/.env` (`GITHUB_PAT` compte `editionssociales`, `VERCEL_TOKEN` team `ldes`) **deviennent les bons** ; les tokens shell `yourimerad`/`solidz` deviennent les identifiants « invité ». Documenter la bascule dans le README ops.
6. **GSC** : si repli P9 utilisé (propriétés chez Youri), transférer la propriété des deux propriétés GSC au compte Google du client.
7. **Trace écrite** remise au client : liste des comptes, qui est owner, qui est invité, ce qui est facturé où (rejoint Recette #10).

Hors périmètre de cette étape (autres phases) : Stripe (existe déjà au nom du client), Brevo/Sentry/Better Stack (créés directement au nom du client dans leurs phases — cf. décisions de stack §2).

---

## Données et migration

Pas de migration de données dans cette phase (c'est la phase 3). Données **lues** :
- **Dumps MariaDB :3307** (source : `/Users/yourihamon/marina_es/_databases/*.20260701.sql.gz`) : pages publiées, termes de taxonomies, `permalink_structure` — pour `build-redirect-inventory.mjs`. Lecture seule.
- **REST live** (`cms-es`/`cms-ld` après E3) : slugs de fiches frais pour l'inventaire de vérification.
- **Rollback** : exports de zone DNS datés committés dans `ops/dns/` avant chaque modification (ils capturent notamment le doublon A+CNAME de `www.editionssociales.fr`) ; `wp-config.php` originaux sauvegardés (copie datée à côté, ex. `wp-config.php.pre-cms.bak`) avant ajout des defines.

---

## Recette et critères d'acceptation (point de vue client)

À dérouler avec l'équipe (visioconférence ou checklist partagée), **avant la fermeture d'août** :

1. **Le site répond sur les vraies adresses** : `https://editionssociales.fr` et `https://ladispute.fr` affichent le nouveau site, cadenas TLS valide, sur ordinateur et téléphone.
2. **Aucun lien ancien n'est cassé** : 10 URLs d'anciens partages fournis par l'équipe (fiches, PDF de table des matières, page auteur, newsletters passées) aboutissent au bon endroit. Rapport `verify-redirects` : 0 échec sur ~620 URLs, remis en annexe.
3. **La boutique vend toujours** : un achat de test complet sur `boutique.editionssociales.fr` **jusqu'à l'écran de paiement Paybox (ou un paiement Paybox réel remboursé ensuite)**. Paybox est bien la passerelle à tester : contrairement au devis §3.2 (« vos lecteurs paient déjà via Stripe »), la base est formelle — **100 % des commandes CB 2018→07/2026 sont Paybox, Stripe Woo est installé mais `enabled=no` sur un compte test** (re-vérifié ce jour dans le dump : commandes 2026 = 601 paybox_std + 5 paybox_3x + 0 stripe). Tester « le tuyau Stripe » ici testerait un tuyau débranché.
4. **Les emails fonctionnent à l'identique** : envoi/réception sur `toutes@editionssociales.fr` et sur **chacune des 4 boîtes** `@la-dispute.fr` ; les redirections mail de `ladispute.fr` suivent.
5. **L'équipe peut toujours éditer le catalogue** : connexion à `cms-es…/wp-admin` et `cms-ld…/wp-admin` (les anciens signets `/wp-admin` redirigent) ; une modification de fiche apparaît sur le site en ≤ 1 h.
6. **Pages légales** : mentions légales, confidentialité, CGV/dons accessibles depuis le pied de page, contenu validé par le client (échange email faisant foi) ; la politique de confidentialité ne décrit **que** des traitements réellement actifs.
7. **SEO** : `robots.txt` public et permissif, `sitemap.xml` soumis dans Search Console, propriétés GSC au nom du client (ou transfert tracé — P9/E9) ; une recherche `site:editionssociales.fr` commence à refléter les nouvelles URLs (constat à J+15, informatif). Si Q8 a retiré `/rencontres` : elle est absente du sitemap et la règle LD #8 re-ciblée.
8. **404 propre** : une URL inventée affiche la page « introuvable » du site (`not-found.tsx`), pas une erreur brute.
9. **Slot vide** : décision Q5 actée ; si résiliation, confirmation OVH reçue et **aucune boîte mail perdue** (re-test du point 4 après résiliation).
10. **Réversibilité démontrée + propriété transférée** : le document de rollback (records DNS d'origine + defines à retirer + **limite documentée du 308 trailing-slash en cache navigateur**) est remis au client ; les WordPress n'ont subi **aucune** suppression ; le projet Vercel et le repo GitHub sont **au nom du client**, facturation Vercel côté client, Youri invité (E9), trace écrite remise.

---

## Risques et parades

| Risque | Gravité | Parade |
|---|---|---|
| **Résiliation ladispi supprime les 4 boîtes mail de la-dispute.fr** | Critique | Gate E8.1 obligatoire avant toute résiliation ; décision client Q5 ; re-test mail post-résiliation. Ne jamais résilier sans la confirmation OVH écrite. |
| MX/DKIM/SPF cassés par une manip de zone | Critique | Seuls 3 records zone ES + 2 records zone LD sont touchés, désignés **par ID** (re-relevés ce jour, y compris le CNAME `www` caché de la zone ES) ; export de zone committé avant ; test mail dans la fenêtre de flip. |
| **L'outil de preuve ment** : un client HTTP qui n'émet pas le Host custom ferait passer la vérif par vacuité | Élevée | Éliminé par construction : `fetch`/undici **interdit** (défaut vérifié empiriquement), client `http.request`/curl, **self-test Host bloquant** au démarrage du script (E4.2) — le script ne peut plus « réussir » sans émettre le Host. |
| Pattern `/catalogue/:slug` avale les routes natives `/catalogue/editions-sociales` et `/catalogue/la-dispute` | Élevée | Lookahead négatif (compilation vérifiée ce jour) + **cas négatifs dans `verify-redirects.mjs`**, exécuté avant tout flip. |
| Syntaxe de source invalide (`{}`) casse le build au mauvais moment | Moyenne | Vérifié ce jour : accolades bannies (règles /feed dédoublées) ; test de compilation des sources intégré au script (E4.2), exécuté en CI et avant chaque flip ; `pnpm build` en double filet. |
| Images/PDF morts post-flip (URLs absolues vers les domaines publics dans covers, `plus_loin`, `content`) | Élevée | Triple ceinture : defines `WP_HOME` (le REST émet les hosts cms), helper `rebaseWpMediaUrl` côté front (E3e, testé), règles `/wp-content/*` → cms (E4 ES#12/LD#10). |
| Mu-plugin `es-cms-guard.php` fatale et emporte un WordPress source | Moyenne→éliminée | PHP 8.4 vérifié ce jour sur les 4 chemins (`ovhConfig`) **et** code restreint à PHP 5+ (`strpos === 0`, pas de `str_starts_with`) **et** déploiement séquencé www → vérif → LaDispute (E3d). |
| `WP_HOME` changé trop tôt → le public est 301-é vers `cms-*` avant le flip | Moyenne | Les defines se posent **dans la fenêtre de flip**, jamais avant ; le REST, lui, marche sur les hosts cms sans defines (vérifié en E3c avant tout engagement). |
| Émission du certificat Let's Encrypt OVH sur `cms-*` ou Vercel sur l'apex qui traîne | Moyenne | E3 fait plusieurs jours avant E5 (marge) ; au flip, TTL 300 → rollback 5 min si le cert Vercel n'arrive pas ; statut visible dans le dashboard. |
| **Renouvellement LE du slot OVH couplé aux domaines flippés → HTTPS de `cms-*` meurt sous 90 j** (pendant la fermeture d'août au pire) | Moyenne | Détachement des attachedDomains orphelins **après E7** (E8.4bis, jamais pendant le recouvrement) ; check d'expiration TLS `cms-es`/`cms-ld` dans les vérifs / moniteur P8 d'ici là. |
| Rollback DNS incomplet côté navigateurs (308 trailing-slash permanent en cache dès le jour 1) | Faible (bornée) | Limite documentée dans le document de rollback (Recette #10) ; consigne « vider le cache / navigation privée » ; `skipTrailingSlashRedirect` écarté (coûte plus qu'il ne rapporte). |
| **Transfert Vercel/GitHub (E9) casse le pipeline** (intégration Git à re-lier, tokens à permuter) | Moyenne | Transfert après E7, hors fenêtre de flip ; checklist E9 (redéploiement de test, domaines « valid », re-lien Git) ; les deux jeux de tokens coexistent pendant la transition. |
| L'équipe perdue par le nouveau `/wp-admin` | Faible | Redirections 302 wp-admin/wp-login (E4 #13), email à l'équipe avec les 2 nouvelles URLs, point à la démo du 15/07. |
| Deux WP restent la source — une maintenance WP casse le contrat pendant la cohabitation | Faible | Règles COHABITATION inchangées (ne rien renommer, préserver les mu-plugins — désormais **2** fichiers versionnés dans `site/wp-headless/`). |
| Chaînes de redirection à double saut (trailing slash WP `/x/` → Next normalise → règle) | Cosmétique | Comportement Next par défaut, 2 sauts max, acceptable SEO ; vérifié par le script (suivi des `Location`, 3 sauts max). |
| Fuite de scope : « tant qu'on y est » (OG images, analytics, monitoring…) | — | Hors périmètre vendu ; analytics/monitoring = phase Ops (seule exception : la synchro analytics ↔ page confidentialité, E1) ; noter et refuser poliment. |

---

## Dépendances et interfaces avec les autres phases

- **Phase Dons (avant le 15/08, prioritaire)** : indépendante en code, mais **le flip ES doit précéder le lancement de campagne** pour que les liens de dons partagés soient `editionssociales.fr`. Interface concrète : l'endpoint webhook Stripe devra être déclaré sur le domaine final (si les dons sortent avant le flip, déclarer les deux URLs de webhook, puis retirer celle en `vercel.app`). Les pages légales (E1, section dons de `/cgv` + section Stripe de `/confidentialite`) sont un **prérequis de mise en réel des paiements**. ⚠️ Si E9 (transfert Vercel) a lieu avant la mise en réel des dons, re-vérifier le webhook après transfert.
- **Démo back-office du mercredi 15/07** : même semaine que E1–E3. Le problème d'accès client aux previews (SSO Vercel, recon R4) appartient à cette démo, pas à cette phase — mais la fenêtre est partagée : prévoir des liens partageables. La démo est l'occasion de collecter P4 (infos légales), P6 (feu vert bascule), P9 (compte Google), P10 (modalités transfert) et les décisions Q1–Q8.
- **Phase 3 (catalogue → Postgres/Payload)** : cette phase n'y touche pas ; le swap se fera derrière `CatalogueSource` (principe n°2). Les hosts `cms-*` survivent à la migration catalogue (admin WP jusqu'à extinction en phase ultérieure) ; à l'extinction seulement, retirer les `remotePatterns` cms et les règles E4 ES#13/#14, LD#11. Le redéploiement du mu-plugin versionné (E3d) rend la forme `book` capturée par la future migration = la forme finale `{url,width,height}` (recommandation R3 §7.3). ⚠️ Neon est créé le **10/07 sous `solidz`** (avant E9) — c'est le **transfert de ressource** (protocole phase 7, étape 9) qui le fait déménager vers `ldes`, pas le lieu de création ; seul le provisioning **postérieur** à E9 se fait directement dans `ldes`.
- **Phase Commerce (septembre)** : `boutique.editionssociales.fr` et `WC_STORE_URL` strictement intouchés ici ; les CGV s'étendront alors (rétractation, médiation, livraison) ; la bascule du sous-domaine boutique sera une répétition de E5 en plus simple. La bascule de PSP (Paybox → Stripe, cf. Recette #3 et recon R2 §2.4) appartient à cette phase-là.
- **Phase Ops (Sentry/Better Stack/Analytics)** : les moniteurs Better Stack devraient exister avant E5 (P8, y compris check TLS `cms-*`) ; **synchro obligatoire E1 ↔ activation Vercel Web Analytics** (la politique de confidentialité ne doit ni précéder ni oublier le traitement) ; `SITE_INDEXABLE`/`NEXT_PUBLIC_SITE_URL`/`REDIRECTS_PERMANENT` sont à documenter dans `.env.example` pour toutes les phases suivantes.
- **Phase Newsletter** : la règle E4 ES#9 (`/newsletter` → `/`, 302) sera re-ciblée vers le vrai formulaire d'inscription.
- **Docs à mettre à jour en fin de phase** (dette signalée par la recon) : `COHABITATION.md` (phases 2–3 cochées, mention repo GitHub corrigée), `README.md` racine (périmé sur l'archi), `LEGACY-STACK.md` §0/§11 (PHP par dossier relevé ce jour : 8.4 partout ; question ladispi résolue ; boîtes mail la-dispute.fr documentées ; `editions-sociales.fr/.com` = parking, pas redirection ; **Paybox = passerelle active, Stripe Woo désactivé** — §8 est faux sur ce point).

---

## Calage calendrier (aujourd'hui : jeudi 09/07/2026)

| Date | Étape | Acteur |
|---|---|---|
| Ven 10/07 → dim 12/07 | E1 (gabarits légales) + E2 + E4 (scripts + règles, self-test Host inclus) en PRs ; P5 (merge CI) ; demande P4/P9/P10 envoyée au client | Agents + Youri |
| Lun 13/07 | E3 complet (DNS cms-\*, attachedDomains, SSL, mu-plugin guard **www puis LaDispute** + redéploiement mu-plugin versionné, env Vercel, PR front `rebaseWpMediaUrl`) ; `verify-redirects` vert en local | Youri + agents |
| **Mer 15/07** | Démo back-office (autre phase) — y collecter : P4, P6, P9, P10, Q1–Q8, annonce du calendrier de bascule à l'équipe | Youri + client |
| Jeu 16 – ven 17/07 | Retours client légales intégrés et publiés ; merge E1–E4 sur `main` ; domaines ajoutés au projet Vercel (E5 J−4) ; `verify-redirects` vert **en mode Host spoofé sur la prod Vercel** | Agents + Youri |
| Ven 17 – sam 18/07 | E5 J−2 : TTL 300 zone ES | Youri |
| **Mar 21/07 matin** | **E5 : flip DNS editionssociales.fr** (3 records, IDs relevés) + `SITE_INDEXABLE=1` + vérifs + GSC | Youri (client prévenu) |
| Mer 22/07 | E6 J−2 : TTL 300 zone LD (si ES stable 24 h) | Youri |
| **Ven 24/07 matin** | **E6 : flip DNS ladispute.fr** (≥ 48 h après E5 ; repli lun 27/07) | Youri |
| Sem. 20–24/07 | E8 gate : réponse OVH sur le couplage slot/MXPLAN ; décision client Q5 | Youri + client |
| **Mar 28 – ven 31/07** | **Recette complète** avec l'équipe (checklist ci-dessus) ; **E7 : 302 → 301** après validation ; E8 résiliation si gate levé + E8.4bis (détachement attachedDomains, option editions-sociales.fr/.com) ; **E9 : transfert Vercel + GitHub + bascule facturation** ; mise à jour docs | Youri + client |
| (15/08) | Lancement campagne — cette phase est terminée depuis 2 semaines, marge confortable | — |

**Effort vs vendu — à signaler honnêtement à l'orchestrateur** : vendu **1 j** (+ le transfert, engagement du devis §9 sans ligne chiffrée propre). Estimation réelle : légales 0,5 j (rédaction + validation) · SEO 0,25 j · découplage 0,25 j · redirections + scripts de preuve 0,5 j · 2 flips 0,5 j · résiliation + recette 0,35 j · **transfert E9 0,25 j** ≈ **2,5–2,75 j de travail réparti**, dont ~1–1,25 j de temps humain Youri (le reste est agent-exécutable et étalé sur 3 semaines calendaires — la ligne du devis reste tenable en temps humain, pas en temps brut). **Hors périmètre vendu** : la migration éventuelle des 4 boîtes mail de `la-dispute.fr` (E8, +0,25–0,5 j) — à chiffrer séparément si le gate confirme le couplage ; l'alternative « garder le slot » coûte 0 j et 287 €/an au client.

---

## Questions ouvertes / décisions client

| # | Question | À trancher au plus tard | Défaut recommandé |
|---|---|---|---|
| Q1 | Informations légales complètes (P4) + **forme juridique** (association 1901 ?) — conditionne mentions légales, CGV et reçus fiscaux | 17/07 (publication légales) ; les placeholders bloquent le flip du 21/07 | Publier avec les infos partielles fournies, compléter au fil de l'eau — mais SIRET + directeur de publication sont non négociables avant flip |
| Q2 | Destinations des pages orphelines : `/les-emissions-sociales` (→ `/a-propos` ?), `/la-geme` (→ gememarxengels.org ?), `/marx-passe-lagreg` (→ catalogue ES ?) | Avant E7 (passage 301 — les 302 se corrigent sans coût) | Défauts du tableau E4 ; en 302 pendant tout le recouvrement précisément pour pouvoir ajuster |
| Q3 | Domaine canonique unique = `editionssociales.fr` (ladispute.fr redirige tout) — implicite dans « un seul site », à verbaliser. Inclut le sort des domaines défensifs `editions-sociales.fr/.com` (aujourd'hui : page parking OVH, **aucune redirection** — vérifié) : les pointer vers le site (option E8.4bis) ? | Démo 15/07 (canonique) ; E8.4bis peut attendre | Oui — `editionssociales.fr` canonique ; défensifs → « Redirect to Primary » post-E7 (15 min, MX intouchés) |
| Q4 | Reçus fiscaux pour les dons (dépend Q1) — impacte le texte `/cgv` et la phase Dons | Avant mise en réel des dons (fin juillet) | Ne **pas** promettre de reçu fiscal dans les CGV tant que le statut n'est pas confirmé |
| Q5 | Sort du slot `ladispi` si le gate E8 confirme que sa résiliation emporte les 4 boîtes mail `@la-dispute.fr` : migrer les boîtes (surcoût ponctuel ~0,25–0,5 j + abonnement Email Pro) ou garder le slot (287 €/an) | Fin juillet (recette) — aucune urgence : renouvellement au 01/06/2027 | Si couplé : **différer la résiliation** et présenter les deux chiffrages au client ; ne jamais sacrifier une boîte mail pour 287 €/an sans décision explicite |
| Q6 | Date exacte du flip ES (proposé : mar 21/07 matin) et fenêtre de présence d'un référent client | Démo 15/07 | Mar 21/07 9h–11h ; à défaut, tout mardi/jeudi matin avant le 24/07 |
| Q7 | **Date et modalités du transfert de propriété (E9)** — le devis §9 dit « au plus tard à la mise en production » (= flip du 21/07) ; le plan propose la semaine de recette (28–31/07) pour ne pas empiler transfert et flips | Démo 15/07 (acter l'écart ou avancer E9) | Transfert à la recette, **facturation Vercel côté client dès le 21/07** (team `ldes` en Pro avec la carte du client) — conformité économique immédiate, transfert technique une semaine après |
| Q8 | **Page `/rencontres`** : le devis §10 la retire au lancement si aucun événement réel n'est fourni — impacte sitemap (E2), règle LD #8 (E4) et recette #7 | Démo 15/07 | Si pas d'événements : retirer la page, la sortir du sitemap, re-cibler LD #8 vers `/editions/la-dispute` ; sinon la garder telle quelle (cartes réelles = autre phase) |
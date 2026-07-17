import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * E4 du plan (`plan/02-mise-en-production.md`) — table de redirections 301 de
 * reprise, exécutée avant tout flip DNS (les règles host sont inertes tant que
 * le domaine ne pointe pas sur ce projet Vercel). Statut piloté par env :
 * 302 par défaut pendant tout le recouvrement (ajustable sans redéploiement de
 * code — cf. Q2/Q8 du plan), 301 seulement après validation client (E7).
 *
 * ⚠️ Jamais `permanent: false` (émettrait des 307, pas des 302) : toujours
 * `statusCode` explicite. `redirects()` documente `statusCode` **remplace**
 * `permanent`, jamais les deux (docs Next 16, redirects.md).
 */
const REDIRECTS_PERMANENT = process.env.REDIRECTS_PERMANENT === "1";

type RedirectRule = {
  source: string;
  destination: string;
  /** Cf. `redirects.md`, `has`/`missing` : items non transmis à `onHost` (qui ne touche que `has`). */
  missing?: { type: "query"; key: string }[];
};
type StatusedRule = RedirectRule & { statusCode: 301 | 302 };
type HostRule = StatusedRule & { has: [{ type: "host"; value: string }] };

/** Redirection de reprise : 302 pendant le recouvrement, 301 au définitif (`REDIRECTS_PERMANENT=1`). */
const r = (o: RedirectRule): StatusedRule => ({ ...o, statusCode: REDIRECTS_PERMANENT ? 301 : 302 });
/** Toujours temporaire : signets wp-admin/wp-login/wp-json de l'équipe vers un host cms-* voué à disparaître. */
const t = (o: RedirectRule): StatusedRule => ({ ...o, statusCode: 302 });
/** Restreint un groupe de règles à un host (cohabitation ES/LD sur le même projet Vercel). */
const onHost = (host: string, rules: StatusedRule[]): HostRule[] =>
  rules.map((x) => ({ ...x, has: [{ type: "host", value: host }] }));

/**
 * Boutique WooCommerce (`plan/02-mise-en-production.md` §Table de
 * redirections, `plan/07-cloture.md` étape 4, P7) : **deux** hostnames à
 * couvrir — l'apex ET `www.boutique.editionssociales.fr` (la zone OVH a des
 * A/AAAA sur les deux, `plan/07-cloture.md` G5 : sans ça les vieux liens en
 * `www.boutique` tombent sur une erreur OVH après détachement du WordPress).
 */
// Exporté (nommé) : réutilisé tel quel par `scripts/build-redirect-inventory.mjs`
// pour générer l'inventaire de vérification du host boutique — une seule liste
// de hosts, jamais deux qui pourraient diverger.
export const BOUTIQUE_HOSTS = ["boutique.editionssociales.fr", "www.boutique.editionssociales.fr"];

/**
 * Table de redirections `/produit/<slug>` — artefact **versionné**
 * (`src/lib/redirects-produits.json`, généré par
 * `scripts/build-product-redirects.ts`), lu ici en synchrone : aucune I/O
 * réseau/DB au build, contrairement à `scripts/redirect-inventory.csv`
 * (régénéré à chaque étape, jamais commité — cf. le commentaire de
 * `build-redirect-inventory.mjs`). Décision d'arbitrage du plan : UNE seule
 * table, générée une fois, réutilisée telle quelle au Jour J (302) puis à la
 * clôture (301) — seul `REDIRECTS_PERMANENT` change le statut, jamais le
 * contenu de la table entre les deux moments.
 */
interface ProductRedirectTarget {
  /** `null` = fiche `origin: "boutique"` (produit orphelin), destination `/boutique/<slug>`. */
  edition: "editions-sociales" | "la-dispute" | null;
  slug: string;
}
interface ProductRedirectsFile {
  entries: Record<string, ProductRedirectTarget>;
}
function loadProductRedirects(): ProductRedirectsFile {
  const file = path.join(ROOT_DIR, "src/lib/redirects-produits.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    // Dégradation propre (même politique que `env.ts`/`donations.ts` : jamais
    // planter le site pour un artefact généré absent) : `src/lib/redirects-produits.json`
    // est versionné et présent dans ce repo, mais un checkout partiel/CI mal
    // configuré ne doit pas empêcher `next dev`/`next build` de démarrer —
    // juste priver le host boutique de ses redirections produit (repli
    // `/produit/:slug` → `/catalogue` toujours actif).
    console.warn(
      `[next.config] "${file}" illisible (${err instanceof Error ? err.message : err}) — ` +
        `table de redirections produit vide (régénérer avec "pnpm build:product-redirects").`,
    );
    return { entries: {} };
  }
}
const PRODUCT_REDIRECTS: ProductRedirectsFile = loadProductRedirects();

/** Une règle par produit connu — placées AVANT le repli `/produit/:slug` générique (premier match gagnant). */
function productRedirectRules(): StatusedRule[] {
  return Object.entries(PRODUCT_REDIRECTS.entries).map(([productSlug, target]) =>
    r({
      source: `/produit/${productSlug}`,
      destination:
        target.edition != null ? `/catalogue/${target.edition}/${target.slug}` : `/boutique/${target.slug}`,
    }),
  );
}

/**
 * Formes d'URLs WordPress vérifiées dans les dumps (`permalink_structure =
 * /%postname%/`, CPT `rewrite slug = catalogue`, taxonomies
 * `auteur`/`collection`/`parution`) : les slugs du nouveau site sont les
 * slugs WP passés tels quels par le REST → ces patterns couvrent 100 % des
 * fiches, y compris celles créées après ce jour. Ordre significatif : les
 * règles spécifiques d'abord, premier match gagnant.
 */
async function redirects() {
  return [
    ...onHost("editionssociales.fr", [
      // 1 — pagination de l'archive catalogue WP → archive ES (pas de pagination distincte côté nouveau site)
      r({ source: "/catalogue/page/:n(\\d+)", destination: "/catalogue/editions-sociales" }),
      // 2 — fiche livre WP → fiche ES. Lookahead négatif : ne doit PAS capturer
      // les slugs de maison eux-mêmes (`/catalogue/editions-sociales`,
      // `/catalogue/la-dispute` doivent rester servis en 200 — cas négatif
      // exigé par verify-redirects).
      r({
        source: "/catalogue/:slug((?!editions-sociales$)(?!la-dispute$)[^/]+)",
        destination: "/catalogue/editions-sociales/:slug",
      }),
      // 3-5 — taxonomies WP → facettes de l'archive ES (mêmes clés que
      // `parseBookFilters`, `src/lib/parse-filters.ts:14-25`).
      r({ source: "/auteur/:slug", destination: "/catalogue/editions-sociales?author=:slug" }),
      r({ source: "/collection/:slug", destination: "/catalogue/editions-sociales?collection=:slug" }),
      r({ source: "/parution/:slug", destination: "/catalogue/editions-sociales?upcoming=1" }),
      // 6 — anciennes pages d'archive par taxonomie
      r({ source: "/catalogue-collection", destination: "/catalogue/editions-sociales" }),
      r({ source: "/catalogue-auteur", destination: "/catalogue/editions-sociales" }),
      // 7 — page orpheline (défaut Q2, à ajuster avant E7 selon retour client)
      r({ source: "/les-emissions-sociales", destination: "/a-propos" }),
      // 8 — page orpheline (défaut Q2)
      r({ source: "/la-geme", destination: "https://gememarxengels.org" }),
      // 9 — la phase Newsletter re-ciblera cette règle vers le vrai formulaire d'inscription
      t({ source: "/newsletter", destination: "/" }),
      // 10 — page orpheline (défaut Q2)
      r({ source: "/marx-passe-lagreg", destination: "/catalogue/editions-sociales" }),
      // 11 — flux RSS : 3 règles séparées. Jamais `/feed{/:rest*}` — les
      // accolades ne compilent pas avec le path-to-regexp embarqué de Next 16
      // (« Unexpected MODIFIER », vérifié dans le plan).
      r({ source: "/feed", destination: "/" }),
      r({ source: "/feed/:rest*", destination: "/" }),
      r({ source: "/comments/feed", destination: "/" }),
      // 12 — médias partagés (118 PDF + images de couverture) : gardés vivants
      // sur le host de cohabitation (triple ceinture avec `rebaseWpMediaUrl`, E3e).
      r({ source: "/wp-content/:path*", destination: "https://cms-es.editionssociales.fr/wp-content/:path*" }),
      // 13 — signets wp-admin de l'équipe : 302 pour toujours (le host cms
      // disparaîtra en phase d'extinction, jamais un 301 ici).
      t({ source: "/wp-admin/:path*", destination: "https://cms-es.editionssociales.fr/wp-admin/:path*" }),
      t({ source: "/wp-login.php", destination: "https://cms-es.editionssociales.fr/wp-login.php" }),
      // 14 — REST WordPress (outillage éventuel de l'équipe)
      t({ source: "/wp-json/:path*", destination: "https://cms-es.editionssociales.fr/wp-json/:path*" }),
    ]),
    ...onHost("ladispute.fr", [
      // 1-3 — le domaine déménage en entier vers editionssociales.fr/catalogue/la-dispute
      r({ source: "/catalogue/page/:n(\\d+)", destination: "https://editionssociales.fr/catalogue/la-dispute" }),
      r({ source: "/catalogue/:slug", destination: "https://editionssociales.fr/catalogue/la-dispute/:slug" }),
      r({ source: "/catalogue", destination: "https://editionssociales.fr/catalogue/la-dispute" }),
      // 4-6 — taxonomies WP → facettes de l'archive LD (le terme `a-paraitre`
      // existe côté LD, count=1, vérifié dans le plan).
      r({ source: "/auteur/:slug", destination: "https://editionssociales.fr/catalogue/la-dispute?author=:slug" }),
      r({
        source: "/collection/:slug",
        destination: "https://editionssociales.fr/catalogue/la-dispute?collection=:slug",
      }),
      r({ source: "/parution/:slug", destination: "https://editionssociales.fr/catalogue/la-dispute?upcoming=1" }),
      // 7 — page « à propos » LD → page « éditions » dédiée du site unifié
      r({ source: "/a-propos", destination: "https://editionssociales.fr/editions/la-dispute" }),
      // 8 — rencontres (Q8 : si la page est retirée faute d'événements réels,
      // re-cibler vers `/editions/la-dispute` — cf. plan)
      r({ source: "/rencontres", destination: "https://editionssociales.fr/rencontres" }),
      // 9 — anciennes pages d'archive par taxonomie
      r({ source: "/catalogue-auteurs", destination: "https://editionssociales.fr/catalogue/la-dispute" }),
      r({ source: "/catalogue-collection", destination: "https://editionssociales.fr/catalogue/la-dispute" }),
      // 10 — médias partagés
      r({ source: "/wp-content/:path*", destination: "https://cms-ld.editionssociales.fr/wp-content/:path*" }),
      // 11 — signets wp-admin de l'équipe : 302 pour toujours
      t({ source: "/wp-admin/:path*", destination: "https://cms-ld.editionssociales.fr/wp-admin/:path*" }),
      t({ source: "/wp-login.php", destination: "https://cms-ld.editionssociales.fr/wp-login.php" }),
      t({ source: "/wp-json/:path*", destination: "https://cms-ld.editionssociales.fr/wp-json/:path*" }),
      // 12 — catch-all FINAL (dernier de la liste : couvre `/`, `/article-0`,
      // `/feed` et tout le reste du domaine qui déménage).
      r({ source: "/:path*", destination: "https://editionssociales.fr/" }),
    ]),
    // Host boutique.editionssociales.fr / www.boutique.editionssociales.fr —
    // plan/02-mise-en-production.md §Table de redirections, câblé avant J-7 (P7).
    ...BOUTIQUE_HOSTS.flatMap((host) =>
      onHost(host, [
        // Table produit → fiche (matched) / page boutique native (orphelin) —
        // une règle littérale par slug connu, cf. `productRedirectRules()`.
        ...productRedirectRules(),
        // Repli : `/produit/<slug>` inconnu de la table (vieux lien mort déjà à
        // l'époque WooCommerce, jamais couvert par aucun produit ni arbitrage) —
        // DOIT rester après `productRedirectRules()` (premier match gagnant).
        r({ source: "/produit/:slug", destination: "/catalogue" }),
        // Panier/checkout/compte WooCommerce → panier natif unifié. `/panier`
        // n'a PAS sa propre règle : source === destination créerait une boucle
        // de redirection infinie (`/panier` est déjà servi nativement,
        // identique sur ce host — rien à rediriger).
        r({ source: "/commander", destination: "/panier" }),
        r({ source: "/mon-compte", destination: "/panier" }),
        // Catégories produit (`product_cat`) — seules les deux maisons sont
        // nommément tranchées par le plan (`la-dispute`/`editions-sociales`) ;
        // toute autre catégorie (« collections → filtres », mapping encore
        // ouvert faute de liste exhaustive des slugs `product_cat`) retombe sur
        // `/catalogue` — défaut conservateur, même politique que `/wp-content`
        // (cms-* en filet) ou `/newsletter` (Q2/Q8) ailleurs dans ce fichier.
        r({ source: "/categorie-produit/la-dispute", destination: "/catalogue/la-dispute" }),
        r({ source: "/categorie-produit/editions-sociales", destination: "/catalogue/editions-sociales" }),
        r({ source: "/categorie-produit/:cat", destination: "/catalogue" }),
        // Accueil boutique → catalogue unifié — SAUF si `?wc-api=…` est présent
        // (callback Paybox résiduel sur `/`) : les redirects sont évalués AVANT
        // les rewrites dans Next (`rewrites.md`, « The order Next.js routes are
        // checked »), donc sans ce `missing`, CE redirect détournerait le
        // callback vers `/catalogue` avant que le rewrite `/?wc-api=*` (cf.
        // `rewrites()` plus bas) n'ait la moindre chance de s'appliquer —
        // vérifié empiriquement (302 au lieu du proxy attendu, corrigé ici).
        r({ source: "/", destination: "/catalogue", missing: [{ type: "query", key: "wc-api" }] }),
      ]),
    ),
  ];
}

/**
 * `/wc-api/*` et `/?wc-api=*` — callbacks de paiement WooCommerce (Paybox)
 * résiduels pendant tout le recouvrement (`plan/02-mise-en-production.md` §Table
 * de redirections) : **rewrite**, jamais redirect — le navigateur/serveur de
 * paiement qui tape cette URL doit continuer d'atteindre WooCommerce en
 * silence, la barre d'adresse ne doit pas bouger. Toujours actif, PAS gouverné
 * par `REDIRECTS_PERMANENT` (aucun statut HTTP de redirection en jeu ici).
 *
 * ⚠️ Bucket `beforeFiles`, PAS le tableau simple (`afterFiles` implicite) :
 * `/` est une VRAIE route de l'app (`(site)/page.tsx`) — la forme tableau
 * simple n'est vérifiée qu'« after files » (`rewrites.md`, « The order
 * Next.js routes are checked »), donc APRÈS que le filesystem ait déjà
 * résolu `/` vers la page d'accueil : le rewrite `/?wc-api=…` ne serait
 * JAMAIS atteint. Vérifié empiriquement (200 page d'accueil rendue, aucune
 * tentative de proxy dans les logs, avant ce correctif) — `beforeFiles`
 * force la vérification avant toute résolution de fichier/page.
 */
async function rewrites() {
  return {
    beforeFiles: BOUTIQUE_HOSTS.flatMap((host) => [
      {
        source: "/wc-api/:path*",
        destination: "https://cms-boutique.editionssociales.fr/wc-api/:path*",
        has: [{ type: "host" as const, value: host }],
      },
      // `/?wc-api=...` — capture nommée de la valeur de la query pour la
      // reporter explicitement dans la destination (un `has` de type `query`
      // sans référence dans `destination` n'est pas garanti d'être transmis).
      {
        source: "/",
        has: [
          { type: "host" as const, value: host },
          { type: "query" as const, key: "wc-api", value: "(?<wcApi>.*)" },
        ],
        destination: "https://cms-boutique.editionssociales.fr/?wc-api=:wcApi",
      },
    ]),
    afterFiles: [],
    fallback: [],
  };
}

const nextConfig: NextConfig = {
  // Racine explicite : dans un worktree imbriqué (.claude/worktrees/*), Turbopack
  // remonterait sinon au pnpm-workspace.yaml du checkout parent et servirait le
  // mauvais arbre de fichiers.
  turbopack: {
    root: ROOT_DIR,
  },
  images: {
    // Les couvertures et visuels restent servis par les hébergements OVH existants
    // le temps de la migration des médias. On autorise donc ces domaines.
    remotePatterns: [
      { protocol: "https", hostname: "editionssociales.fr", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "www.editionssociales.fr", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "boutique.editionssociales.fr", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "ladispute.fr", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "www.ladispute.fr", pathname: "/wp-content/**" },
      { protocol: "http", hostname: "editionssociales.fr", pathname: "/wp-content/**" },
      { protocol: "http", hostname: "ladispute.fr", pathname: "/wp-content/**" },
      // Découplage CMS (E3 du plan) : hosts de cohabitation, seuls hosts REST
      // + médias une fois les domaines publics basculés sur Vercel (E5/E6).
      // Cohabitation : gardés en plus des hosts publics ci-dessus, jamais à
      // leur place, tant que la migration n'est pas achevée.
      { protocol: "https", hostname: "cms-es.editionssociales.fr", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "cms-ld.editionssociales.fr", pathname: "/wp-content/**" },
      // Couvertures/médias rapatriés par Payload (E6/E3) : chaque store Vercel
      // Blob a un sous-domaine `<id>.public.blob.vercel-storage.com` distinct,
      // aucun hostname fixe connu à l'avance. `*` (un seul niveau de
      // sous-domaine) suffit et reste plus restrictif que `**` (cf.
      // node_modules/next/dist/docs/.../02-components/image.md, "Wildcard
      // Patterns") : le store ID est toujours un unique segment.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
    ],
  },
  redirects,
  rewrites,
};

export default withSentryConfig(withPayload(nextConfig, { devBundleServerPackages: false }), {
  // Sans ces env (dev, PR sans secret posé), le plugin build reste inerte —
  // le build doit rester vert. Pas de tunnelRoute (décision du plan
  // 06-operations.md : éviterait la première surface serveur superflue).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  // Le plugin envoie par défaut un signal télémétrique à sentry.io à chaque
  // build, même sans aucune variable Sentry posée (url par défaut = sentry.io,
  // court-circuit dans allowedToSendTelemetry()) : on le coupe explicitement.
  telemetry: false,
});

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
const BOUTIQUE_HOSTS = ["boutique.editionssociales.fr", "www.boutique.editionssociales.fr"];

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
      r({ source: "/collection/:slug", destination: "/catalogue/editions-sociales?libelle=:slug" }),
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
      // Coupure OVH : plus aucune règle `wp-content`/`wp-admin`/`wp-json` —
      // les installs WordPress sont éteintes, ces URLs répondent 404 ici.
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
        destination: "https://editionssociales.fr/catalogue/la-dispute?libelle=:slug",
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
      // 10 — catch-all FINAL (dernier de la liste : couvre `/`, `/article-0`,
      // `/feed`, les anciens `wp-*` et tout le reste du domaine qui déménage).
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
        // Accueil boutique → catalogue unifié. (Coupure OVH : le proxy
        // `?wc-api=…` vers WooCommerce a disparu avec les rewrites — un
        // callback Paybox résiduel suit désormais cette redirection.)
        r({ source: "/", destination: "/catalogue" }),
      ]),
    ),
  ];
}

const nextConfig: NextConfig = {
  // Racine explicite : dans un worktree imbriqué (.claude/worktrees/*), Turbopack
  // remonterait sinon au pnpm-workspace.yaml du checkout parent et servirait le
  // mauvais arbre de fichiers.
  turbopack: {
    root: ROOT_DIR,
  },
  // Pas de fingerprinting gratuit de la stack (Next + Payload s'annoncent
  // sinon dans `x-powered-by`).
  poweredByHeader: false,
  // Durcissement minimal, sûr pour front ET back-office : pas de sniffing
  // MIME, pas d'embarquement en iframe tiers (anti-clickjacking, /admin
  // compris), referrer réduit hors origine. Une CSP complète reste hors
  // périmètre (inline scripts Next/Payload à inventorier d'abord).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  images: {
    // Couvertures affichées ≤ ~400px CSS : inutile de générer 1920/2048/3840w
    // (srcset gonflé, LCP/catalogue). 1080 couvre retina 2× sur une fiche 300–400px.
    deviceSizes: [384, 640, 750, 828, 1080],
    imageSizes: [32, 64, 96, 128, 256, 384],
    // Couvertures/médias Payload (Blob) : chaque store Vercel Blob a un
    // sous-domaine `<id>.public.blob.vercel-storage.com` distinct. Coupure OVH :
    // plus aucun host WordPress autorisé.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
    ],
  },
  redirects,
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

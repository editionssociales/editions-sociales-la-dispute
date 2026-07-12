import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Racine explicite : dans un worktree imbriqué (.claude/worktrees/*), Turbopack
  // remonterait sinon au pnpm-workspace.yaml du checkout parent et servirait le
  // mauvais arbre de fichiers.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
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
      // Couvertures/médias rapatriés par Payload (E6/E3) : chaque store Vercel
      // Blob a un sous-domaine `<id>.public.blob.vercel-storage.com` distinct,
      // aucun hostname fixe connu à l'avance. `*` (un seul niveau de
      // sous-domaine) suffit et reste plus restrictif que `**` (cf.
      // node_modules/next/dist/docs/.../02-components/image.md, "Wildcard
      // Patterns") : le store ID est toujours un unique segment.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
    ],
  },
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

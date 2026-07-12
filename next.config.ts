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

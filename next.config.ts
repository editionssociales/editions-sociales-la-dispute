import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { withPayload } from "@payloadcms/next/withPayload";

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

export default withPayload(nextConfig, { devBundleServerPackages: false });

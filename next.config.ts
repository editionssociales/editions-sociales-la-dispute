import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;

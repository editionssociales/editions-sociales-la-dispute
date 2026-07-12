import * as Sentry from "@sentry/nextjs";
import { assertEnv } from "@/lib/env";

export async function register() {
  // Aucun middleware ni route edge dans le repo : pas de branche edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Forme des variables d'env posées (`src/lib/env.ts`) : une DATABASE_URL
    // vide ou un gate `SITE_INDEXABLE=true` échoue ICI, au boot et en listant
    // les fautives — pas au fond d'une requête pg/jose ou en silence.
    assertEnv();
    await import("../sentry.server.config");
  }
}

// Hook Next >= 15 : capture les erreurs server *non gérées* (RSC, route
// handlers, server actions). Ne voit pas les erreurs gérées (ex. un webhook
// qui répond 400 proprement) — cf. plan/06-operations.md.
export const onRequestError = Sentry.captureRequestError;

import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Aucun middleware ni route edge dans le repo : pas de branche edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

// Hook Next >= 15 : capture les erreurs server *non gérées* (RSC, route
// handlers, server actions). Ne voit pas les erreurs gérées (ex. un webhook
// qui répond 400 proprement) — cf. plan/06-operations.md.
export const onRequestError = Sentry.captureRequestError;

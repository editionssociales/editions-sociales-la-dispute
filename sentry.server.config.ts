import * as Sentry from "@sentry/nextjs";

// Erreurs + tracing (APM), toujours sans PII (RGPD). Sans DSN (dev, preview
// sans secret posé), le SDK reste no-op sans planter le build.
//
// Le setup OpenTelemetry par défaut du SDK instrumente http/fetch/pg — donc le
// driver Postgres de @payloadcms/db-postgres : chaque trace serveur montre ses
// requêtes SQL. Échantillonnage à 100 % (phase de dev, trafic quasi nul —
// OPERATIONS.md §8) ; à baisser au lancement pour tenir les 5 M spans/mois du
// plan Developer.
//
// Piège si on veut RE-désactiver l'APM un jour : `tracesSampleRate: 0` ne
// suffit PAS — `0 != null` est vrai, donc hasSpansEnabled() reste true côté SDK
// et getAutoPerformanceIntegrations() instrumente quand même pg/http/fetch via
// OpenTelemetry. Il faut OMETTRE tracesSampleRate ET poser
// `skipOpenTelemetrySetup: true`.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV,
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
});

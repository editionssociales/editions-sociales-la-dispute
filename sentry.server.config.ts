import * as Sentry from "@sentry/nextjs";

// Erreurs + tracing (APM), toujours sans PII (RGPD). Sans DSN (dev, preview
// sans secret posé), le SDK reste no-op sans planter le build.
//
// Le setup OpenTelemetry par défaut du SDK instrumente http/fetch/pg — donc le
// driver Postgres de @payloadcms/db-postgres : chaque trace serveur montre ses
// requêtes SQL. Échantillonnage passé de 100 % (phase de dev, trafic quasi nul)
// à 10 % le 2026-08-18, avant l'ouverture de la campagne du 20 août — geste de
// lancement prévu par OPERATIONS.md §8, pour tenir les 5 M spans/mois du plan
// Developer. Le client (`src/instrumentation-client.ts`) porte la MÊME valeur :
// les traces sont distribuées, la décision d'échantillonnage prise côté client
// se propage au serveur, et deux taux désalignés produisent des traces
// tronquées.
//
// Piège si on veut RE-désactiver l'APM un jour : `tracesSampleRate: 0` ne
// suffit PAS — `0 != null` est vrai, donc hasSpansEnabled() reste true côté SDK
// et getAutoPerformanceIntegrations() instrumente quand même pg/http/fetch via
// OpenTelemetry. Il faut OMETTRE tracesSampleRate ET poser
// `skipOpenTelemetrySetup: true`.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

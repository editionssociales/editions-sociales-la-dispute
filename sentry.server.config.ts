import * as Sentry from "@sentry/nextjs";

// Erreurs seules, pas d'APM, pas de PII (RGPD). Sans DSN (dev, preview sans
// secret posé), le SDK reste no-op sans planter le build.
//
// Piège : `tracesSampleRate: 0` ne suffit PAS à désactiver l'APM — `0 != null`
// est vrai, donc hasSpansEnabled() reste true côté SDK et
// getAutoPerformanceIntegrations() instrumente quand même pg/http/fetch (donc
// le driver Postgres de @payloadcms/db-postgres) via OpenTelemetry. On omet
// carrément tracesSampleRate et on coupe explicitement le setup OpenTelemetry.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV,
  skipOpenTelemetrySetup: true,
  sendDefaultPii: false,
});

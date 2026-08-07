import * as Sentry from "@sentry/nextjs";

// Même politique sobre que côté serveur (cf. sentry.server.config.ts) : pas
// de PII, pas de replay (hors périmètre). N'injecte rien dans le DOM — iso-rendu.
// NEXT_PUBLIC_VERCEL_ENV (pas VERCEL_ENV : non préfixé NEXT_PUBLIC_, donc jamais
// inliné dans le bundle navigateur — cf. doc Next sur les env vars exposées au
// client) ; c'est aussi la variable utilisée par la détection automatique du SDK,
// qu'on documente ici pour rester explicite plutôt que de s'y en remettre.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  // Même réglage 100 % « phase de dev » que le serveur — OPERATIONS.md §8.
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Spans de navigation App Router : avec tracesSampleRate posé ci-dessus, le
// browserTracingIntegration (ajouté par défaut par @sentry/nextjs) échantillonne
// pageloads et navigations, et les fetch same-origin propagent la trace au
// serveur (traces distribuées client → RSC/route handler → pg).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

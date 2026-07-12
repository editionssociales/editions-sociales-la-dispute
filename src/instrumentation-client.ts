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
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Spans de navigation App Router (routing/tracing, pas des breadcrumbs) — sans
// tracesSampleRate ni tracesSampler ici, ils ne sont jamais échantillonnés ni
// envoyés : cohérent avec l'intention "erreurs seules" du serveur, no-op assumé.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

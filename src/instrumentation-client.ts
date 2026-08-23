import * as Sentry from "@sentry/nextjs";

// Même politique sobre que côté serveur (cf. sentry.server.config.ts) : pas
// de PII, pas de replay (hors périmètre). N'injecte rien dans le DOM — iso-rendu.
// NEXT_PUBLIC_VERCEL_ENV (pas VERCEL_ENV : non préfixé NEXT_PUBLIC_, donc jamais
// inliné dans le bundle navigateur — cf. doc Next sur les env vars exposées au
// client) ; c'est aussi la variable utilisée par la détection automatique du SDK,
// qu'on documente ici pour rester explicite plutôt que de s'y en remettre.
//
// Issue #111 : le SDK reste sur le chemin critique (pageloads +
// `onRouterTransitionStart`) — pas de lazy-load, pour ne pas rater les
// erreurs précoces. Le first-load JS de l'accueil contient donc Sentry +
// header/panier + carrousel ; les polyfills legacy sont coupés via
// `browserslist` (package.json), pas en retirant le commerce.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  // Même réglage que le serveur (10 % depuis le 2026-08-18, lancement de la
  // campagne — OPERATIONS.md §8) : les deux fichiers DOIVENT rester alignés,
  // la décision d'échantillonnage du client se propage au serveur.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Bruit client pur constaté au triage du 2026-08-21 : rien de tout ceci ne
  // vient de notre code, et le filtrage serveur ne s'applique pas (erreurs
  // levées dans le navigateur du visiteur). sentry.server.config.ts reste
  // volontairement sans équivalent.
  // — denyUrls : scripts de télémétrie injectés par les WebView Android
  //   in-app (Instagram/Facebook), servis sous app:// (p. ex.
  //   app://navigation_performance_logger_android).
  denyUrls: [/^app:\/\//],
  // — ignoreErrors : messages exacts de ces mêmes WebView (postMessage vers un
  //   pont Java déjà détruit), plus les extensions navigateur qui appellent
  //   runtime.sendMessage sur un onglet disparu. ignoreErrors matche par
  //   sous-chaîne pour les strings, d'où le regex pour rester ciblé.
  ignoreErrors: [
    "Error invoking postMessage: Java exception was raised during method invocation",
    "Java object is gone",
    /Invalid call to runtime\.sendMessage\(\)/,
  ],
});

// Spans de navigation App Router : avec tracesSampleRate posé ci-dessus, le
// browserTracingIntegration (ajouté par défaut par @sentry/nextjs) échantillonne
// pageloads et navigations, et les fetch same-origin propagent la trace au
// serveur (traces distribuées client → RSC/route handler → pg).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * Origine d'ingest Sentry dérivée du DSN public — pour un `preconnect` sur
 * le chemin critique (issue #111). `null` si le DSN est absent ou illisible :
 * pas de preconnect fantôme.
 */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

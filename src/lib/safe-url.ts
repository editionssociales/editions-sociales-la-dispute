/**
 * URL saisie au back-office → URL absolue http(s) normalisée, sinon `null`.
 * Règle unique : une URL `javascript:`/`data:` saisie ne doit JAMAIS finir
 * dans un `href` ou un `src` d'iframe.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const propre = raw?.trim();
  if (!propre) return null;
  try {
    const url = new URL(propre);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Cible d'un bouton éditorial : URL http(s) absolue (`safeHttpUrl`) OU chemin du
 * site (`/souscription`, jamais `//hôte` — c'est une URL de protocole relatif,
 * donc externe) ; sinon `null`. Jamais `javascript:`/`data:`.
 */
export function safeHref(raw: string | null | undefined): string | null {
  const propre = raw?.trim();
  if (!propre) return null;
  if (propre.startsWith("/") && !propre.startsWith("//")) return propre;
  return safeHttpUrl(propre);
}

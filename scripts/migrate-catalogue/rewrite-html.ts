/**
 * Réécriture des URLs médias dans le HTML `content`/`plus_loin`, **avant**
 * conversion Lexical — le HTML legacy (`*LegacyHtml`, parachute de parité) et
 * le Lexical portent ainsi tous deux les URLs Blob, jamais les URLs OVH.
 */

/**
 * Remplace chaque occurrence littérale d'une clé de `urlMap` par sa valeur.
 * `split`/`join` plutôt qu'une regex : pas d'échappement de caractères
 * spéciaux à gérer, remplacement exact et prévisible.
 */
export function rewriteHtmlUrls(html: string | null | undefined, urlMap: Map<string, string>): string | null {
  if (html == null) return null;
  if (html === "" || urlMap.size === 0) return html;
  let out = html;
  for (const [from, to] of urlMap) {
    if (!from || !to || from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

export interface LexicalPrepResult {
  html: string;
  /** `src` des `<img>` retirés faute de média Payload correspondant. */
  removedImgs: string[];
  /** `href` des `<a>` déballés (URL invalide — ex. `http://Zoé Rollin` dans WP). */
  unwrappedLinks: string[];
}

/**
 * Prépare le HTML (déjà réécrit vers les URLs Payload) pour `convertHTMLToLexical` :
 *
 * 1. Chaque `<img>` dont le `src` correspond à un média rapatrié est annoté
 *    `data-lexical-upload-id` / `data-lexical-upload-relation-to="media"` — c'est le
 *    contrat documenté du converti pour produire de vrais upload nodes ; sans id,
 *    l'upload node est invalide et **la fiche entière refuse de sauver**.
 *    Un `<img>` sans média correspondant est retiré (le HTML legacy, lui, le garde —
 *    cette préparation ne s'applique qu'à l'entrée de conversion Lexical).
 * 2. Les `<a>` dont le `href` ne parse pas en URL (`new URL`) sont déballés en texte —
 *    la validation du link node Payload les rejetterait (cas réel : `http://Zoé Rollin`).
 */
export function prepareHtmlForLexical(
  html: string,
  mediaIdByUrl: Map<string, number>,
): LexicalPrepResult {
  const removedImgs: string[] = [];
  const unwrappedLinks: string[] = [];

  let out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    const src = srcMatch?.[1] ?? null;
    const id = src != null ? mediaIdByUrl.get(src) : undefined;
    if (id == null) {
      removedImgs.push(src ?? tag.slice(0, 80));
      return "";
    }
    return tag.replace(
      /<img\b/i,
      `<img data-lexical-upload-id="${id}" data-lexical-upload-relation-to="media"`,
    );
  });

  out = out.replace(
    /<a\b[^>]*>([\s\S]*?)<\/a>/gi,
    (full: string, inner: string) => {
      const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(full);
      const href = hrefMatch?.[1]?.trim() ?? "";
      // Liens internes vers nos propres médias migrés (PDF référencés dans le
      // HTML, réécrits par `rewriteHtmlUrls`) : relatifs en stockage local dev,
      // légitimes. Gardés seulement sans `%` ni espace — Payload ré-encode les
      // URLs de link node à chaque sauvegarde, un `%` déjà présent divergerait
      // (`%20` → `%2520`) à chaque re-run.
      if (href.startsWith("/api/media/file/") && !/[%\s]/.test(href)) {
        return full;
      }
      if (href) {
        try {
          // Absolu uniquement : le corpus WP n'émet que des URLs absolues — un
          // href « relatif » est une citation collée par erreur (cas réels :
          // `http://Zoé Rollin`, `liberation, 8 novembre 2019, https:/…`). De
          // plus, Payload ré-encode ces valeurs à CHAQUE sauvegarde (%20→%2520…),
          // ce qui corromprait la donnée au fil des re-runs idempotents.
          const u = new URL(href);
          if (["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) {
            return full;
          }
        } catch {
          /* URL invalide → déballer */
        }
      }
      unwrappedLinks.push(href || "(href vide)");
      return inner;
    },
  );

  return { html: out, removedImgs, unwrappedLinks };
}

/**
 * Réécriture des URLs médias dans le HTML `content`/`plus_loin`, **avant**
 * conversion Lexical — le HTML legacy (`*LegacyHtml`, parachute de parité) et
 * le Lexical portent ainsi tous deux les URLs Blob, jamais les URLs OVH.
 */
import type { EditionSlug } from "./utils.ts";

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

/**
 * Formes produites par `rewriteInternalLinks` (E11) : racine nue (`/`) ou
 * fiche catalogue (`/catalogue/<edition>/<slug>`, sans sous-chemin — le
 * nouveau site n'a qu'un seul niveau de chemin par fiche).
 */
const INTERNAL_NAV_LINK = /^\/(?:catalogue\/(?:editions-sociales|la-dispute)\/[^\/?#]+)?$/;

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
      // Liens internes vers une autre fiche catalogue ou la racine, posés par
      // `rewriteInternalLinks` (E11) — même nature que le cas ci-dessus (une
      // URL relative légitime du nouveau site, pas une citation collée par
      // erreur) : sans cette entrée, ces liens seraient déballés en texte nu
      // dès qu'un humain réédite la fiche dans Payload (bascule Lexical,
      // parachute `*LegacyHtml`).
      if (INTERNAL_NAV_LINK.test(href)) {
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

/* ─────────────────────────── Liens internes (E11) ─────────────────────────── */

export interface RewriteInternalLinksResult {
  html: string;
  /** `href` déballés en texte — cible OVH ni page catalogue ni racine (ex. `?attachment_id=…`). */
  unwrappedLinks: string[];
}

/**
 * Domaines historiques → édition du nouveau site (E11, condition d'extinction
 * « 0 URL OVH résiduelle » — `OVH_MEDIA_HOSTS` de `scripts/compare-classify.ts`).
 * `rewriteHtmlUrls` (ci-dessus) ne couvre que les URLs de MÉDIA
 * (`/wp-content/...`, via `urlMap`) — les liens de corps de texte vers une
 * autre fiche catalogue ou vers l'accueil restent, eux, des résidus après
 * migration (constaté : 50 liens sur l'échantillon réel).
 */
const INTERNAL_LINK_HOSTS: readonly { pattern: RegExp; edition: EditionSlug }[] = [
  { pattern: /^(?:www\.)?editionssociales\.fr$/i, edition: "editions-sociales" },
  { pattern: /^(?:www\.)?ladispute\.fr$/i, edition: "la-dispute" },
];

/**
 * Réécrit `<a href="https://…editionssociales.fr/catalogue/<slug>/…">` (et
 * `ladispute.fr`) en lien interne `/catalogue/<edition>/<slug>` —
 * `src/app/(site)/catalogue/[edition]/[slug]/page.tsx`.
 *
 * Le nouveau site n'a qu'un seul niveau de chemin par fiche : aucune "page
 * fille" n'existe. Sur l'échantillon réel (E11), les sous-chemins après le
 * slug sont soit un **autre** slug de fiche catalogue (référence croisée
 * légitime entre deux livres — ex. `le-travail-et-la-liberte` ↔
 * `le-travail-et-lemancipation`), soit — vérifié : le slug est alors le MÊME
 * que celui de la fiche courante, et des segments explicites comme
 * `attachment/2`, `attachment/7` apparaissent dans l'échantillon — une page
 * de pièce jointe WordPress pour une image incorporée (revue de presse,
 * scan). Dans les deux cas, ne garder que le premier segment (le slug) est
 * la seule destination qui existe encore côté nouveau site : soit la fiche
 * visée, soit la fiche elle-même (lien sur elle-même, inoffensif).
 *
 * La racine nue (`https://editionssociales.fr/`, avec ou sans query — ex.
 * l'ancien format `?attachment_id=482`, `URL.pathname` vaut `/` dans les deux
 * cas) devient `/` : ces deux domaines *sont* le nouveau site une fois la
 * bascule DNS faite (`COHABITATION.md`), pas un tiers — un lien vers
 * l'accueil WordPress (avec ou sans paramètre d'attachment non résoluble)
 * est un lien vers l'accueil du nouveau site.
 *
 * Un lien qui ne matche ni un chemin `/catalogue/…` ni la racine (ex. un
 * article de blog WordPress hors catalogue) est déballé — même politique que
 * `prepareHtmlForLexical` pour les `href` qu'on ne peut pas garantir valides :
 * mieux vaut le texte nu qu'un lien mort vers un domaine appelé à disparaître.
 */
export function rewriteInternalLinks(html: string): RewriteInternalLinksResult {
  const unwrappedLinks: string[] = [];
  const out = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full: string, attrs: string, inner: string) => {
    const hrefMatch = /\bhref\s*=\s*(["'])([^"']*)\1/i.exec(attrs);
    if (!hrefMatch) return full;
    const href = hrefMatch[2].trim();
    if (!href) return full;

    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return full; // pas une URL absolue — hors périmètre de cette fonction
    }
    const rule = INTERNAL_LINK_HOSTS.find((r) => r.pattern.test(url.hostname));
    if (!rule) return full; // pas un des deux domaines historiques

    const slugMatch = /^\/catalogue\/([^/?#]+)/.exec(url.pathname);
    if (slugMatch) {
      const newHref = `/catalogue/${rule.edition}/${decodeURIComponent(slugMatch[1])}`;
      return full.replace(hrefMatch[0], `href="${newHref}"`);
    }
    if (url.pathname === "/" || url.pathname === "") {
      return full.replace(hrefMatch[0], `href="/"`);
    }

    unwrappedLinks.push(href);
    return inner;
  });
  return { html: out, unwrappedLinks };
}

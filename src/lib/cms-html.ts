import sanitizeHtml from "sanitize-html";
import { frenchTypo } from "./typo-fr";

/**
 * Couture « HTML WordPress non fiable → HTML sûr ».
 *
 * Le contenu éditorial (`content.rendered`, champ ACF `plus_loin`) arrive brut
 * de deux WordPress et finissait injecté verbatim via `dangerouslySetInnerHTML`
 * — une exposition XSS stockée que le README signalait encore à faire
 * (« sécurisation du HTML »). Ce module est le seul point où le brut devient
 * sûr : liste blanche de balises, réécriture des images `http→https`, retrait
 * des shortcodes WordPress, et un extrait texte qui partage la même politique.
 * Le type `SafeHtml` (marque non falsifiable) encode « ce HTML est passé par
 * ici » : les sites de rendu et le chemin méta ne peuvent l'obtenir autrement.
 */

/** HTML nettoyé, sûr à injecter — marque de type portée uniquement par `sanitizeCms`. */
export type SafeHtml = string & { readonly __safeHtml: unique symbol };

/**
 * Découplage CMS (E3 du plan) : `post_content` et le champ ACF `plus_loin`
 * contiennent ~190 URLs absolues codées en dur vers les domaines publics
 * (`editionssociales.fr`, `ladispute.fr`) — images de couverture, PDF de
 * `table`/`extrait`. Ces URLs casseraient dès que ces domaines pointeront sur
 * Vercel (E5/E6). `rebaseWpMediaUrl` les réécrit vers les hosts de
 * cohabitation (`cms-es`/`cms-ld…`), qui restent sur les installs WordPress
 * sources jusqu'à extinction. Pur : ne touche pas les URLs qui ne matchent
 * aucun des deux domaines historiques (boutique, hosts déjà `cms-*`, Blob…).
 */
const CMS_REBASE_RULES: readonly { pattern: RegExp; host: string }[] = [
  { pattern: /^(https?:\/\/)(?:www\.)?editionssociales\.fr(\/wp-content\/.*)$/i, host: "cms-es.editionssociales.fr" },
  { pattern: /^(https?:\/\/)(?:www\.)?ladispute\.fr(\/wp-content\/.*)$/i, host: "cms-ld.editionssociales.fr" },
];

export function rebaseWpMediaUrl(url: string): string {
  for (const { pattern, host } of CMS_REBASE_RULES) {
    const m = url.match(pattern);
    if (m) return `https://${host}${m[2]}`;
  }
  return url;
}

/** Balises autorisées : prose de présentation + listes de références « pour aller plus loin ». */
const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div",
  "strong", "b", "em", "i", "u", "s", "sup", "sub", "small", "mark", "abbr", "cite", "q",
  "a", "img", "figure", "figcaption",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
];

/**
 * Shortcodes WordPress (`[caption …]`, `[gallery]`, `[/caption]`…) : jetons
 * `[balise …]` commençant par une lettre. On préserve `[1]`, `[i]` numériques
 * ou notes qui pourraient être du texte légitime (commence par un chiffre).
 */
const SHORTCODE = /\[\/?[a-zA-Z][^\]]*\]/g;

/**
 * `sanitize-html` appelle `textFilter` avec le nœud texte **déjà échappé**
 * (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;` — `escapeHtml(text, false)`,
 * `node_modules/sanitize-html/index.js:585-587`) et réinjecte tel quel ce que
 * `textFilter` retourne, sans le ré-échapper. `frenchTypo` (`typo-fr.ts`)
 * suppose au contraire un texte déjà décodé (son unique autre appelant,
 * `toBook`, l'est réellement) : ses règles matchent « lettre suivie de `;` »,
 * exactement la forme de `&amp;`/`&lt;`/`&gt;`, et y insérerait une espace qui
 * casse l'entité. On déséchappe donc avant `frenchTypo`, et on ré-échappe le
 * résultat avant de le rendre à `sanitize-html` — seuls `&`/`<`/`>` sont en jeu
 * ici (l'appel texte se fait sans guillemets, `escapeHtml(text, false)`).
 */
function unescapeHtmlEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function escapeHtmlEntities(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    // Attributs structurels de tableau (sans risque XSS) : sans eux, colspan/
    // rowspan d'un tableau éditorial seraient retirés et le tableau désaligné.
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    col: ["span"],
    colgroup: ["span"],
  },
  // Pas de javascript:/data: — seuls des schémas de navigation/mailto.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  transformTags: {
    // Les liens sortants ne doivent pas pouvoir manipuler l'onglet ouvreur.
    // `rebaseWpMediaUrl` : les liens historiques vers des fichiers `/wp-content/`
    // (PDF de `plus_loin`…) suivent le même découplage CMS que les images.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.href ? { href: rebaseWpMediaUrl(attribs.href) } : {}),
        rel: "noopener noreferrer nofollow",
      },
    }),
    // Médias historiques en http (SSL actif chez OVH) → https, rebasés vers les
    // hosts cms-* (E3 du plan) si absolus vers un domaine public, chargement paresseux.
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.src
          ? { src: rebaseWpMediaUrl(attribs.src.replace(/^http:\/\//i, "https://")) }
          : {}),
        loading: "lazy",
      },
    }),
  },
  // Orthotypographie française (E6 du plan) : c'est le point unique où le
  // HTML éditorial passe à l'insécable, avant toute réinjection dans le DOM.
  // Déséchappement/rééchappement autour de `frenchTypo` : cf. commentaire de
  // `unescapeHtmlEntities` ci-dessus.
  textFilter: (text) => escapeHtmlEntities(frenchTypo(unescapeHtmlEntities(text))),
};

/** Nettoie du HTML WordPress brut en `SafeHtml` — unique fabricant de la marque. */
export function sanitizeCms(raw: string): SafeHtml {
  return sanitizeHtml(raw.replace(SHORTCODE, ""), OPTIONS) as SafeHtml;
}

/**
 * Extrait un texte brut d'un contenu HTML (méta-descriptions, aperçus) — même
 * politique de retrait des balises et shortcodes que le rendu, pour que méta et
 * présentation convergent.
 */
export function cmsExcerpt(html: string, max = 200): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(SHORTCODE, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

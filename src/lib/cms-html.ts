import sanitizeHtml from "sanitize-html";

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
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer nofollow" },
    }),
    // Médias historiques en http (SSL actif chez OVH) → https, chargement paresseux.
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.src ? { src: attribs.src.replace(/^http:\/\//i, "https://") } : {}),
        loading: "lazy",
      },
    }),
  },
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

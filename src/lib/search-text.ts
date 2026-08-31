/**
 * Appariement texte de la recherche catalogue — pliage + jetons, en UN SEUL
 * endroit pur (règle single-source du scope doc) : la grille (`catalogue-core`,
 * filtre `q`) et la complétion (`search-suggest-core`) partagent ce module,
 * sinon la complétion trouverait « État » quand la grille afficherait
 * 0 résultat pour « etat ».
 *
 * Le pliage neutralise ce qui sépare la frappe de l'utilisateur du texte
 * stocké :
 *  - casse et diacritiques (« etat » → « État », même algorithme que les
 *    normalisations locales de `src/payload` — NFD + retrait des marques) ;
 *  - ligatures `œ`/`æ` (« oeuvres » → « Œuvres », hors de portée de NFD, qui
 *    ne décompose pas les ligatures) ;
 *  - apostrophe typographique (« l'ideologie » → « L’Idéologie ») ;
 *  - espaces insécables U+00A0/U+202F que `frenchTypo` insère dans les titres
 *    (« vive la commune ! » → « Vive la Commune ! » à la fine insécable).
 */

const SPACE_EQUIVALENTS = new Set([" ", " ", " "]);
const APOSTROPHES = new Set(["’", "ʼ"]);
const LIGATURES: Record<string, string> = { "œ": "oe", "æ": "ae" };

/** Plie UN point de code — peut en produire zéro (marque isolée) ou deux (ligature). */
function foldChar(char: string): string {
  const lower = char.toLowerCase();
  if (SPACE_EQUIVALENTS.has(lower)) return " ";
  if (APOSTROPHES.has(lower)) return "'";
  const mapped = LIGATURES[lower] ?? lower;
  return mapped.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Forme pliée d'un texte (casse, accents, ligatures, espaces typographiques). */
export function foldSearchText(value: string): string {
  let folded = "";
  for (const char of value) folded += foldChar(char);
  return folded;
}

/**
 * Forme pliée AVEC correspondance vers la chaîne d'origine — pour surligner la
 * frappe dans un texte affiché tel quel. `starts[i]`/`ends[i]` bornent (en
 * unités UTF-16 de l'origine) le caractère qui a produit `folded[i]` : un
 * « Œ » plié en « oe » pointe deux fois vers le même caractère d'origine.
 */
export interface FoldedText {
  folded: string;
  starts: number[];
  ends: number[];
}

export function foldSearchTextWithMap(value: string): FoldedText {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of value) {
    for (const produced of foldChar(char)) {
      folded += produced;
      starts.push(offset);
      ends.push(offset + char.length);
    }
    offset += char.length;
  }
  return { folded, starts, ends };
}

/**
 * Jetons de la requête : pliée puis découpée sur les blancs. Bornés à 8 —
 * au-delà, une requête ne discrimine plus rien et le coût par frappe est le
 * produit jetons × champs.
 */
export function tokenizeSearchQuery(query: string): string[] {
  return foldSearchText(query).split(/\s+/).filter(Boolean).slice(0, 8);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordStart(folded: string, index: number): boolean {
  return index === 0 || !WORD_CHAR.test(folded[index - 1]);
}

export interface TokenHit {
  index: number;
  /** Occurrence en début de mot (sert au classement des suggestions). */
  atWordStart: boolean;
}

/**
 * Cherche un jeton dans un texte PLIÉ : l'occurrence en début de mot est
 * préférée où qu'elle soit ; à défaut, la première occurrence brute. Un jeton
 * d'UN caractère n'apparie qu'en début de mot — « e » au milieu de chaque
 * titre n'est pas une recherche, c'est du bruit.
 */
export function findToken(folded: string, token: string): TokenHit | null {
  let from = 0;
  let firstAnywhere = -1;
  for (;;) {
    const index = folded.indexOf(token, from);
    if (index === -1) break;
    if (isWordStart(folded, index)) return { index, atWordStart: true };
    if (firstAnywhere === -1) firstAnywhere = index;
    from = index + 1;
  }
  if (token.length === 1 || firstAnywhere === -1) return null;
  return { index: firstAnywhere, atWordStart: false };
}

/**
 * LA règle d'appariement de la recherche : chaque jeton de la requête doit se
 * retrouver dans AU MOINS UN des champs (« dorlin genre » apparie un livre par
 * l'autrice ET par le titre). Requête vide ou blanche : tout passe.
 */
export function matchesSearchQuery(fields: string[], query: string): boolean {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return true;
  const folded = fields.map(foldSearchText);
  return tokens.every((token) => folded.some((field) => findToken(field, token) !== null));
}

/** Plage à surligner dans la chaîne d'ORIGINE (bornes UTF-16, fin exclusive). */
export interface HighlightRange {
  start: number;
  end: number;
}

/**
 * Plages d'origine à surligner pour une liste de jetons — première occurrence
 * (début de mot préféré) de chacun, triées et fusionnées quand elles se
 * chevauchent.
 */
export function highlightRanges(text: FoldedText, tokens: string[]): HighlightRange[] {
  const found: HighlightRange[] = [];
  for (const token of tokens) {
    const hit = findToken(text.folded, token);
    if (!hit) continue;
    found.push({ start: text.starts[hit.index], end: text.ends[hit.index + token.length - 1] });
  }
  found.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

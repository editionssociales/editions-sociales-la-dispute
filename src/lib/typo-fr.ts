/**
 * Orthotypographie française — fonction pure (promesse devis §3.1, témoin
 * plugin Orthotypo à remplacer). Périmètre **conservateur** par défaut :
 * on ne fait qu'espacer correctement une ponctuation déjà présente, on ne
 * convertit jamais des guillemets droits (`"…"`) en guillemets français
 * (`« … »`) — décision client Q4, l'auteur du contenu choisit sa
 * ponctuation, on ne réécrit que l'espace autour.
 *
 * Règles appliquées (cf. Lexique des règles typographiques de l'Imprimerie
 * nationale) :
 * - espace fine insécable (U+202F, NNBSP) **avant** `; ! ?` ;
 * - espace insécable (U+00A0, NBSP) **avant** `:` ;
 * - espace insécable (U+00A0, NBSP) **après `«` et avant `»`** (à
 *   l'intérieur des guillemets).
 *
 * Idempotent : toute espace déjà présente (normale, NBSP ou NNBSP) devant
 * ces signes est **remplacée** par l'espace insécable requise plutôt
 * qu'additionnée — ré-appliquer la fonction à un texte déjà typographié
 * ne fait pas grossir les espaces (nécessaire ici : appelée à la fois sur
 * les titres importés une fois et sur le HTML CMS re-sanitizé à chaque
 * rendu).
 */

const NBSP = " ";
const NNBSP = " ";

/** Espace (normale, insécable fine ou insécable) ou tabulation. */
const SPACE_RUN = `[ \\t${NBSP}${NNBSP}]*`;

/**
 * Caractère « de mot » : ni espace, ni l'une des ponctuations concernées —
 * sert de garde pour ne pas insérer d'espace en tête de chaîne ni entre deux
 * signes de ponctuation consécutifs (« ?! » doit rester collé, une seule
 * espace fine précède le groupe entier, posée par le premier signe).
 */
const WORD_CHAR = `[^\\s;!?:«»${NBSP}${NNBSP}]`;

const BEFORE_NNBSP = new RegExp(`(${WORD_CHAR})${SPACE_RUN}([;!?])`, "g");
/**
 * Garde `(?!\/\/)` : un `:` de schéma d'URL (`http://…`, `https://…`) est
 * toujours collé aux deux barres qui suivent — jamais un deux-points de
 * ponctuation française, qui est lui suivi d'une espace ou d'un mot. Sans
 * cette garde, une URL citée en texte visible (bibliographie « pour aller
 * plus loin ») ressort défigurée (`http ://…`).
 */
const BEFORE_NBSP_COLON = new RegExp(`(${WORD_CHAR})${SPACE_RUN}(:)(?!//)`, "g");
const AFTER_OPEN_GUILLEMET = new RegExp(`(«)${SPACE_RUN}(\\S)`, "g");
const BEFORE_CLOSE_GUILLEMET = new RegExp(`(\\S)${SPACE_RUN}(»)`, "g");

/**
 * Espace les ponctuations françaises à l'insécable — pur, sans I/O.
 * Appelée sur du texte déjà décodé (entités HTML résolues) : titres
 * (`toBook`) et nœuds texte du HTML éditorial (`textFilter` de `cms-html`).
 */
export function frenchTypo(text: string): string {
  return text
    .replace(BEFORE_NNBSP, `$1${NNBSP}$2`)
    .replace(BEFORE_NBSP_COLON, `$1${NBSP}$2`)
    .replace(AFTER_OPEN_GUILLEMET, `$1${NBSP}$2`)
    .replace(BEFORE_CLOSE_GUILLEMET, `$1${NBSP}$2`);
}

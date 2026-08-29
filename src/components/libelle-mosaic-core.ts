/**
 * Arithmétique pure de `libelle-mosaic.tsx` (#77) — étages, métriques et
 * garde-fou de libellé. Extraite à l'IDENTIQUE (mêmes valeurs, mêmes
 * formules) pour être testée sans DOM ; le composant reste l'unique
 * consommateur de ce module.
 */

/**
 * Nombre maximum de cases sur un même étage (retour Youri 25/07). Au-delà de
 * quatre, la case devient trop étroite pour son corps : le libellé passe à
 * trois lignes ou plus — plus jamais clippé (la hauteur d'étage est
 * intrinsèque, cf. `tierMetrics`), mais visuellement dense.
 */
const MAX_TIER_CELLS = 4;

/**
 * Répartition en étages : l'étage i (1-indexé) héberge i cases, PLAFONNÉES à
 * `MAX_TIER_CELLS` — la pyramide 1-2-3-4 puis des étages de quatre. Le dernier
 * étage prend simplement le reliquat (jamais de trou : les largeurs se
 * répartissent au prorata des libellés, cf. `labelSpan`).
 */
export function tierRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  let start = 0;
  for (
    let size = 1;
    start < items.length;
    size = Math.min(size + 1, MAX_TIER_CELLS)
  ) {
    rows.push(items.slice(start, start + size));
    start += size;
  }
  return rows;
}

/**
 * Span horizontal d'un libellé, en caractères — la LARGEUR de la case lui est
 * proportionnelle (retour Youri 25/07 : plus de parts égales sur un étage).
 *
 * Le libellé est posé sur DEUX LIGNES au maximum : le span est donc la plus
 * courte des largeurs atteignables, soit `min` sur toutes les coupures de MOT
 * du `max` des deux lignes — la coupure équilibrée, celle que `text-balance`
 * produit au rendu. Un libellé d'un seul mot occupe forcément sa longueur.
 *
 * Le comptage au caractère suffit : le corps est le même pour toutes les cases
 * d'un étage, et deux lignes écrasent déjà l'écart entre libellés (un rapport
 * 20/4 sur les longueurs brutes retombe à ~10/4 sur les spans) — assez pour
 * qu'une case ne devienne jamais un filet. Pas de mesure typographique fine :
 * il s'agit de proportions entre voisines, pas d'un ajustement au pixel.
 */
export function labelSpan(label: string) {
  const words = label.split(" ");
  let best = label.length;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ").length;
    const right = words.slice(i).join(" ").length;
    best = Math.min(best, Math.max(left, right));
  }
  return best;
}

/**
 * Nombre de lignes qu'un étage laisse à un libellé avant de commencer à
 * gonfler visiblement sa case — retour client 29/08 : « que les carrés
 * fassent apparaître le texte en entier », plus question de le tronquer pour
 * tenir dans une hauteur imposée (cf. `tierMetrics`, qui n'impose plus rien).
 * Ce n'est PAS un plafond dur : un libellé qui dépasserait cette estimation à
 * `MAX_LINES + 1` lignes s'étale simplement sur une case un peu plus haute,
 * jamais clippé — la rangée suit toujours sa pire case.
 */
const MAX_LINES = 2;

/**
 * Constante de calibration d'`estimatedLines`/`tierMetrics` : le nombre de
 * « caractères × px de corps » qu'une case SEULE sur sa rangée (une seule
 * case, `cellsInRow` = 1) tient sur une seule ligne. Calée pour que l'étage-
 * bannière (« Tous les livres », seule sur sa rangée) retrouve un corps
 * proche de l'ancien réglage (42px) une fois réparti sur `MAX_LINES` lignes —
 * valeur empirique, pas dérivée d'une mesure DOM.
 */
const FONT_FIT_LG = 180;
/** Même loi que le corps large, depuis sa propre base à moitié (mobile). */
const FONT_FIT_SM = FONT_FIT_LG / 2;

const floor1 = (n: number) => Math.floor(n * 10) / 10;

/**
 * Estimation du nombre de lignes que `label` occuperait à un corps `fontPx`,
 * dans une case qui partage sa rangée avec `cellsInRow` cases — heuristique
 * par longueur de caractères (`labelSpan`, comme pour la largeur), JAMAIS une
 * mesure DOM : plus il y a de cases sur la rangée, moins chacune capte de
 * largeur, donc moins de caractères par ligne à corps égal. Le petit epsilon
 * absorbe le bruit flottant d'un `floor1` en amont (cf. `tierMetrics`) : sans
 * lui, un résultat pile égal à `MAX_LINES` pourrait remonter d'un cran par
 * imprécision binaire.
 */
export function estimatedLines(label: string, fontPx: number, cellsInRow: number): number {
  const charsPerLine = FONT_FIT_LG / (fontPx * Math.max(cellsInRow, 1));
  return Math.ceil(labelSpan(label) / Math.max(charsPerLine, 1e-6) - 1e-9);
}

/**
 * Métriques d'un étage — le corps est désormais DÉCOUPLÉ de la popularité du
 * libellé (arbitrage client 29/08 : la taille des cases ne doit plus dépendre
 * du nombre de livres, seul l'ordre de lecture — `byCount`, dans le composant
 * — en dépend encore). C'est le plus grand corps qui laisse tenir CHAQUE
 * libellé de l'étage (le plus large, `labelSpan`) dans `MAX_LINES` lignes,
 * sachant que les `labels.length` cases de la rangée s'en partagent la
 * largeur (résolution algébrique d'`estimatedLines`, `floor1` pour ne jamais
 * arrondir AU-DESSUS du corps sûr). Desktop et mobile partagent la même loi
 * depuis leur propre base (`FONT_FIT_SM` = moitié de `FONT_FIT_LG`).
 *
 * Ni plancher ni plafond (même parti pris que l'ancien réglage, cf. historique
 * ci-dessous) : un étage dense de libellés longs retombe à un corps très fin
 * plutôt que de clipper ou de tronquer — la hauteur d'étage étant intrinsèque
 * (`libelle-mosaic.tsx` n'impose plus de hauteur `--th`/`--th-sm`), un
 * dépassement du budget de lignes agrandit simplement la case.
 *
 * Historique : la première version calait corps ET épaisseur sur le seul RANG
 * de popularité (`BASE/(rang+1)`, `BASE/rang`), avec un compte de titres en
 * coin (`BASE/(rang+2)`). Le rang pilotait alors une case étroite à hauteur
 * imposée, tronquant les libellés longs (`truncateWords` à 20 caractères) —
 * exactement ce que le retour client du 29/08 disqualifie. Le compte de coin
 * est supprimé du rendu (`libelle-mosaic.tsx`), donc de ces métriques.
 */
export function tierMetrics(labels: string[]) {
  const cells = Math.max(labels.length, 1);
  const worst = Math.max(...labels.map(labelSpan), 1);
  return {
    fontLg: floor1((FONT_FIT_LG * MAX_LINES) / (cells * worst)),
    fontSm: floor1((FONT_FIT_SM * MAX_LINES) / (cells * worst)),
  };
}

/** Plafond d'un mot DÉGÉNÉRÉ — jamais atteint par un intitulé éditorial
 *  normal (les libellés thématiques du catalogue tiennent tous largement
 *  en dessous). Relevé très au-dessus de l'ancien seuil d'affichage (20 → 60,
 *  retour client 29/08 : les libellés doivent apparaître en ENTIER, la
 *  troncature ne porte plus sur le texte visible) — ce garde-fou ne reste que
 *  pour un mot unique si long qu'aucun corps raisonnable ne le ferait tenir
 *  (ex. un intitulé collé sans espace importé par erreur).
 */
const MAX_LABEL = 60;

/**
 * Coupe un libellé DÉGÉNÉRÉ sur une frontière de MOT : au-delà de `MAX_LABEL`
 * caractères (jamais atteint en usage normal), on garde les mots entiers tant
 * qu'on tient dans la limite, jamais une troncature au milieu d'un mot. La
 * ponctuation de liaison restée en fin de coupe est retirée — « État, droit &
 * institutions » donne « État, droit », pas « État, droit & », qui annoncerait
 * un mot absent. Repli : un premier mot déjà plus long que la limite est
 * gardé ENTIER (le couper au caractère produirait un fragment illisible).
 *
 * Le nom complet n'est jamais perdu pour autant : la case coupée porte le
 * libellé entier en `sr-only` et masque sa version courte à l'arbre a11y —
 * sinon la troncature dégraderait aussi le nom accessible du lien.
 */
export function truncateWords(label: string) {
  if (label.length <= MAX_LABEL) return label;
  let out = "";
  for (const word of label.split(" ")) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > MAX_LABEL) break;
    out = next;
  }
  return (out || label.split(" ")[0]).replace(/[\s,&·–-]+$/u, "");
}

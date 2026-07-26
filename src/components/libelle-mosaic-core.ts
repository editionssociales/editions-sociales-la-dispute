/**
 * Arithmétique pure de `libelle-mosaic.tsx` (#77) — étages, métriques et
 * troncature de libellé. Extraite à l'IDENTIQUE (mêmes valeurs, mêmes
 * formules) pour être testée sans DOM ; le composant reste l'unique
 * consommateur de ce module.
 */

/**
 * Nombre maximum de cases sur un même étage (retour Youri 25/07). Au-delà de
 * quatre, la case devient trop étroite pour son corps : le libellé passe à
 * trois lignes ou plus et se fait clipper par la hauteur imposée de l'étage.
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
 * Métriques d'un étage — toutes décroissantes avec son RANG, chacune sur sa
 * propre loi (retour Youri 25/07). Desktop et mobile ont des bases propres,
 * le mobile valant la moitié du desktop ; tout est arrondi au dixième.
 *
 * - corps : `BASE / (rang + 1)` → 42-40-30-24-20-17,1 px en desktop.
 *   Le `+ 1` au dénominateur est le point du réglage : il fait décroître le
 *   texte MOINS VITE que l'épaisseur (en `1/rang`), donc les cases s'aplatis-
 *   sent plus qu'elles ne rapetissent — le libellé reste lisible en bas.
 *   SEULE exception, l'étage 1 (« Tous les livres ») porte 30 % de moins
 *   (`TIER1_FONT_RATIO`) : sa case est une bannière pleine largeur, le corps
 *   de formule y était démesuré. La réduction est locale au rang 1 — la
 *   formule des autres étages n'en est jamais affectée.
 * - épaisseur : `BASE / rang`, SAUF ce même étage 1, laissé en hauteur
 *   automatique : c'est la bannière du catalogue, elle se règle sur son
 *   propre corps.
 * - compte en coin : `BASE / (rang + 2)`, la pente la plus douce des trois —
 *   il ne suit plus le corps du libellé sous plafond (ancien `min(9px,
 *   corps)`) mais vit sa vie de chiffre. Le rang 1 porte le MÊME abattement
 *   que le corps, pour que la bannière reste d'un seul bloc. Base assez haute
 *   pour que le nombre passe DEVANT le libellé en taille : c'est le parti pris
 *   du 25/07, le chiffre est le sujet et le libellé sa légende.
 *
 * Imposer la hauteur retire la latitude du padding vertical : les cases des
 * étages 2+ passent en `py-0` + `overflow-hidden`, sinon `py-2` (16px)
 * mangerait à lui seul l'essentiel des étages profonds.
 *
 * Le calage sur le NOMBRE DE CASES (essayé le même jour) est écarté, et le
 * plafond de `MAX_TIER_CELLS` le condamne définitivement : les étages du bas
 * comptent tous quatre cases — 19 libellés donnent 1-2-3-4-4-4-1 — ils
 * seraient donc tous à la même taille, décroissance à plat.
 *
 * Ni plancher ni terme constant AJOUTÉ au numérateur (auparavant
 * `6 + 30/rang`, planchers 10px desktop et 9px mobile) : ils écrasaient la
 * pente en bas, et le plancher mobile bloquait net à 9px dès l'étage 4.
 * Valeurs FRACTIONNAIRES et non entières : sous ~8px, l'arrondi à l'unité
 * remettait des étages à égalité — soit la pente écrasée qu'on vient de
 * corriger. Les cases restent des cibles < 44px sur les étages profonds :
 * entorse à R7 assumée par le client (densité voulue de la vue).
 */
const FONT_BASE_LG = 120;
const FONT_BASE_SM = 60;
const THICK_BASE_LG = 300;
const THICK_BASE_SM = 150;
/** 192 et 96 abattus de 10 % (retour Youri 25/07). */
const COUNT_BASE_LG = 172.8;
const COUNT_BASE_SM = 86.4;
/** Abattement du seul rang 1 (« Tous les livres »), −30 % : corps ET compte. */
const TIER1_FONT_RATIO = 0.7;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function tierMetrics(rank: number) {
  const abattement = rank === 1 ? TIER1_FONT_RATIO : 1;
  return {
    // Corps : en 1/(rang + 1), décroissance plus lente que l'épaisseur.
    fontLg: round1((FONT_BASE_LG / (rank + 1)) * abattement),
    fontSm: round1((FONT_BASE_SM / (rank + 1)) * abattement),
    // Compte : en 1/(rang + 2), la pente la plus douce des trois.
    countLg: round1((COUNT_BASE_LG / (rank + 2)) * abattement),
    countSm: round1((COUNT_BASE_SM / (rank + 2)) * abattement),
    // Étage 1 (« Tous les livres ») : hauteur automatique, jamais imposée.
    thickLg: rank === 1 ? null : round1(THICK_BASE_LG / rank),
    thickSm: rank === 1 ? null : round1(THICK_BASE_SM / rank),
  };
}

/** Longueur maximale d'un libellé AFFICHÉ (retour Youri 25/07). */
const MAX_LABEL = 20;

/**
 * Coupe un libellé trop long sur une frontière de MOT : on garde les mots
 * entiers tant qu'on tient dans `MAX_LABEL`, jamais une troncature au milieu
 * d'un mot. La ponctuation de liaison restée en fin de coupe est retirée —
 * « État, droit & institutions » donne « État, droit », pas « État, droit & »,
 * qui annoncerait un mot absent. Repli : un premier mot déjà plus long que la
 * limite est gardé ENTIER (le couper au caractère produirait un fragment
 * illisible).
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

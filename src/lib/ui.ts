/**
 * Primitives de classes de l'UI brutaliste — définies une fois, littérales (le
 * JIT Tailwind ne compile pas les classes concaténées dynamiquement).
 */

/**
 * Anneaux de focus (R5) — DEUX anneaux de base + DEUX surcharges de survol,
 * jamais un anneau recréé à la main.
 *
 * Règle de choix : la couleur de l'anneau doit contraster à 3:1 (WCAG 1.4.11)
 * avec le fond que l'anneau BORDE — celui de l'ÉLÉMENT pour les anneaux
 * INTÉRIEURS (offset négatif, peints sur l'élément), celui de la page pour les
 * anneaux EXTÉRIEURS (`*_OUTER`, peints à 2px de l'élément, dans le vide qui
 * l'entoure). D'où :
 *
 *  • `*_LIGHT` (outline ink) sur tout fond clair — paper 17,19:1, paper-2
 *    15,62:1 — ou pop (jaune 15,19:1, rose 9,92:1, bleu 9,89:1, orange
 *    5,09:1) ;
 *  • `*_DARK` (outline pop-yellow) sur tout fond sombre — ink 15,19:1, navy
 *    11,07:1, brick 4,99:1, bottle 6,40:1.
 *
 * Le pop-yellow n'a de contraste réel que sur fond sombre (1,13:1 sur paper,
 * 1:1 sur le chip jaune lui-même) : un seul token pour les deux contextes
 * garantissait qu'il soit faux dans l'un des deux.
 *
 * **Un anneau de base ne décrit QUE l'état de repos.** Dès qu'une surface
 * change de fond au survol (`hover:bg-*`), le fond que l'anneau borde change
 * sous le pointeur alors que sa couleur, elle, est FIXE : l'anneau devient
 * invisible dans l'un des deux états (jaune sur jaune 1:1, ink sur ink 1:1,
 * jaune sur paper 1,13:1). C'est le défaut que les surcharges ci-dessous
 * réparent — cf. `FOCUS_RING_HOVER_LIGHT`/`_DARK`. Les anneaux `*_OUTER` en
 * sont exemptés : ils bordent le fond de PAGE, que le survol de l'élément ne
 * touche pas.
 */

/** Anneau intérieur (offset négatif) — fond clair ou pop : outline ink (R1, jamais noir littéral). */
export const FOCUS_RING_LIGHT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-[-2px]";

/** Variante extérieure (décollée de 2px) du même anneau clair. */
export const FOCUS_RING_LIGHT_OUTER =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Anneau intérieur (offset négatif) — fond ink/noir : outline pop-yellow.
 *  (La variante extérieure sombre a disparu avec son dernier usage — l'étagère
 *  mobile de /souscription, passée sur fond paper le 2026-07-25 ; la recréer
 *  ici si le besoin revient.) */
export const FOCUS_RING_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]";

/**
 * SURCHARGES DE SURVOL — à composer avec l'anneau de base dès qu'une surface
 * porte un `hover:bg-*` qui change son fond (jamais seules : elles ne posent ni
 * `outline`, ni l'épaisseur, ni l'offset, uniquement la COULEUR). Le suffixe
 * désigne, comme pour les anneaux de base, la tonalité du fond qu'elles
 * bordent — celui du SURVOL :
 *
 *  • `_LIGHT` (outline ink) quand le survol vire au clair ou au pop — paper
 *    17,19:1, paper-2 15,62:1, jaune 15,19:1, rose 9,92:1, bleu 9,89:1,
 *    orange 5,09:1 ;
 *  • `_DARK` (outline paper) quand le survol vire au sombre — ink 17,19:1,
 *    navy 12,53:1, bottle 7,24:1, brick 5,65:1.
 *
 * `_DARK` peint du `paper` et non le `pop-yellow` des anneaux de base : sur
 * ink, paper monte à 17,19:1 contre 15,19:1, et une seule couleur d'appoint
 * suffit alors pour TOUS les fonds sombres, brick compris (le jaune n'y ferait
 * que 4,99:1, le paper 5,65:1).
 *
 * **Pourquoi ça surcharge sans dépendre de l'ordre de la feuille** : la
 * variante empilée `hover:focus-visible:` porte une pseudo-classe de plus que
 * la règle de base, donc une spécificité plus haute — elle gagne quel que soit
 * l'ordre d'écriture. C'est le piège d'ordre documenté pour `Container.width`
 * et `Button`, ici désamorcé par la spécificité et non par l'ordre.
 *
 * Un bouton `disabled` n'est pas focalisable : les `disabled:hover:bg-*` qui
 * rétablissent le fond de repos n'ont donc jamais d'anneau à contredire.
 */
export const FOCUS_RING_HOVER_LIGHT = "hover:focus-visible:outline-ink";

export const FOCUS_RING_HOVER_DARK = "hover:focus-visible:outline-paper";

/**
 * Composition NOMMÉE la plus fréquente — fond clair au repos, sombre au
 * survol : `FOCUS_RING_LIGHT` + `FOCUS_RING_HOVER_DARK`. Portée entre autres
 * par les surfaces qui s'inversent orange ↔ ink (variante `alarm` de
 * `button.tsx`, poignée de `bottom-sheet.tsx` — les deux entrées vers le
 * paiement de /souscription) : ink 5,09:1 sur l'orange au repos, paper
 * 17,19:1 sur l'ink au survol.
 *
 * Le `pop-yellow` de `FOCUS_RING_DARK` a été essayé sur l'orange et retiré :
 * 2,99:1, juste SOUS le seuil de 3:1 de WCAG 1.4.11 (le commentaire de
 * `button.tsx` annonçait « ≈3:1 » ; c'était en dessous).
 */
export const FOCUS_RING_INVERTING = `${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`;

/**
 * Cellule inversante : fond clair au repos, inversion en ink à l'état actif —
 * et au survol quand elle est inactive. Recette partagée par les étiquettes de
 * filtres et les numéros de pagination. (L'index-manifeste des libellés n'en
 * relève plus : ses liens sont transparents au repos, un fond opaque
 * masquerait la bande inversée de la ligne supérieure — cf.
 * `libelle-mosaic.tsx`.)
 *
 * La branche INACTIVE change de fond au survol : elle porte donc elle-même la
 * surcharge d'anneau qui va avec (l'appelant ne fournit que l'anneau de base,
 * `FOCUS_RING_LIGHT`, calé sur le repos). La branche active ne bouge pas — son
 * `FOCUS_RING_DARK` suffit dans les deux états.
 */
export function invertingCell(active: boolean): string {
  return active
    ? "bg-ink text-paper"
    : `bg-paper text-ink hover:bg-ink hover:text-paper ${FOCUS_RING_HOVER_DARK}`;
}

/**
 * Typo des cellules de la barre de filtres du catalogue — partagée par
 * `catalogue-filters.tsx` (recherche, sélecteurs, maisons) et
 * `catalogue-search-box.tsx` (le champ extrait avec sa complétion), qui
 * composent la MÊME grille encadrée : la promouvoir ici évite qu'un des deux
 * fichiers dérive tout seul. Corps 12px depuis la 9e passe du 2026-08-30
 * (« uniformise les tailles de polices dans la section de tri ») — même
 * corps que les chips de filtres actifs et que les options du dropdown de
 * complétion.
 */
export const FILTER_CELL_TEXT = "text-[12px] font-bold uppercase tracking-[.03em] text-ink";

/**
 * Lien pastille « PDF » (table des matières, extrait choisi) — recette
 * partagée par la fiche livre boutique et la fiche livre catalogue
 * (`boutique/[slug]/page.tsx`, `catalogue/[edition]/[slug]/page.tsx`), sinon
 * copiée-collée à l'identique 4 fois. `${FOCUS_RING_LIGHT}` reste à la charge
 * de l'appelant (interpolation dans un template literal, pas dans cette
 * constante littérale) — mais l'inversion paper → ink du survol appartient à
 * la recette, donc la surcharge d'anneau qui l'accompagne aussi.
 */
export const PDF_LINK_CLASS =
  `inline-flex items-center bg-paper px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_HOVER_DARK}`;

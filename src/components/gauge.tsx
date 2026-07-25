"use client";

import type { CSSProperties } from "react";
import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";
import { useImpactFrame } from "@/components/impact-frame";

/**
 * Un palier, réduit à ce que la jauge en fait encore : une ABSCISSE. Depuis la
 * suppression de la bande de libellés (retour Youri 26/07), ni l'intitulé ni
 * l'état atteint ne sont peints ici — les paliers se disent par les COUPURES
 * de la barre, et se détaillent dans l'escalier des objectifs et le rail des
 * contreparties, plus bas dans la page. Type structurel : un `GaugeMarker[]`
 * (`lib/campaign`, inchangé) s'y range toujours.
 */
type Marker = { value: number };

/**
 * La barre s'étend 20 % au-delà de l'objectif (demi-droite). Exporté avec
 * `MASK_STYLE` : le liseré de collecte fixé au viewport
 * (`souscription/_components/collecte-ticker.tsx`) rejoue EXACTEMENT le même
 * empan et la même queue — deux recettes séparées dériveraient au premier
 * changement d'objectif.
 */
export const OVERSHOOT = 1.2;

/**
 * Fraction de l'objectif où la barre part en pointillés (≈ 105 000 € pour un
 * objectif à 100 000 €) : au-delà, l'axe ne promet plus rien, il se prolonge.
 */
const DASH_FROM = 1.05;

/** Part de la barre peinte en plein (le reste = la queue en pointillés). */
const SOLID_PCT = (DASH_FROM / OVERSHOOT) * 100;

/**
 * Chevauchement (en % de la barre) de l'aplat sur la boîte de la queue. Les
 * deux calques de masque s'ABOUTAIENT pile à `SOLID_PCT`, et l'arrondi
 * sous-pixel y laissait un jour d'un demi-pixel — vu comme une couture vers
 * 104 000 € (constat client 26/07). Les calques d'un masque s'UNISSENT : les
 * faire déborder l'un sur l'autre est parfaitement invisible, et referme la
 * couture à toutes les largeurs.
 */
const SEAM_OVERLAP_PCT = 0.3;

/** Fin de l'aplat, chevauchement anti-couture compris. */
const SOLID_END_PCT = SOLID_PCT + SEAM_OVERLAP_PCT;

/**
 * Demi-largeur d'une coupure de palier (px) : fente de 8px, MOITIÉ des ~16px
 * que mesurent les découpes de la queue à pleine largeur (retour Youri 26/07,
 * « comme à la fin mais 2 fois moins larges »). En pixels fixes et non en
 * pourcentage : une démarcation doit être aussi franche à 320px de barre qu'à
 * 1200px.
 */
const CUT_HALF_PX = 4;

/**
 * Épaisseur du contour (px) — celle des objets ombrés du site (R8). Les
 * classes Tailwind la répètent en littéral (`w-[2px]`, `h-[2px]`) : le JIT ne
 * compile pas le dynamique ; la constante ne sert donc qu'aux `calc()`, qui
 * passent eux par `style`.
 */
const EDGE_PX = 2;

/**
 * Pourcentage CSS lisible : `(1.05 / 1.2) * 100` vaut `87.50000000000001` en
 * binaire, illisible dans une feuille de style. L'arrondi au 1/10 000 de %
 * reste deux ordres de grandeur sous le pixel.
 */
const cssPct = (n: number) => `${Number(n.toFixed(4))}%`;

/**
 * Queue de quatre tirets qui raccourcissent ET s'effacent — la demi-droite
 * « se termine en douceur » sans jamais dégrader l'aplat lui-même (R8 : les
 * tirets sont des pleins, c'est leur suite qui s'éteint).
 *
 * Ses arrêts sont en POURCENTAGES de sa propre boîte (posée par `mask-size`) :
 * le nombre de tirets reste le même de 320px à 1200px, seule leur longueur
 * suit. Deux couches de masque (union par défaut) plutôt qu'un
 * `mask-composite`, dont les mots-clés divergent encore entre Safari et le
 * reste.
 */
const DASH_TAIL =
  "linear-gradient(90deg,#000 0 22%,transparent 22% 34%,rgba(0,0,0,.68) 34% 52%,transparent 52% 64%,rgba(0,0,0,.4) 64% 78%,transparent 78% 88%,rgba(0,0,0,.18) 88% 96%,transparent 96%)";

const MASK = `linear-gradient(#000,#000) left top / ${cssPct(SOLID_END_PCT)} 100% no-repeat, ${DASH_TAIL} right top / ${cssPct(100 - SOLID_PCT)} 100% no-repeat`;

/** Le masque s'applique à l'élément ENTIER, box-shadow comprise : l'ombre dure
 *  est donc peinte par un calque jumeau décalé, jamais par `box-shadow` (elle
 *  serait rognée hors de la boîte, donc invisible).
 *
 *  Version SANS coupures : c'est celle du liseré de viewport, qui ne porte plus
 *  aucune marque de palier (retour Youri 26/07). La jauge, elle, construit son
 *  masque à partir de ses `markers` — cf. `buildCutMask`. */
export const MASK_STYLE = { mask: MASK, WebkitMask: MASK } as const;

/**
 * Masque de la JAUGE = celui du liseré, plus les COUPURES DE PALIERS (retour
 * Youri 26/07 : « fais des vraies démarcations de paliers […] des coupures
 * nettes, avec visibilité sur l'ombre »). Chaque abscisse de palier ouvre une
 * fente TRANSPARENTE de 8px dans l'aplat : la barre devient quatre morceaux
 * francs (0→50 k, 50→80 k, 80→100 k, 100 k→queue) et, le calque jumeau d'ombre
 * partageant le MÊME masque, chaque fente laisse voir l'ombre 8px en contrebas
 * — exactement le rendu des tirets de fin. Les anciens traits blancs posés
 * PAR-DESSUS l'aplat ne démarquaient rien : ils ajoutaient de la matière là où
 * il fallait en retirer.
 *
 * L'aplat est ici un dégradé étalé sur la boîte ENTIÈRE de la barre
 * (`100% 100%`, là où `MASK` le dimensionne à `SOLID_END_PCT`) : ses arrêts en
 * pourcentage se lisent alors directement sur la largeur de barre — mêmes
 * abscisses que les paliers et que les montants de contour, aucune conversion
 * de repère. La fin de l'aplat, chevauchement compris, passe donc du
 * `mask-size` au dernier arrêt.
 */
function buildCutMask(cuts: readonly string[]): CSSProperties {
  const stops: string[] = [];
  let from = "0";
  for (const x of cuts) {
    const lip = `calc(${x} - ${CUT_HALF_PX}px)`;
    const rim = `calc(${x} + ${CUT_HALF_PX}px)`;
    stops.push(`#000 ${from} ${lip}`, `transparent ${lip} ${rim}`);
    from = rim;
  }
  const end = cssPct(SOLID_END_PCT);
  stops.push(`#000 ${from} ${end}`, `transparent ${end}`);
  const mask = `linear-gradient(90deg,${stops.join(",")}) left top / 100% 100% no-repeat, ${DASH_TAIL} right top / ${cssPct(100 - SOLID_PCT)} 100% no-repeat`;
  return { mask, WebkitMask: mask };
}

/**
 * Jauge de collecte : un aplat ocher porte la barre entière ; un cache couleur
 * `line` se retire vers la droite à l'entrée dans le viewport pour révéler la
 * part collectée. Ce cache est `line` dans LES DEUX tones (retour client
 * 26/07, revert de l'inversion de charge du 25/07 : un cache ink fusionnait
 * avec l'ombre dure du calque jumeau, la barre n'avait plus de contour).
 *
 * Barre NUE (retour Youri 26/07) : plus une seule abscisse écrite sous ou sur
 * la barre — les coupures du masque sont les seules démarcations de paliers.
 *
 * Deux marques suivent le front, et une seule course les porte (`--tx`) :
 * le TRAIT DE COUPE soudé au bord gauche du cache — il vit DANS la barre,
 * donc masqué et clippé comme elle — et le CURSEUR triangulaire, qui doit au
 * contraire vivre dans un calque jumeau (le masque et l'`overflow-hidden` de
 * la barre le dévoreraient hors de la zone pleine). Les deux sont gardés
 * distincts plutôt que fusionnés : ils ne subissent pas le même rognage, et
 * empilés ils font UNE marque (lame + tête de plomb).
 *
 * Demi-droite (maquette 25/07) : la barre dépasse l'objectif de 20 %
 * (`OVERSHOOT`) — l'axe continue après le sommet, ce qui donne où peindre un
 * éventuel dépassement de collecte. Passé ≈ 105 000 € (`DASH_FROM`), il part en
 * pointillés dégressifs.
 *
 * Coquille de rendu : toute l'arithmétique de campagne (valeur, max, paliers)
 * est dérivée en amont par `lib/campaign` ; la jauge ne fait que peindre des
 * positions et jouer l'effet de révélation.
 *
 * `tone` recolore l'ombre et le curseur — la barre elle-même porte des teintes
 * FIXES (ocher, cache `line`, trait de coupe ink, contour navy), lisibles sur
 * les deux fonds : `"light"` (défaut, ombre navy) pour une jauge posée sur
 * paper — c'est le cas du héros de `/souscription` depuis l'inversion des fonds
 * du 26/07 ; `"dark"` (ombre paper translucide) pour une jauge posée sur ink.
 *
 * Sous `<ImpactFrame>`, la course part au signal PARTAGÉ du bloc plutôt qu'à
 * l'entrée en vue de la jauge seule : compteur monumental et barre atterrissent
 * alors sur la même frame (1600 ms, même easeOutCubic). Hors provider, rien ne
 * change — la jauge garde son propre observer.
 */
export function Gauge({
  value,
  max,
  markers,
  className = "",
  tone = "light",
}: {
  value: number;
  max: number;
  markers: Marker[];
  className?: string;
  tone?: "light" | "dark";
}) {
  const [ref, ownInView] = useInView<HTMLDivElement>({ threshold: 0.4 });
  // Déclencheur partagé quand la jauge est montée dans un `<ImpactFrame>`
  // (`null` sinon) : `??` et pas `||`, un `false` partagé doit gagner.
  const shared = useImpactFrame();
  const filled = shared ?? ownInView;
  // Positions en % de la barre ENTIÈRE (objectif + dépassement) : l'objectif
  // tombe à 100/1.2 ≈ 83,3 % ; une collecte au-delà de l'objectif continue
  // de se peindre sur le dépassement (cap au bout de la demi-droite).
  const span = max * OVERSHOOT;
  const pct = Math.min((value / span) * 100, 100);
  const dark = tone === "dark";
  // Abscisses des paliers, calculées UNE fois : la même chaîne sert la fente
  // du masque et les deux montants de contour qui la bordent — au moindre
  // arrondi divergent, le contour ne collerait plus aux lèvres.
  const cuts = markers.map((m) => cssPct((m.value / span) * 100));
  const maskStyle = buildCutMask(cuts);
  // Course UNIQUE du cache et du curseur : même `--tx`, même animation — les
  // deux calques sont verrouillés frame à frame, aucune dérive possible entre
  // le front du cache et la marque qui le désigne. `--tx` sert aux
  // keyframes (`gauge-sweep`, globals.css), `transform` porte l'état final —
  // c'est lui qui s'applique seul sous `prefers-reduced-motion`
  // (téléportation) comme avant le signal.
  const sweepStyle = {
    "--tx": `${pct}%`,
    transform: filled ? `translateX(${pct}%)` : "translateX(0)",
  } as CSSProperties;
  // À 0 € rien ne se retire : pas d'animation du tout, sans quoi la barre
  // « respirerait » du seul demi-cran de garniture. Le curseur reste posé à
  // l'origine.
  const sweepClass = filled && pct > 0 ? "gauge-sweep" : "";

  return (
    <div ref={ref} className={className}>
      {/* Boîte de la barre : hauteur DOUBLÉE (32px, retour Youri 26/07) —
          l'ombre dure s'y superpose au lieu de vivre en absolu dans le
          conteneur. Aucune réserve haute : la bande de libellés qui l'exigeait
          (`pt-16 sm:pt-20`) a disparu. Le curseur, lui, déborde de 6px par le
          haut (il est à moitié hors barre) — c'est à l'appelant de lui laisser
          cette avance (`mt-4` sur /souscription). */}
      <div className="relative h-8">
        {/* Ombre dure (R8, recette des couvertures de carrousel) peinte par un
            calque jumeau masqué à l'identique : elle épouse donc les pointillés
            de la queue ET les coupures de paliers au lieu de s'arrêter net.
            NAVY en light (retour Youri 26/07, « colore-le en bleu, pareil pour
            l'ombre ») : exception assumée à l'ombre ink de R8 — sur cette barre,
            l'accent maison porte à la fois le contour et sa retombée. */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 translate-x-2 translate-y-2 ${dark ? "bg-paper/30" : "bg-navy"}`}
          style={maskStyle}
        />
        {/* Alternative programmatique (a11y) : la pile de <div> anonymes
            n'expose sinon ni la nature de jauge ni le taux de remplissage —
            elle porte seule, depuis la suppression des libellés, le montant et
            l'objectif en toutes lettres. */}
        <div
          role="img"
          aria-label={`${formatInt(value)} € collectés sur un objectif de ${formatInt(max)} €`}
          // Barre ORANGE d'un bout à l'autre (retour Youri 25/07, remplace les
          // quatre blocs navy/bottle/ocher/brick) : ocher est l'orange de la
          // charte (R3, accent d'attente) — lisible sur ink comme sur paper.
          className="relative h-full overflow-hidden bg-ocher"
          style={maskStyle}
        >
          {/* Cache : recouvre la part non collectée, glisse vers la droite.
              Animé en transform (composité GPU) plutôt qu'en `left`
              (layout+paint à chaque frame) : translateX en % se réfère à la
              largeur propre (= la barre entière), le débordement à droite est
              clippé par l'overflow-hidden du parent. */}
          <div
            className={`absolute inset-0 bg-line ${sweepClass}`}
            style={sweepStyle}
          >
            {/* Front de coupe : la lame posée sur le bord du cache — c'est
                l'affordance à 0 %, elle dit que la barre est entamable.
                Enfant du cache : le même translateX l'emporte, gratuitement.
                En ink dans les DEUX tones, comme le curseur qui la coiffe : le
                cache est `line` partout, et ink est la seule teinte qui tranche
                à la fois sur lui et sur l'ocher qu'il borde à gauche — le navy
                du contour, lui, resterait lu comme une démarcation de palier. */}
            <div className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
          </div>
          {/* CONTOUR navy des morceaux de barre (retour Youri 26/07 : « ajoute
              le contour noir habituel des objets ombrés aux morceaux de la
              barre. Colore-le en bleu »). Il vit À L'INTÉRIEUR de l'élément
              masqué — donc tronçonné par les coupures et estompé dans les
              tirets de la queue, ce qui est le rendu voulu, « comme à la fin »
              — et APRÈS le cache dans le DOM : sans z-index, l'ordre de
              peinture suffit, et le contour reste visible aussi bien sur la
              part `line` que sur la part ocher.
              Pas de bord DROIT : la barre ne s'arrête pas, elle se dissout dans
              la queue. */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-navy" />
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-navy" />
          <div className="absolute inset-y-0 left-0 w-[2px] bg-navy" />
          {/* Deux montants par coupure, collés aux LÈVRES de la fente de 8px
              (donc à `X − 6px` et `X + 4px`, largeur 2px) : chaque morceau est
              cerné de ses quatre côtés, sauf à l'extrême droite de la barre. */}
          {cuts.flatMap((x) => [
            <div
              key={`${x}-g`}
              className="absolute inset-y-0 w-[2px] bg-navy"
              style={{ left: `calc(${x} - ${CUT_HALF_PX + EDGE_PX}px)` }}
            />,
            <div
              key={`${x}-d`}
              className="absolute inset-y-0 w-[2px] bg-navy"
              style={{ left: `calc(${x} + ${CUT_HALF_PX}px)` }}
            />,
          ])}
        </div>
        {/* Curseur « dernier cours » : calque JUMEAU du cache, posé après la
            barre (il en déborde par le haut — dans la barre, le masque et
            l'overflow-hidden le rogneraient). Même `--tx`, même animation :
            il voyage avec le front pendant la révélation, puis s'y plante.

            Géométrie (retour Youri 26/07, la bande de libellés qui contraignait
            la version basse a disparu) : triangle de 16×12 posé À MOITIÉ
            AU-DESSUS de la barre — `top-[-6px]`, 6px dehors / 6px dedans. Et
            `left-[-7px]` : l'apex tombe alors sur le CENTRE de la lame de 2px
            du front (le calque est calé sur le bord GAUCHE de la lame, l'apex
            est à 8px du bord de sa boîte — 8 − 7 = +1px, soit le milieu de la
            lame) ; à `-8px` il visait ce bord gauche.

            Triangle en bordures CSS (aplat R8, zéro radius). En light, les
            trois fonds qu'il traverse sont tous CLAIRS — ocher à gauche du
            front, cache `line` à droite, paper nu au-dessus de la barre et
            quand le front entre dans la queue en pointillés (> 105 k€) : un
            aplat ink SEUL y est la marque la plus dense, alors qu'un cœur
            paper l'ajourerait sur le `line`. En dark, l'ink ne tient plus
            au-dessus de la barre (fond ink) : le triangle passe en paper et
            REPREND un cœur ink, seule teinte qui tranche à la fois sur l'ocher
            et sur le `line` — cœur calé pour garder son apex 2px au-dessus de
            celui du triangle externe. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 ${sweepClass}`}
          style={sweepStyle}
        >
          <span
            className={`absolute left-[-7px] top-[-6px] h-0 w-0 border-l-8 border-r-8 border-t-[12px] border-l-transparent border-r-transparent ${
              dark ? "border-t-paper" : "border-t-ink"
            }`}
          />
          {dark && (
            <span className="absolute left-[-4px] top-[-4px] h-0 w-0 border-l-[5px] border-r-[5px] border-t-8 border-l-transparent border-r-transparent border-t-ink" />
          )}
        </div>
      </div>
    </div>
  );
}

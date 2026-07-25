"use client";

import type { CSSProperties } from "react";
import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";
import { useImpactFrame } from "@/components/impact-frame";

type Marker = { value: number; label: string; reached: boolean };

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
 * Masque de la barre : un aplat opaque jusqu'à `SOLID_PCT`, puis une queue de
 * quatre tirets qui raccourcissent ET s'effacent — la demi-droite « se termine
 * en douceur » sans jamais dégrader l'aplat lui-même (R8 : les tirets sont des
 * pleins, c'est leur suite qui s'éteint).
 *
 * Les arrêts de la queue sont en POURCENTAGES de sa propre boîte (posée par
 * `mask-size`) : le nombre de tirets reste le même de 320px à 1200px, seule
 * leur longueur suit. Deux couches de masque (union par défaut) plutôt qu'un
 * `mask-composite`, dont les mots-clés divergent encore entre Safari et le
 * reste.
 */
const DASH_TAIL =
  "linear-gradient(90deg,#000 0 22%,transparent 22% 34%,rgba(0,0,0,.68) 34% 52%,transparent 52% 64%,rgba(0,0,0,.4) 64% 78%,transparent 78% 88%,rgba(0,0,0,.18) 88% 96%,transparent 96%)";

const MASK = `linear-gradient(#000,#000) left top / ${SOLID_PCT}% 100% no-repeat, ${DASH_TAIL} right top / ${100 - SOLID_PCT}% 100% no-repeat`;

/** Le masque s'applique à l'élément ENTIER, box-shadow comprise : l'ombre dure
 *  est donc peinte par un calque jumeau décalé, jamais par `box-shadow` (elle
 *  serait rognée hors de la boîte, donc invisible). */
export const MASK_STYLE = { mask: MASK, WebkitMask: MASK } as const;

/**
 * Jauge de collecte : un aplat ocher porte la barre entière ; un cache couleur
 * `line` se retire vers la droite à l'entrée dans le viewport pour révéler la
 * part collectée. Ce cache est `line` dans LES DEUX tones (retour client
 * 26/07, revert de l'inversion de charge du 25/07 : un cache ink fusionnait
 * avec l'ombre dure du calque jumeau, la barre n'avait plus de contour).
 *
 * Deux marques suivent ce front, et une seule course les porte (`--tx`) :
 * le TRAIT DE COUPE soudé au bord gauche du cache — il vit DANS la barre,
 * donc masqué et clippé comme elle — et le CURSEUR triangulaire, qui doit au
 * contraire vivre dans un calque jumeau (le masque et l'`overflow-hidden` de
 * la barre le dévoreraient hors de la zone pleine). Les deux sont gardés
 * distincts plutôt que fusionnés : ils ne subissent pas le même rognage, et
 * empilés ils font UNE marque (lame + tête de plomb).
 *
 * Demi-droite (maquette 25/07) : la barre dépasse l'objectif de 20 %
 * (`OVERSHOOT`) — l'axe continue après le sommet, ce qui laisse centrer
 * l'abscisse du 100 000 € sur son trait (plus de chevauchement avec le
 * palier précédent) et donne où peindre un éventuel dépassement de collecte.
 * Passé ≈ 105 000 € (`DASH_FROM`) l'axe part en pointillés dégressifs.
 *
 * Coquille de rendu : toute l'arithmétique de campagne (valeur, max, paliers
 * atteints) est dérivée en amont par `lib/campaign` ; la jauge ne fait que
 * peindre des positions et jouer l'effet de révélation.
 *
 * `tone` recolore le texte, l'ombre et le curseur — la barre elle-même porte
 * des teintes FIXES (ocher, cache `line`, traits et trait de coupe), lisibles
 * sur les deux fonds : `"light"` (défaut, texte et ombre ink) pour une jauge
 * posée sur paper — c'est le cas du héros de `/souscription` depuis
 * l'inversion des fonds du 26/07 ; `"dark"` (texte et ombre paper) pour une
 * jauge posée sur ink.
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
      {/* Réserve du haut : les paliers de rang pair montent AU-DESSUS de la
          barre (voir plus bas) en position absolue — ils n'occupent aucune
          place, le padding la leur garde (un cran plus haut dès `sm`, où leur
          corps double). */}
      <div className="pt-16 sm:pt-20">
        {/* Boîte de la barre : hauteur DOUBLÉE (32px, retour Youri 26/07) —
            l'ombre dure s'y superpose au lieu de vivre en absolu dans le
            conteneur, la géométrie ne dépend plus de la réserve mobile. */}
        <div className="relative h-8">
          {/* Ombre dure (R8, recette des couvertures de carrousel) peinte par un
              calque jumeau masqué à l'identique : elle épouse donc les
              pointillés de la queue au lieu de s'arrêter net. */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 translate-x-2 translate-y-2 ${dark ? "bg-paper/30" : "bg-ink"}`}
            style={MASK_STYLE}
          />
          {/* Alternative programmatique (a11y) : la pile de <div> anonymes
              n'expose sinon ni la nature de jauge ni le taux de remplissage. */}
          <div
            role="img"
            aria-label={`${formatInt(value)} € collectés sur un objectif de ${formatInt(max)} €`}
            // Barre ORANGE d'un bout à l'autre (retour Youri 25/07, remplace les
            // quatre blocs navy/bottle/ocher/brick) : ocher est l'orange de la
            // charte (R3, accent d'attente) — lisible sur ink comme sur paper.
            className="relative h-full overflow-hidden bg-ocher"
            style={MASK_STYLE}
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
                  En ink dans les DEUX tones : le cache est `line` partout, et
                  ink est la seule teinte qui tranche à la fois sur lui et sur
                  l'ocher qu'il borde à gauche. */}
              <div className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
            </div>
            {markers.map((m) => (
              <div
                key={m.value}
                className="absolute inset-y-0 w-0.5 bg-paper"
                // Le sommet (value === max) tombe à ≈83,3 % : plus aucun trait
                // n'approche le bord clippé de la barre.
                style={{ left: `${(m.value / span) * 100}%` }}
              />
            ))}
          </div>
          {/* Curseur « dernier cours » : calque JUMEAU du cache, posé après la
              barre (il en déborde par le haut — dans la barre, le masque et
              l'overflow-hidden le rogneraient). Même `--tx`, même animation :
              il voyage avec le front pendant la révélation, puis s'y plante.
              Version basse : 12px de haut dans une barre de 32px, 2px au-dessus
              du bord supérieur au plus — les libellés de paliers impairs
              affleurent ce bord au pixel (calage 26/07), il n'y a pas d'autre
              budget.

              Triangle en bordures CSS (aplat R8, zéro radius). En light, les
              trois fonds qu'il traverse sont tous CLAIRS — ocher à gauche du
              front, cache `line` à droite, paper nu au-dessus de la barre et
              quand le front entre dans la queue en pointillés (> 105 k€) : un
              aplat ink SEUL y est la marque la plus dense, alors qu'un cœur
              paper l'ajourerait sur le `line` (revert du 26/07 : le bicolore
              n'était rendu nécessaire que par la masse ink). En dark, l'ink ne
              tient plus au-dessus de la barre (fond ink) : le triangle passe
              en paper et REPREND un cœur ink, seule teinte qui tranche à la
              fois sur l'ocher et sur le `line`. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 ${sweepClass}`}
            style={sweepStyle}
          >
            <span
              className={`absolute left-[-8px] top-[-2px] h-0 w-0 border-l-8 border-r-8 border-t-[12px] border-l-transparent border-r-transparent ${
                dark ? "border-t-paper" : "border-t-ink"
              }`}
            />
            {dark && (
              <span className="absolute left-[-5px] top-0 h-0 w-0 border-l-[5px] border-r-[5px] border-t-8 border-l-transparent border-r-transparent border-t-ink" />
            )}
          </div>
        </div>
        {/* Libellés des paliers : chacun centré sur son trait, et UN PALIER
            SUR DEUX AU-DESSUS de la barre — à toutes les largeurs (retour
            Youri 26/07, l'alternance n'était d'abord que mobile). C'est elle
            qui autorise le corps doublé : les abscisses étant en
            POURCENTAGES, l'écart entre deux traits se resserre avec la barre,
            et le plus étroit (80 k€ → 100 k€, 16,7 % de la barre) ne peut pas
            tenir deux montants à 36px. En alternant, ces deux-là ne se
            croisent plus jamais et la seule contrainte devient l'écart entre
            paliers de MÊME bande (50 k€ → 100 k€, 41,7 %) — deux fois et demie
            plus large que ce qu'il faut, même à `lg` tout juste franchi, où le
            rail des contreparties emporte 380px d'un coup et où la barre est
            au plus court.

            Les items restent dans l'ordre des paliers dans le DOM (un seul
            jeu de nœuds, pas de doublon caché) : l'ordre de lecture suit la
            campagne, pas la bande d'affichage.

            Aucune gouttière entre la barre et ses libellés (retour Youri
            26/07) : `mt-2` = les 8px de l'ombre portée, les libellés du bas
            posent donc sur l'ombre, et ceux du haut (`mb-10` = 8px d'ombre +
            32px de barre) affleurent le bord supérieur de la barre.

            Corps doublé à `sm` (18→36px pour le montant, 12→24px pour
            l'intitulé). Le mobile garde 20/14px : sous `sm` l'écart entre
            paliers de même bande ne vaut plus que 117px à 320px de large, et
            « 100 000+ € » insécable mesure déjà 167px à 36px de corps. */}
        <div
          className={`relative mt-2 h-16 leading-tight sm:h-20 ${
            dark ? "text-paper/80 sm:text-paper/70" : "text-ink-soft"
          }`}
        >
          {markers.map((m, i) => {
            const up = i % 2 === 1;
            return (
              <div
                key={m.value}
                className={`absolute w-28 -translate-x-1/2 text-center text-sm sm:w-auto sm:text-2xl ${
                  up ? "bottom-full mb-10" : "top-0"
                }`}
                style={{ left: `${(m.value / span) * 100}%` }}
              >
                {/* Paliers en négatif : seuls les montants ATTEINTS prennent
                    le plein (avec le ✓) ; les autres restent sur la teinte
                    atténuée du conteneur — ce qui est gagné pèse, ce qui reste
                    à prendre attend. Pas de teinte plus claire qu'ink-soft :
                    en dessous, le contraste tombe. L'intitulé, lui, est
                    atténué dans les deux états. */}
                <span
                  className={`block whitespace-nowrap text-xl font-semibold tabular-nums sm:text-4xl ${
                    m.reached ? (dark ? "text-paper" : "text-ink") : ""
                  }`}
                >
                  {formatInt(m.value)}
                  {/* Le sommet porte un « + » : la demi-droite en pointillés
                      dit que la collecte peut continuer au-delà. */}
                  {m.value === max && "+"}&nbsp;€
                  {m.reached && (
                    <>
                      <span aria-hidden="true"> ✓</span>
                      <span className="sr-only"> (palier atteint)</span>
                    </>
                  )}
                </span>
                <span className="block sm:whitespace-nowrap">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

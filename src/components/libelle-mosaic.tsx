import type { CSSProperties } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { LinkPendingHint } from "./link-pending-hint";
import { MosaicDisclosure } from "./mosaic-disclosure";
import { labelSpan, tierMetrics, tierRows, truncateWords } from "./libelle-mosaic-core";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition]. Une SEULE vue depuis l'arbitrage du
 * 2026-07-25 : « cases variables » (spéc. Youri 2026-07-24, remplace la 1re
 * version aux trous noirs). Le switch temporaire `LibelleViewSwitch` et la
 * vue « rectangles simples » qu'il opposait sont supprimés — comme la grande
 * mosaïque en grille avant eux, ils vivent dans l'historique git.
 *
 * ÉTAGES de cases, items triés par nombre de titres DÉCROISSANT (copie
 * locale — l'ordre des facettes reste alphabétique en amont). L'étage i
 * héberge i cases jusqu'à un PLAFOND de quatre (cf. `tierRows`), et la
 * largeur d'une case n'est pas une part égale : elle suit le span horizontal
 * de son propre libellé (cf. `labelSpan`). Les autres métriques décroissent
 * avec le rang, chacune sur sa loi (cf. `tierMetrics`). « Tous les livres »
 * reste une case fine à grand corps, et le compte vit en coin bas-droit.
 * Cellule active inversée noir/blanc (`invertingCell`).
 */

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/**
 * Case d'un étage — corps et compte hérités de l'étage via variables CSS. Le
 * compte de titres vit en COIN bas-droit et en ABSOLU : dans le flux du
 * libellé, il décalait le centrage d'une case à l'autre.
 *
 * `fixedHeight` : l'étage impose sa hauteur (tous sauf « Tous les livres »).
 * La case perd alors son padding vertical — `py-2` (16px) déborderait à lui
 * seul les étages profonds — et clippe ce qui dépasse.
 */
function TierCell({
  href,
  active,
  label,
  count,
  fixedHeight,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  fixedHeight: boolean;
}) {
  const short = truncateWords(label);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // `basis-0` + `flexGrow` = largeur au PRORATA du span (cf. `labelSpan`).
      style={{ flexGrow: labelSpan(short) }}
      className={`relative flex min-w-0 shrink basis-0 items-center justify-center overflow-hidden px-3 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${fixedHeight ? "" : "py-2"} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      {short !== label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden={short === label ? undefined : "true"}
        // `relative z-[1]` : au corps qu'il porte, le compte du coin mord sur
        // la fin du libellé — c'est le LIBELLÉ qui passe devant, le chiffre
        // reste le filigrane de sa case.
        className="relative z-[1] text-balance font-sans text-[length:var(--fs-sm)] font-black uppercase leading-[1.05] tracking-[.01em] [overflow-wrap:break-word] lg:text-[length:var(--fs)]"
      >
        {short}
      </span>
      {/* Nombre NU, sans parenthèses (retour Youri 25/07) : il n'annote plus
          un libellé au fil du texte, il vit seul dans son coin. Interligne
          serré — au corps qu'il porte désormais, `leading-none` laisserait un
          talon de descendante sous le chiffre — et marge d'angle en `em` :
          elle suit le chiffre, sinon les étages profonds la verraient enfler
          en proportion d'eux-mêmes. Décoratif (`aria-hidden`) : le compte
          accessible vit dans le `sr-only` juste après (#86) — la mosaïque
          étant l'UNIQUE vue des libellés, ce nombre ne doit pas rester muet
          pour les technologies d'assistance. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[.14em] right-[.18em] whitespace-nowrap font-sans text-[length:var(--fsc-sm)] font-bold leading-[.78] opacity-20 lg:text-[length:var(--fsc)]"
      >
        {count}
      </span>
      <span className="sr-only">
        , {count} titre{count > 1 ? "s" : ""}
      </span>
      {/* Témoin de navigation (vue de destination dynamique) — la case est
          déjà `relative`, le coin haut-droit reste libre (le compte vit en
          bas-droit). */}
      <LinkPendingHint />
    </Link>
  );
}

export function LibelleMosaic({
  items,
  activeLibelle,
  hrefFor,
  ariaLabel,
  className = "",
}: {
  items: LibelleMosaicItem[];
  /** Slug du libellé actif (`undefined` = « Tous les livres »). */
  activeLibelle?: string;
  /** Construit l'URL d'une cellule (`null` = retour à « Tous les livres »). */
  hrefFor: (slug: string | null) => string;
  ariaLabel: string;
  className?: string;
}) {
  const isActive = (item: LibelleMosaicItem) =>
    (item.slug ?? undefined) === activeLibelle;

  // Tri par taille de catalogue décroissant, égalités à l'alphabétique. La
  // COPIE est le contrat (`src/lib/CLAUDE.md`) : `getFacets` détient l'ordre
  // alphabétique, cette vue ne trie jamais le tableau de l'appelant en place.
  const byCount = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"),
  );
  const rows = tierRows(byCount);

  /** Variables CSS d'un étage — corps, compte, et l'épaisseur si imposée. */
  const tierStyle = (m: ReturnType<typeof tierMetrics>) =>
    ({
      "--fs": `${m.fontLg}px`,
      "--fs-sm": `${m.fontSm}px`,
      "--fsc": `${m.countLg}px`,
      "--fsc-sm": `${m.countSm}px`,
      ...(m.thickLg != null && {
        "--th": `${m.thickLg}px`,
        "--th-sm": `${m.thickSm}px`,
      }),
    }) as CSSProperties;

  const tierRow = (row: LibelleMosaicItem[], i: number) => {
    const m = tierMetrics(i + 1);
    return (
      <div
        key={i}
        className={`flex gap-[2px] ${m.thickLg == null ? "" : "h-[var(--th-sm)] lg:h-[var(--th)]"}`}
        style={tierStyle(m)}
      >
        {row.map((item) => (
          <TierCell
            key={item.slug ?? "all"}
            href={hrefFor(item.slug)}
            active={isActive(item)}
            label={item.name}
            count={item.count}
            fixedHeight={m.thickLg != null}
          />
        ))}
      </div>
    );
  };

  // Bannière = l'étage 1 quand il porte bien la case « Tous les livres »
  // (`slug: null`, épinglée par les deux appelants et toujours la plus grosse
  // au tri). Sinon — jeu de libellés sans elle —, la vue retombe sur tous les
  // étages à plat : jamais de bascule qui replierait un libellé ordinaire.
  const banner =
    rows[0]?.length === 1 && rows[0][0].slug === null ? rows[0][0] : null;

  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      className={`grid-cols-1 ${className}`}
    >
      {banner ? (
        // Les étages sont derrière la bascule de la bannière (îlot client,
        // `mosaic-disclosure`) : cette vue reste serveur, elle ne passe au
        // client que des noeuds déjà rendus et un objet de style.
        <MosaicDisclosure
          bannerStyle={tierStyle(tierMetrics(1))}
          bannerActive={isActive(banner)}
          banner={
            <TierCell
              href={hrefFor(banner.slug)}
              active={isActive(banner)}
              label={banner.name}
              count={banner.count}
              fixedHeight={false}
            />
          }
        >
          {rows.slice(1).map((row, i) => tierRow(row, i + 1))}
        </MosaicDisclosure>
      ) : (
        rows.map(tierRow)
      )}
    </FramedGrid>
  );
}

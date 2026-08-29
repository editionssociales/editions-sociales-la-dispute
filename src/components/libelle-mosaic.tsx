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
 * locale — l'ordre des facettes reste alphabétique en amont, et ne pilote
 * plus que cet ordre de LECTURE depuis le retour client du 29/08 : la
 * TAILLE des cases ne dépend plus du nombre de livres, cf. `tierMetrics`).
 * L'étage i héberge i cases jusqu'à un PLAFOND de quatre (cf. `tierRows`), et
 * la largeur d'une case n'est pas une part égale : elle suit le span
 * horizontal de son propre libellé (cf. `labelSpan`). Le corps d'un étage est
 * le plus grand qui laisse tenir CHAQUE libellé de l'étage (cf.
 * `tierMetrics`) ; plus de compte de titres affiché (retiré le 29/08, il ne
 * sert plus qu'au tri `byCount` ci-dessous) ni de hauteur imposée — la case
 * suit la hauteur de son propre contenu, la rangée celle de sa pire case.
 * Cellule active inversée noir/blanc (`invertingCell`).
 */

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/**
 * Case d'un étage — corps hérité de l'étage via variable CSS. Plus de compte
 * de titres affiché en coin (retiré le 29/08, retour client : « enlever le
 * compte de livres ») ; plus de hauteur imposée non plus, la case suit la
 * hauteur de son propre contenu (`tierMetrics` n'a plus de valeur `--th` à
 * publier, cf. `libelle-mosaic-core.ts`).
 */
function TierCell({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  const short = truncateWords(label);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // `basis-0` + `flexGrow` = largeur au PRORATA du span (cf. `labelSpan`).
      style={{ flexGrow: labelSpan(short) }}
      className={`relative flex min-w-0 shrink basis-0 items-center justify-center overflow-hidden px-3 py-2 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      {short !== label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden={short === label ? undefined : "true"}
        className="text-balance font-sans text-[length:var(--fs-sm)] font-black uppercase leading-[1.05] tracking-[.01em] [overflow-wrap:break-word] lg:text-[length:var(--fs)]"
      >
        {short}
      </span>
      {/* Témoin de navigation (vue de destination dynamique). */}
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

  /** Variables CSS d'un étage — le seul corps, désormais (plus de compte, plus
   *  d'épaisseur imposée). */
  const tierStyle = (m: ReturnType<typeof tierMetrics>) =>
    ({
      "--fs": `${m.fontLg}px`,
      "--fs-sm": `${m.fontSm}px`,
    }) as CSSProperties;

  const tierRow = (row: LibelleMosaicItem[], i: number) => {
    // Le corps est calé sur le CONTENU de la rangée (nombre de cases, largeur
    // du libellé le plus large), plus sur son rang — cf. `tierMetrics`.
    const m = tierMetrics(row.map((item) => item.name));
    return (
      <div key={i} className="flex gap-[2px]" style={tierStyle(m)}>
        {row.map((item) => (
          <TierCell
            key={item.slug ?? "all"}
            href={hrefFor(item.slug)}
            active={isActive(item)}
            label={item.name}
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
        // Les étages sont TOUJOURS visibles à `lg`+, et derrière la bascule
        // de la bannière sous `lg` (îlot client, `mosaic-disclosure`) : cette
        // vue reste serveur, elle ne passe au client que des noeuds déjà
        // rendus et un objet de style.
        <MosaicDisclosure
          bannerStyle={tierStyle(tierMetrics([banner.name]))}
          bannerActive={isActive(banner)}
          banner={
            <TierCell
              href={hrefFor(banner.slug)}
              active={isActive(banner)}
              label={banner.name}
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

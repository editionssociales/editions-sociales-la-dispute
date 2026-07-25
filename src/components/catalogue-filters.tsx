"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BOOK_SORTS, type BookFilters, type BookSort, type Facet } from "@/lib/types";
import { EDITION_LIST } from "@/lib/editions";
import { serializeBookFilters } from "@/lib/parse-filters";
import {
  activeChips,
  clearFilters,
  readFilters,
  withFilter,
  withoutFilter,
  type FilterField,
} from "@/lib/browse";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";
import { ACCENT_BG } from "@/lib/accents";
import { FilterChips } from "@/components/filter-chips";
import { FramedGrid } from "@/components/framed-grid";

interface Props {
  libelles: Facet[];
  authors: Facet[];
  /** Si défini, l'édition est verrouillée (pages /catalogue/[edition]). */
  lockedEdition?: string;
  /** Nombre total de titres, pour l'étiquette « Tous les livres ». */
  totalCount?: number;
  /**
   * Masque les étiquettes de libellé — la mosaïque de `/catalogue/[edition]`
   * couvre déjà ce rôle, une double navigation sur la même page serait un
   * doublon.
   */
  hideLibelles?: boolean;
}

const SORT_LABELS: Record<BookSort, string> = {
  recent: "Plus récents",
  ancien: "Plus anciens",
  titre: "Titre (A–Z)",
};
const SORTS = BOOK_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }));

/**
 * Grille brutaliste : le quadrillage noir vient du fond noir du conteneur
 * qui transparaît dans les gaps de 2px ; chaque cellule est posée en blanc
 * par-dessus (recette « grille encadrée », voir AGENTS.md).
 */
const CELL_TEXT = "text-[13px] font-bold uppercase tracking-[.03em] text-ink";

/**
 * Cellule de choix à LIBELLÉ FIXE (« Auteurs », « Tri ») : le `<select>`
 * natif est étiré en absolu par-dessus la puce, transparent. Sans ce
 * montage, la cellule prendrait la largeur intrinsèque de sa plus LONGUE
 * option (un nom d'auteur entier) et son texte changerait à chaque
 * sélection — les deux défauts que corrige le retour Youri 25/07. Hors flux,
 * le select ne dicte plus rien : la cellule se règle sur son seul libellé.
 *
 * Le `<select>` reste l'élément interactif (menu natif, clavier, nom
 * accessible par `aria-label`) ; la puce visible est décorative. L'anneau de
 * focus est la recette claire de R5 portée par le parent via
 * `has-[select:focus-visible]` — l'outline du select serait invisible sous
 * `opacity-0`, et `has-[…:focus-visible]` garde la sémantique clavier que
 * `focus-within` perdrait (il s'allumerait aussi au clic souris).
 */
function SelectCell({
  label,
  ariaLabel,
  value,
  onChange,
  children,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex cursor-pointer items-center bg-paper ${CELL_TEXT} has-[select:focus-visible]:outline has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-ink has-[select:focus-visible]:outline-offset-[-2px]`}
    >
      <span aria-hidden="true" className="whitespace-nowrap px-3.5 py-2.5">
        {label}
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {children}
      </select>
    </div>
  );
}

/** Étiquette cliquable (libellé) — cellule inversante à l'état actif. */
function Tag({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none ${CELL_TEXT} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      {children}
    </button>
  );
}

/**
 * Étiquette de maison — même patron que `Tag`, mais accentée (navy/brick,
 * R3) plutôt qu'ink : le filtre de maison est d'une autre nature que les
 * libellés (identité de collection, pas un thème), il mérite son propre
 * petit groupe distinct plutôt que d'être noyé en fin du rail de libellés.
 */
function HouseTag({
  active,
  accentBg,
  onClick,
  children,
}: {
  active: boolean;
  accentBg: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none ${CELL_TEXT} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${active ? `${accentBg} text-paper` : "bg-paper text-ink hover:bg-ink hover:text-paper"}`}
    >
      {children}
    </button>
  );
}

export function CatalogueFilters({
  libelles,
  authors,
  lockedEdition,
  totalCount,
  hideLibelles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters = readFilters(params);

  // Valeur locale du champ de recherche, pour pouvoir le vider depuis les
  // chips. Si l'URL change sans passer par le champ (chips, navigation,
  // retour arrière), on resynchronise — mais jamais pendant qu'une de nos
  // transitions est en vol (l'URL serait en retard sur la frappe) ni quand
  // l'URL ne fait que rattraper la dernière valeur poussée par le champ.
  const urlQuery = params.get("q") ?? "";
  const lastPushed = useRef(urlQuery);
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => {
    if (isPending || lastPushed.current === urlQuery) return;
    lastPushed.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery, isPending]);

  // Un seul encodeur, dans les deux sens : on lit l'URL en `BookFilters`
  // (`readFilters`), on applique l'algèbre, on ré-encode via `serializeBookFilters`.
  const pushFilters = useCallback(
    (next: BookFilters) => {
      const qs = serializeBookFilters(next).toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setFilter = (field: FilterField, value: string) => pushFilters(withFilter(filters, field, value));

  const removeFilter = (param: string) => {
    if (param === "q") setQuery("");
    pushFilters(withoutFilter(filters, param));
  };

  const clearAll = () => {
    setQuery("");
    pushFilters(clearFilters(filters));
  };

  const activeLibelle = filters.libelle ?? "";
  const activeEdition = filters.edition ?? "";
  const chips = activeChips(filters, { libelles, authors, lockedEdition });
  // Deux groupes distincts, chacun masquable indépendamment (typiquement
  // /catalogue/[edition], où hideLibelles ET lockedEdition sont posés — la
  // mosaïque de thèmes au-dessus couvre déjà le rôle des deux).
  const showHouseGroup = !lockedEdition;
  const showLibelleGroup = !hideLibelles;
  const hasTags = showHouseGroup || showLibelleGroup;

  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${
        isPending ? "opacity-70" : ""
      }`}
    >
      {showHouseGroup && (
        // Petit groupe distinct, AVANT la mosaïque de thèmes : le filtre de
        // maison est d'une autre nature que les libellés (identité de
        // collection), il ne doit pas se noyer en fin du rail de puces.
        // `w-fit` : reste un petit groupe compact, pas un rail plein largeur.
        <FramedGrid
          flow="flex"
          role="group"
          aria-label="Filtrer par maison"
          className="w-fit items-stretch"
        >
          {EDITION_LIST.map((e) => (
            <HouseTag
              key={e.slug}
              accentBg={ACCENT_BG[e.accent]}
              active={activeEdition === e.slug}
              onClick={() => setFilter("edition", activeEdition === e.slug ? "" : e.slug)}
            >
              {e.shortName}
            </HouseTag>
          ))}
        </FramedGrid>
      )}

      {showLibelleGroup && (
        // Rail horizontal sur mobile (pas de mur de puces qui repousse
        // recherche/tri hors écran) ; redevient une grille qui s'enroule à
        // partir de `sm`.
        <FramedGrid
          flow="flex"
          role="group"
          aria-label="Libellés du catalogue"
          className={`items-stretch overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden ${showHouseGroup ? "mt-[2px]" : ""}`}
        >
          <Tag active={activeLibelle === ""} onClick={() => setFilter("libelle", "")}>
            Tous les livres{totalCount != null ? ` (${totalCount})` : ""}
          </Tag>
          {libelles.map((l) => (
            <Tag
              key={l.slug}
              active={activeLibelle === l.slug}
              onClick={() => setFilter("libelle", l.slug)}
            >
              {l.name} ({l.count})
            </Tag>
          ))}
        </FramedGrid>
      )}

      {/* Recherche + auteurs + tri : toujours visibles, jamais dans le rail
          de puces ci-dessus (elles ne défilent jamais). Grille explicite
          `1fr auto auto` plutôt qu'un flex : les trois champs tiennent SUR
          UNE SEULE LIGNE par construction (jamais de retour à la ligne à
          négocier), les deux cellules de choix se règlent sur leur libellé
          fixe et la recherche absorbe tout l'espace restant. */}
      <FramedGrid
        role="group"
        aria-label="Recherche et tri du catalogue"
        className={`grid-cols-[1fr_auto_auto] items-stretch ${hasTags ? "mt-[2px]" : ""}`}
      >
        <label className="flex min-w-0 items-center bg-paper px-3.5">
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={query}
            placeholder="Titre, auteur…"
            onChange={(e) => {
              lastPushed.current = e.target.value;
              setQuery(e.target.value);
              setFilter("q", e.target.value);
            }}
            className={`w-full min-w-0 bg-transparent py-2.5 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-ink/40 ${CELL_TEXT} ${FOCUS_RING_LIGHT}`}
          />
        </label>

        <SelectCell
          label="Auteurs"
          ariaLabel="Auteur"
          value={filters.author ?? ""}
          onChange={(v) => setFilter("author", v)}
        >
          <option value="">Tous les auteurs</option>
          {authors.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name} ({a.count})
            </option>
          ))}
        </SelectCell>

        <SelectCell
          label="Tri"
          ariaLabel="Trier"
          value={filters.sort ?? "recent"}
          onChange={(v) => setFilter("sort", v)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectCell>
      </FramedGrid>

      <FilterChips chips={chips} onRemove={removeFilter} onClearAll={clearAll} />
    </div>
  );
}

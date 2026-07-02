"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Facet } from "@/lib/types";
import { EDITION_LIST } from "@/lib/editions";
import { FilterChips, type FilterChip } from "@/components/filter-chips";

interface Props {
  collections: Facet[];
  authors: Facet[];
  /** Si défini, l'édition est verrouillée (pages /catalogue/[edition]). */
  lockedEdition?: string;
  /** Nombre total de titres, pour l'étiquette « Tous les livres ». */
  totalCount?: number;
}

const SORTS = [
  { value: "recent", label: "Plus récents" },
  { value: "ancien", label: "Plus anciens" },
  { value: "titre", label: "Titre (A–Z)" },
];

/**
 * Grille brutaliste : le quadrillage noir vient du fond noir du conteneur
 * qui transparaît dans les gaps de 2px ; chaque cellule est posée en blanc
 * par-dessus (recette « grille encadrée », voir AGENTS.md).
 */
const FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]";
const CELL_TEXT = "text-[13px] font-bold uppercase tracking-[.03em] text-black";
const FIELD_CLASS = `bg-white px-3.5 py-2.5 outline-none ${CELL_TEXT} ${FOCUS_CLASS}`;
const SELECT_CLASS = `${FIELD_CLASS} cursor-pointer`;

/** Étiquette cliquable (thème, maison) — inversion noir/blanc à l'état actif. */
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
      className={`whitespace-nowrap px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none ${CELL_TEXT} ${FOCUS_CLASS} ${
        active ? "bg-black text-white" : "bg-white text-black hover:bg-black hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function CatalogueFilters({ collections, authors, lockedEdition, totalCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  const navigate = useCallback(
    (next: URLSearchParams) => {
      next.delete("page"); // toute modification de filtre revient à la page 1
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      navigate(next);
    },
    [params, navigate],
  );

  const removeFilter = useCallback(
    (key: string) => {
      if (key === "q") setQuery("");
      setParam(key, "");
    },
    [setParam],
  );

  const clearAll = useCallback(() => {
    setQuery("");
    const next = new URLSearchParams(params.toString());
    for (const key of ["q", "edition", "collection", "author", "upcoming"]) next.delete(key);
    navigate(next);
  }, [params, navigate]);

  const activeCollection = params.get("collection") ?? "";
  const activeEdition = params.get("edition") ?? "";

  // Chips des filtres actifs — libellés repris des facettes et des maisons.
  const chips: FilterChip[] = [];
  const q = params.get("q");
  if (q) {
    chips.push({ param: "q", type: "recherche", label: `« ${q} »` });
  }
  const edition = params.get("edition");
  if (edition && !lockedEdition) {
    const e = EDITION_LIST.find((x) => x.slug === edition);
    chips.push({ param: "edition", type: "maison", label: e?.name ?? edition });
  }
  const collection = params.get("collection");
  if (collection) {
    const c = collections.find((x) => x.slug === collection);
    chips.push({ param: "collection", type: "thème", label: c?.name ?? collection });
  }
  const author = params.get("author");
  if (author) {
    const a = authors.find((x) => x.slug === author);
    chips.push({ param: "author", type: "auteur", label: a?.name ?? author });
  }
  if (params.get("upcoming") === "1") {
    chips.push({ param: "upcoming", type: "statut", label: "À paraître" });
  }

  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div
        role="group"
        aria-label="Thèmes et filtres du catalogue"
        className="flex flex-wrap items-stretch gap-[2px] bg-black p-[2px]"
      >
        <Tag active={activeCollection === ""} onClick={() => setParam("collection", "")}>
          Tous les livres{totalCount != null ? ` (${totalCount})` : ""}
        </Tag>
        {collections.map((c) => (
          <Tag
            key={c.slug}
            active={activeCollection === c.slug}
            onClick={() => setParam("collection", c.slug)}
          >
            {c.name} ({c.count})
          </Tag>
        ))}

        {!lockedEdition &&
          EDITION_LIST.map((e) => (
            <Tag
              key={e.slug}
              active={activeEdition === e.slug}
              onClick={() => setParam("edition", activeEdition === e.slug ? "" : e.slug)}
            >
              {e.shortName}
            </Tag>
          ))}

        <label className="flex items-center bg-white px-3.5">
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={query}
            placeholder="Titre, auteur…"
            onChange={(e) => {
              lastPushed.current = e.target.value;
              setQuery(e.target.value);
              setParam("q", e.target.value);
            }}
            className={`w-full min-w-[190px] bg-transparent py-2.5 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-black/40 ${CELL_TEXT} ${FOCUS_CLASS}`}
          />
        </label>

        <select
          aria-label="Auteur"
          value={params.get("author") ?? ""}
          onChange={(e) => setParam("author", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Tous les auteurs</option>
          {authors.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name} ({a.count})
            </option>
          ))}
        </select>

        <select
          aria-label="Trier"
          value={params.get("sort") ?? "recent"}
          onChange={(e) => setParam("sort", e.target.value)}
          className={SELECT_CLASS}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <FilterChips chips={chips} onRemove={removeFilter} onClearAll={clearAll} />
    </div>
  );
}

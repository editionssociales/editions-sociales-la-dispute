"use client";

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
}

const SORTS = [
  { value: "recent", label: "Plus récents" },
  { value: "ancien", label: "Plus anciens" },
  { value: "titre", label: "Titre (A–Z)" },
];

/** Champs de filtres — carrés, sans rounded, posés directement sur le fond paper de la page. */
const FIELD_CLASS =
  "border border-line bg-paper-2 px-3.5 py-2.5 text-sm text-ink transition-shadow focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-[-1px] motion-reduce:transition-none";
const SELECT_CLASS = `${FIELD_CLASS} cursor-pointer`;

export function CatalogueFilters({ collections, authors, lockedEdition }: Props) {
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

  // Chips des filtres actifs — libellés repris des facettes et des maisons,
  // puce losange colorée par type de filtre.
  const chips: FilterChip[] = [];
  const q = params.get("q");
  if (q) {
    chips.push({ param: "q", type: "recherche", label: `« ${q} »`, accent: "ocher" });
  }
  const edition = params.get("edition");
  if (edition && !lockedEdition) {
    const e = EDITION_LIST.find((x) => x.slug === edition);
    chips.push({
      param: "edition",
      type: "maison",
      label: e?.name ?? edition,
      accent: "navy",
    });
  }
  const collection = params.get("collection");
  if (collection) {
    const c = collections.find((x) => x.slug === collection);
    chips.push({
      param: "collection",
      type: "collection",
      label: c?.name ?? collection,
      accent: "bottle",
    });
  }
  const author = params.get("author");
  if (author) {
    const a = authors.find((x) => x.slug === author);
    chips.push({
      param: "author",
      type: "auteur",
      label: a?.name ?? author,
      accent: "brick",
    });
  }
  if (params.get("upcoming") === "1") {
    chips.push({ param: "upcoming", type: "statut", label: "À paraître", accent: "ocher" });
  }

  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="mr-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-[.16em] text-muted">
          Affiner
        </span>

        <label className="block">
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
            className={`${FIELD_CLASS} w-full min-w-[230px] sm:w-[230px]`}
          />
        </label>

        {!lockedEdition && (
          <select
            aria-label="Maison d'édition"
            value={params.get("edition") ?? ""}
            onChange={(e) => setParam("edition", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Toutes les maisons</option>
            {EDITION_LIST.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Collection"
          value={params.get("collection") ?? ""}
          onChange={(e) => setParam("collection", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Toutes les collections</option>
          {collections.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>

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

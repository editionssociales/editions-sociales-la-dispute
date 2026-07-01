"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { Facet } from "@/lib/types";
import { EDITION_LIST } from "@/lib/editions";

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

export function CatalogueFilters({ collections, authors, lockedEdition }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  const selectClass =
    "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-es focus:outline-none";

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${isPending ? "opacity-70" : ""}`}
    >
      <label className="lg:col-span-1">
        <span className="sr-only">Rechercher</span>
        <input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Titre, auteur…"
          onChange={(e) => setParam("q", e.target.value)}
          className={selectClass}
        />
      </label>

      {!lockedEdition && (
        <select
          aria-label="Maison d'édition"
          value={params.get("edition") ?? ""}
          onChange={(e) => setParam("edition", e.target.value)}
          className={selectClass}
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
        className={selectClass}
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
        className={selectClass}
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
        className={selectClass}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { LinkPendingHint } from "@/components/link-pending-hint";
import { isEditionSlug } from "@/lib/editions";
import {
  prepareSuggestionIndex,
  querySuggestions,
  type PreparedSuggestionIndex,
  type SuggestedTerm,
  type SuggestedTitle,
  type SuggestionIndexData,
  type SuggestionKind,
} from "@/lib/search-suggest-core";
import type { HighlightRange } from "@/lib/search-text";
import { FILTER_CELL_TEXT, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Champ de recherche du catalogue AVEC complétion (titres/auteurs/libellés) —
 * la cellule extraite de `catalogue-filters.tsx`, qui garde l'état de la
 * requête (un brouillon, validé à l'Entrée) ; ici ne vivent que le rendu du
 * champ et la mécanique du dropdown.
 *
 * TROISIÈME grammaire de surgissement (cf. scope doc) : le combobox ARIA —
 * `role="combobox"` sur l'input, liste `role="listbox"` d'options qui sont de
 * VRAIS liens (`role="option"` sur `<Link>` : clic milieu/Cmd+clic et
 * `LinkPendingHint` conservés), le focus DOM ne quitte jamais l'input,
 * l'option active est portée par `aria-activedescendant`. Ni `aria-expanded`
 * de déroulé ni `role="tooltip"` — un combobox n'est aucun des deux.
 *
 * Fluidité (l'étalon : l'Autocomplete MUI) : l'index complet (~300 fiches,
 * `GET /api/catalogue/suggestions`) est chargé UNE fois au premier focus,
 * plié une fois (`prepareSuggestionIndex`), puis chaque frappe filtre en
 * mémoire — zéro réseau, zéro attente. Pendant la saisie, SEUL le dropdown
 * vit : la grille derrière n'est re-rendue qu'à la validation (Entrée,
 * suggestion suivie) — plus aucune poussée d'URL par frappe.
 *
 * Coût réseau maîtrisé (politique de l'audit Vercel 2026-08-23) : les liens
 * du dropdown naissent `prefetch={false}` — seule l'option ACTIVE (survolée
 * ou fléchée) repasse au préfetch par défaut (`null`), le patron « à
 * l'intention » de la doc `next/link` — un dropdown de N liens préfetcherait
 * N routes à chaque frappe.
 */

/* ------------------------------ index partagé ------------------------------ */

// Promesse partagée au niveau module : un seul chargement par session de
// page, quelles que soient les instances montées ; l'échec REJETTE et se
// désinscrit — le focus suivant retente au lieu de figer une complétion
// morte.
let suggestionIndexPromise: Promise<PreparedSuggestionIndex> | null = null;

function loadSuggestionIndex(): Promise<PreparedSuggestionIndex> {
  suggestionIndexPromise ??= fetch("/api/catalogue/suggestions")
    .then((res) => {
      if (!res.ok) throw new Error(`suggestions HTTP ${res.status}`);
      return res.json() as Promise<SuggestionIndexData>;
    })
    .then(prepareSuggestionIndex)
    .catch((err: unknown) => {
      suggestionIndexPromise = null;
      throw err;
    });
  return suggestionIndexPromise;
}

/* --------------------------------- options -------------------------------- */

interface TitleOption {
  id: string;
  kind: "title";
  href: string;
  suggestion: SuggestedTitle;
}

interface TermOption {
  id: string;
  kind: "author" | "libelle";
  href: string;
  suggestion: SuggestedTerm;
}

type SuggestionOption = TitleOption | TermOption;

interface SuggestionSection {
  key: string;
  label: string;
  options: SuggestionOption[];
}

/** Surligne les plages appariées (jetons de la frappe) dans un texte affiché tel quel. */
function Highlighted({ text, ranges }: { text: string; ranges: HighlightRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(<strong key={range.start}>{text.slice(range.start, range.end)}</strong>);
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/* -------------------------------- composant -------------------------------- */

interface Props {
  /** Géométrie de cellule dans la grille encadrée (col-span…) — la disposition reste l'affaire de l'appelant. */
  className?: string;
  value: string;
  /** La frappe — ne fait vivre que le brouillon de l'appelant (donc ce dropdown), jamais l'URL. */
  onValueChange: (next: string) => void;
  /** Entrée SANS option active : l'appelant valide le brouillon et pousse la recherche. */
  onCommit: () => void;
  /** Une suggestion vient d'être suivie — pour un filtre, l'appelant vide le champ (l'URL cible ne porte pas de `q`). */
  onPick: (kind: SuggestionKind) => void;
  hrefForAuthor: (slug: string) => string;
  hrefForLibelle: (slug: string) => string;
  /** Pages `/catalogue/[edition]` : suggestions restreintes au fonds verrouillé. */
  lockedEdition?: string;
}

export function CatalogueSearchBox({
  className = "",
  value,
  onValueChange,
  onCommit,
  onPick,
  hrefForAuthor,
  hrefForLibelle,
  lockedEdition,
}: Props) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLAnchorElement>());
  const disposedRef = useRef(false);
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  const [index, setIndex] = useState<PreparedSuggestionIndex | null>(null);
  const [openState, setOpenState] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const ensureIndex = useCallback(() => {
    loadSuggestionIndex().then(
      (prepared) => {
        if (!disposedRef.current) setIndex(prepared);
      },
      // Échec réseau : complétion silencieusement absente (la recherche par
      // la grille reste entière), nouvel essai au prochain focus.
      () => {},
    );
  }, []);

  const edition =
    lockedEdition !== undefined && isEditionSlug(lockedEdition) ? lockedEdition : undefined;

  const suggestions = useMemo(() => {
    if (index === null || value.trim() === "") return null;
    return querySuggestions(index, value, { edition });
  }, [index, value, edition]);

  const sections = useMemo<SuggestionSection[]>(() => {
    if (suggestions === null) return [];
    const built: SuggestionSection[] = [
      {
        key: "titles",
        label: "Titres",
        options: suggestions.titles.map((s) => ({
          id: `${baseId}-t-${s.slug}`,
          kind: "title" as const,
          href: s.href,
          suggestion: s,
        })),
      },
      {
        key: "authors",
        label: "Auteurs",
        options: suggestions.authors.map((s) => ({
          id: `${baseId}-a-${s.slug}`,
          kind: "author" as const,
          href: hrefForAuthor(s.slug),
          suggestion: s,
        })),
      },
      {
        key: "libelles",
        label: "Libellés",
        options: suggestions.libelles.map((s) => ({
          id: `${baseId}-l-${s.slug}`,
          kind: "libelle" as const,
          href: hrefForLibelle(s.slug),
          suggestion: s,
        })),
      },
    ];
    return built.filter((section) => section.options.length > 0);
  }, [suggestions, baseId, hrefForAuthor, hrefForLibelle]);

  const options = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  const open = openState && options.length > 0;

  // L'option active doit exister dans la liste courante — ajustement en rendu
  // (même idiome que la resynchro URL→champ de `catalogue-filters`), la
  // frappe suivante ne garde jamais un surlignage orphelin.
  if (activeId !== null && !options.some((o) => o.id === activeId)) setActiveId(null);

  useEffect(() => {
    if (activeId !== null) optionRefs.current.get(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const moveActive = (delta: 1 | -1) => {
    if (options.length === 0) return;
    setOpenState(true);
    const current = options.findIndex((o) => o.id === activeId);
    const next =
      current === -1
        ? delta === 1
          ? 0
          : options.length - 1
        : (current + delta + options.length) % options.length;
    setActiveId(options[next].id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length > 0) {
        e.preventDefault();
        moveActive(e.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }
    if (e.key === "Enter") {
      if (open && activeId !== null) {
        e.preventDefault();
        // Activer l'option = cliquer son LIEN : un seul chemin de navigation
        // (celui de `<Link>`), clavier et souris confondus.
        optionRefs.current.get(activeId)?.click();
      } else {
        onCommit();
        setOpenState(false);
      }
      return;
    }
    if (e.key === "Escape") {
      // Ne fermer QUE le dropdown : sans `preventDefault`, WebKit viderait
      // aussi le champ (`type="search"`). Dropdown déjà fermé : comportement
      // natif (vider), c'est le second Échap.
      if (open) {
        e.preventDefault();
        setOpenState(false);
        setActiveId(null);
      }
      return;
    }
    if (e.key === "Tab") setOpenState(false);
  };

  const registerOption = (id: string) => (el: HTMLAnchorElement | null) => {
    if (el) optionRefs.current.set(id, el);
    else optionRefs.current.delete(id);
  };

  return (
    <div
      className={`relative flex min-h-11 min-w-0 items-center bg-paper px-3.5 ${className}`}
      // L'ex-`<label>` donnait le focus au clic sur toute la cellule — le
      // dropdown ne peut plus vivre dans un label (le clic sur une option y
      // redéclencherait le contrôle associé), on rend le geste à la main.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Rechercher"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeId !== null ? activeId : undefined}
        autoComplete="off"
        value={value}
        placeholder="Titre, auteur, libellé…"
        onChange={(e) => {
          ensureIndex();
          setOpenState(true);
          setActiveId(null);
          onValueChange(e.target.value);
        }}
        onFocus={() => {
          ensureIndex();
          if (value.trim() !== "") setOpenState(true);
        }}
        onClick={() => {
          if (value.trim() !== "") setOpenState(true);
        }}
        onBlur={() => {
          setOpenState(false);
          setActiveId(null);
        }}
        onKeyDown={onKeyDown}
        className={`w-full min-w-0 bg-transparent py-2.5 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-ink/40 ${FILTER_CELL_TEXT} ${FOCUS_RING_LIGHT}`}
      />

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Suggestions de recherche"
          // `mousedown` neutralisé : le clic sur une option ne doit pas
          // blur l'input (le blur fermerait la liste AVANT le clic) — le
          // `click` du lien, lui, passe normalement.
          onMouseDown={(e) => e.preventDefault()}
          // Ancrée sous la cellule, débordant de 2px de chaque côté : ses
          // filets `border-2` se posent exactement sur le mortier de la
          // grille encadrée (`FramedGrid`, `p-[2px]`/`gap-[2px]`). z-30 :
          // au-dessus du contenu de page, sous le header sticky (z-50).
          className="absolute -inset-x-[2px] top-full z-30 max-h-[min(60vh,420px)] translate-y-0 overflow-y-auto overscroll-contain border-2 border-ink bg-paper opacity-100 transition-[opacity,transform] duration-150 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
        >
          {sections.map((section, sectionIndex) => (
            <Fragment key={section.key}>
              <div
                role="presentation"
                className={`px-3.5 pb-1 pt-2.5 font-sans text-[11px] font-bold uppercase tracking-[.06em] text-muted ${
                  sectionIndex === 0 ? "" : "border-t-2 border-ink"
                }`}
              >
                {section.label}
              </div>
              {section.options.map((option) => {
                const active = option.id === activeId;
                return (
                  <Link
                    key={option.id}
                    id={option.id}
                    ref={registerOption(option.id)}
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    href={option.href}
                    prefetch={active ? null : false}
                    onClick={() => onPick(option.kind)}
                    onPointerMove={() => setActiveId(option.id)}
                    // Corps 14px, PLUS GROS que les cellules de la barre
                    // (12px uniformisés, 9e passe) : la liste se lit, elle
                    // ne se scanne pas — dérogation explicite du retour
                    // 2026-08-30 (« augmente la police »), les en-têtes de
                    // groupe restant au petit corps.
                    className={`relative flex w-full items-baseline px-3.5 py-2 font-sans text-[14px] transition-colors motion-reduce:transition-none ${
                      active ? "bg-ink text-paper" : "text-ink"
                    }`}
                  >
                    {option.kind === "title" ? (
                      <span className="min-w-0 flex-1 truncate">
                        <Highlighted
                          text={option.suggestion.title}
                          ranges={option.suggestion.titleRanges}
                        />
                        {option.suggestion.authorsLabel !== "" && (
                          <span className={active ? "text-paper/70" : "text-muted"}>
                            {" — "}
                            <Highlighted
                              text={option.suggestion.authorsLabel}
                              ranges={option.suggestion.authorsRanges}
                            />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">
                        <Highlighted
                          text={option.suggestion.name}
                          ranges={option.suggestion.ranges}
                        />
                      </span>
                    )}
                    <LinkPendingHint />
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

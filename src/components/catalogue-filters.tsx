"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCatalogueTransition } from "@/components/catalogue-transition";
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
import { FOCUS_RING_DARK, FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import type { Accent } from "@/lib/format";
import { FilterChips } from "@/components/filter-chips";
import { FramedGrid } from "@/components/framed-grid";

interface Props {
  libelles: Facet[];
  authors: Facet[];
  /** Si défini, l'édition est verrouillée (pages /catalogue/[edition]). */
  lockedEdition?: string;
  /**
   * Historique : masquait les étiquettes de libellé face à la mosaïque de
   * thèmes. Depuis l'arbitrage client du 25/07 (`LibelleMosaic`, l'UNIQUE
   * rendu des libellés), les DEUX appelants la posent en permanence — le
   * rail de puces de libellés qu'elle désactivait est donc supprimé (#91),
   * et cette prop n'a plus d'effet. Conservée dans le type pour la
   * compatibilité des deux appelants qui la passent encore ; à retirer avec
   * eux le jour où ils cessent de la poser.
   */
  hideLibelles?: boolean;
  /**
   * L'index-manifeste (`libelle-mosaic.tsx`, sous-arbre SERVEUR passé en
   * prop — même montage que les children de `CatalogueTransitionZone`) :
   * rendu juste SOUS la barre de recherche (retour client 2026-08-30, 2e
   * passe), entre elle et les chips, pour profiter de l'estompage partagé
   * pendant une transition de filtre.
   */
  libellesSlot?: ReactNode;
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
 * Chevron de menu déroulant. Rendu en SVG et NON par un glyphe (▾) : Effra ne
 * couvre pas les formes géométriques, le caractère retombait sur la fonte
 * système — forme et centrage variables selon l'OS (même piège que la flèche
 * de lecture du placeholder vidéo de /souscription). Triangle plein à angles
 * vifs, zéro arrondi (R8).
 */
function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 10 6"
      className="h-[6px] w-[10px] shrink-0"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 0 L5 6 L10 0 Z" />
    </svg>
  );
}

/**
 * Cellule de choix à LIBELLÉ FIXE (« Auteur », « Tri ») : le `<select>`
 * natif est étiré en absolu par-dessus la puce, transparent. Sans ce
 * montage, la cellule prendrait la largeur intrinsèque de sa plus LONGUE
 * option (un nom d'auteur entier) et son texte changerait à chaque
 * sélection — les deux défauts que corrige le retour Youri 25/07. Hors flux,
 * le select ne dicte plus rien : la cellule se règle sur son seul libellé.
 *
 * Le chevron est REDESSINÉ ici : masquer le select masquait aussi la flèche
 * native, seule affordance qui distingue une cellule déroulante d'un simple
 * bouton (retour Youri 25/07).
 *
 * Le `<select>` reste l'élément interactif (menu natif, clavier, nom
 * accessible par `aria-label`) ; la puce visible est décorative. L'anneau de
 * focus est la recette claire de R5 portée par le parent via
 * `has-[select:focus-visible]` — l'outline du select serait invisible sous
 * `opacity-0`, et `has-[…:focus-visible]` garde la sémantique clavier que
 * `focus-within` perdrait (il s'allumerait aussi au clic souris).
 */
/**
 * `display` à VALEURS FERMÉES (même parade que `Button.display`, § Decisions
 * du scope doc : un `hidden` passé en className perdrait contre le `flex` de
 * la recette de base, Tailwind v4 ordonnant les utilitaires par valeur) —
 * `hiddenMobile` masque la cellule sous `sm` (5e passe 2026-08-30 : la liste
 * Auteur quitte l'écran téléphone, les chips continuent d'afficher un filtre
 * auteur déjà actif).
 */
const SELECT_CELL_DISPLAY = {
  flex: "flex",
  hiddenMobile: "hidden sm:flex",
} as const;

function SelectCell({
  label,
  ariaLabel,
  value,
  onChange,
  children,
  display = "flex",
  className = "",
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  display?: keyof typeof SELECT_CELL_DISPLAY;
  className?: string;
}) {
  return (
    <div
      // `min-w-0` : depuis l'empilement mobile, la cellule vit dans un track
      // compressible — sans lui, l'item grid refuse de descendre sous son
      // min-content et déborde de son track (même garde que le `<label>` de
      // recherche voisin).
      className={`relative ${SELECT_CELL_DISPLAY[display]} min-h-11 min-w-0 cursor-pointer items-center bg-paper ${CELL_TEXT} has-[select:focus-visible]:outline has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-ink has-[select:focus-visible]:outline-offset-[-2px] ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5"
      >
        {label}
        <ChevronGlyph />
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

/**
 * Recette de l'étiquette de maison ACTIVE, par accent (classes littérales,
 * contrat JIT) — plus un `ACCENT_BG[…]` + texte commun : depuis que
 * l'identité La Dispute est l'ORANGE (accent CLAIR, ex-brick — cf.
 * `lib/editions.ts`), texte et anneau dépendent de la nature de l'accent.
 * Accents sombres : texte paper + anneau sombre (R5). Orange : texte ink
 * (5,09:1 — paper y serait sous AA) + anneau clair (ink, 5,09:1, au-dessus
 * du seuil 3:1 de WCAG 1.4.11). Aucun survol ne change le fond d'une cellule
 * active, l'anneau de repos suffit dans les deux cas.
 */
const HOUSE_TAG_ACTIVE: Record<Accent, string> = {
  navy: `bg-navy text-paper ${FOCUS_RING_DARK}`,
  bottle: `bg-bottle text-paper ${FOCUS_RING_DARK}`,
  ocher: `bg-ocher text-paper ${FOCUS_RING_DARK}`,
  brick: `bg-brick text-paper ${FOCUS_RING_DARK}`,
  "pop-orange": `bg-pop-orange text-ink ${FOCUS_RING_LIGHT}`,
};

/**
 * Étiquette de maison — cellule inversante accentée plutôt qu'ink : le filtre
 * de maison est d'une autre nature que les libellés (identité de collection,
 * pas un thème), il mérite son propre petit groupe distinct.
 *
 * Active, la cellule reste sur son accent (`HOUSE_TAG_ACTIVE`). Inactive,
 * elle vire à l'ink au survol : anneau clair + surcharge sombre (R5), sinon
 * l'ink de l'anneau se pose sur l'ink du survol (1:1).
 */
function HouseTag({
  active,
  activeClass,
  onClick,
  dense = false,
  className = "",
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  /**
   * Recette compacte à VALEUR FERMÉE (jamais une surcharge par className,
   * piège d'ordre v4) : corps 11px et padding réduit pour la rangée mobile
   * partagée avec le Tri (5e passe 2026-08-30) — « Éditions sociales » +
   * « La Dispute » + « Tri » doivent tenir sur ~335px.
   */
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 whitespace-nowrap py-2.5 text-left transition-colors motion-reduce:transition-none ${
        dense
          ? "px-2 text-[11px] font-bold uppercase tracking-[.02em] text-ink"
          : `px-3.5 ${CELL_TEXT}`
      } ${
        active
          ? activeClass
          : `bg-paper text-ink hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function CatalogueFilters({
  libelles,
  authors,
  lockedEdition,
  libellesSlot,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Transition PARTAGÉE (`catalogue-transition.tsx`) et non plus un
  // `useTransition` local : le même `pending` estompe ce bandeau ET la zone
  // de résultats que la page enveloppe d'une `CatalogueTransitionZone` — le
  // retour de chargement vit là où le contenu change, pas seulement ici.
  const { pending: isPending, start: startTransition } = useCatalogueTransition();

  const filters = readFilters(params);

  // Valeur locale du champ de recherche, pour pouvoir le vider depuis les
  // chips et pour anti-rebondir la frappe (#86) avant de pousser l'URL.
  // Resynchronisée sur l'URL quand elle change sans passer par le champ
  // (chips, navigation, retour arrière) — par AJUSTEMENT EN RENDU (même
  // idiome que `site-header.tsx` : comparaison à un état pendant le rendu,
  // `setState` conditionnel dans le corps) plutôt que par un effet, qui
  // provoquerait un rendu en cascade. Jamais pendant qu'une de nos
  // transitions est en vol OU qu'un anti-rebond est en attente (l'URL serait
  // en retard sur la frappe), ni quand l'URL ne fait que rattraper la
  // dernière valeur poussée par le champ.
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [lastPushed, setLastPushed] = useState(urlQuery);
  const [debouncing, setDebouncing] = useState(false);
  if (!isPending && !debouncing && lastPushed !== urlQuery) {
    setLastPushed(urlQuery);
    setQuery(urlQuery);
  }

  // Anti-rebond de la recherche : un `router.replace` par frappe déclenchait
  // une navigation non annulée à chaque caractère (#86). Un seul minuteur en
  // vol à la fois — la frappe suivante l'annule et le redémarre.
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    },
    [],
  );

  // Un seul encodeur, dans les deux sens : on lit l'URL en `BookFilters`
  // (`readFilters`), on applique l'algèbre, on ré-encode via `serializeBookFilters`.
  const pushFilters = useCallback(
    (next: BookFilters) => {
      const qs = serializeBookFilters(next).toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    // `startTransition` vient du contexte (`useCatalogueTransition`), plus du
    // tuple stable de `useTransition` : il entre dans les deps.
    [pathname, router, startTransition],
  );

  const setFilter = (field: FilterField, value: string) => pushFilters(withFilter(filters, field, value));

  /** Annule un anti-rebond de recherche en attente et resynchronise le champ. */
  const resetSearchField = (value: string) => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
      searchTimeout.current = null;
    }
    setDebouncing(false);
    setQuery(value);
    setLastPushed(value);
  };

  const removeFilter = (param: string) => {
    if (param === "q") resetSearchField("");
    pushFilters(withoutFilter(filters, param));
  };

  const clearAll = () => {
    resetSearchField("");
    pushFilters(clearFilters(filters));
  };

  const activeEdition = filters.edition ?? "";
  const chips = activeChips(filters, { libelles, authors, lockedEdition });
  const showHouseGroup = !lockedEdition;

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
        // Compact d'office : le flux flex de `FramedGrid` est `w-fit`.
        // FORME DESKTOP seulement (5e passe 2026-08-30) : sous `sm`, les
        // maisons vivent dans la rangée du Tri, ci-dessous. Le masquage vit
        // sur un WRAPPER — un `hidden` passé à FramedGrid perdrait contre le
        // `flex` de sa base (piège d'ordre v4, § Decisions du scope doc).
        <div className="hidden sm:block">
          <FramedGrid
            flow="flex"
            role="group"
            aria-label="Filtrer par maison"
            className="items-stretch"
          >
            {EDITION_LIST.map((e) => (
              <HouseTag
                key={e.slug}
                activeClass={HOUSE_TAG_ACTIVE[e.accent]}
                active={activeEdition === e.slug}
                onClick={() => setFilter("edition", activeEdition === e.slug ? "" : e.slug)}
              >
                {e.shortName}
              </HouseTag>
            ))}
          </FramedGrid>
        </div>
      )}

      {/* Recherche + tri (+ auteurs à `sm`+) : toujours visibles, jamais
          dans le rail de puces (elles ne défilent jamais). À `sm`+, grille
          explicite `1fr auto auto` : recherche + Auteur + Tri sur UNE ligne
          par construction. En dessous de `sm` (5e passe 2026-08-30, une
          ligne de moins avant les livres) : la recherche prend sa rangée
          (`col-span-3`), puis maisons + Tri se partagent la seconde
          (`auto auto 1fr` — les maisons denses à leur min-content, le Tri
          absorbe le reste) et la liste Auteur disparaît — composé sur LE
          MÊME élément grille, jamais un wrapper intercalé qui casserait le
          mortier de 2px. */}
      <FramedGrid
        role="group"
        aria-label="Recherche et tri du catalogue"
        className={`grid-cols-[auto_auto_1fr] items-stretch sm:grid-cols-[1fr_auto_auto] ${showHouseGroup ? "sm:mt-[2px]" : ""}`}
      >
        <label className="col-span-3 flex min-h-11 min-w-0 items-center bg-paper px-3.5 sm:col-span-1">
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={query}
            placeholder="Titre, auteur…"
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setLastPushed(next);
              setDebouncing(true);
              if (searchTimeout.current) clearTimeout(searchTimeout.current);
              searchTimeout.current = setTimeout(() => {
                searchTimeout.current = null;
                setDebouncing(false);
                setFilter("q", next);
              }, 300);
            }}
            className={`w-full min-w-0 bg-transparent py-2.5 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-ink/40 ${CELL_TEXT} ${FOCUS_RING_LIGHT}`}
          />
        </label>

        {/* Les maisons rejoignent la rangée du Tri SOUS `sm` — rendues une
            SECONDE fois ici plutôt que déplacées : le groupe encadré du
            dessus reste la forme desktop, et une seule des deux instances
            existe à la fois dans l'arbre a11y (display:none sort l'autre). */}
        {showHouseGroup &&
          EDITION_LIST.map((e) => (
            <HouseTag
              key={e.slug}
              dense
              className="sm:hidden"
              activeClass={HOUSE_TAG_ACTIVE[e.accent]}
              active={activeEdition === e.slug}
              onClick={() => setFilter("edition", activeEdition === e.slug ? "" : e.slug)}
            >
              {e.shortName}
            </HouseTag>
          ))}

        <SelectCell
          label="Auteur"
          ariaLabel="Auteur"
          display="hiddenMobile"
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
          // Édition verrouillée (pas de maisons) : le Tri occupe seul sa
          // rangée mobile.
          className={showHouseGroup ? "" : "col-span-3 sm:col-span-1"}
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

      {libellesSlot && <div className="mt-4">{libellesSlot}</div>}

      <FilterChips chips={chips} onRemove={removeFilter} onClearAll={clearAll} />
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useCatalogueTransition } from "@/components/catalogue-transition";
import { BOOK_SORTS, type BookFilters, type BookSort, type Facet } from "@/lib/types";
import { EDITION_LIST } from "@/lib/editions";
import { serializeBookFilters } from "@/lib/parse-filters";
import {
  activeChips,
  catalogueHref,
  clearFilters,
  readFilters,
  withFilter,
  withoutFilter,
  type FilterField,
} from "@/lib/browse";
import type { SuggestionKind } from "@/lib/search-suggest-core";
import {
  FILTER_CELL_TEXT,
  FOCUS_RING_DARK,
  FOCUS_RING_HOVER_DARK,
  FOCUS_RING_LIGHT,
} from "@/lib/ui";
import type { Accent } from "@/lib/format";
import { CatalogueSearchBox } from "@/components/catalogue-search-box";
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
   * rendu SOUS la barre de recherche et sous les chips (retour client
   * 2026-08-30, 2e puis 7e passes), pour profiter de l'estompage partagé
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

// Grille brutaliste : le quadrillage noir vient du fond noir du conteneur qui
// transparaît dans les gaps de 2px ; chaque cellule est posée en blanc
// par-dessus (recette « grille encadrée », voir AGENTS.md). La typo des
// cellules est `FILTER_CELL_TEXT` (`src/lib/ui.ts`, 12px — 9e passe du
// 2026-08-30), partagée avec la cellule de recherche extraite
// (`catalogue-search-box.tsx`).

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
      className={`relative ${SELECT_CELL_DISPLAY[display]} min-h-11 min-w-0 cursor-pointer items-center bg-paper ${FILTER_CELL_TEXT} has-[select:focus-visible]:outline has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-ink has-[select:focus-visible]:outline-offset-[-2px] ${className}`}
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
   * piège d'ordre v4) : corps 12px (uniformisation 9e passe 2026-08-30) et
   * padding réduit pour la rangée mobile partagée avec le Tri (5e passe) —
   * « Éditions sociales » + « La Dispute » + « Trier par » doivent tenir
   * sur ~335px (vérifié : 335/335).
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
          ? "px-2 text-[12px] font-bold uppercase tracking-[.02em] text-ink"
          : `px-3.5 ${FILTER_CELL_TEXT}`
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

  // Valeur locale du champ de recherche : un BROUILLON, plus un miroir poussé
  // en direct. Depuis la complétion (`catalogue-search-box.tsx`), le retour
  // vivant de la frappe est le dropdown — la grille n'est re-rendue qu'à la
  // VALIDATION : Entrée (`commitSearch`), suggestion suivie, chips. La
  // poussée d'URL par frappe (anti-rebond de 300 ms) disparaît AVEC sa raison
  // d'être (#86 : un `router.replace` par caractère) : plus aucun rendu
  // serveur pendant la saisie.
  //
  // Resynchronisation par AJUSTEMENT EN RENDU (même idiome que
  // `site-header.tsx`), sur DÉTECTION DE CHANGEMENT de `?q=` — jamais une
  // simple différence : un brouillon non validé diffère de l'URL par
  // construction et doit survivre aux rendus. Quand l'URL change hors du
  // champ (chip, navigation, retour arrière), le champ ne l'adopte que s'il
  // était resté fidèle à la dernière URL vue — un brouillon plus récent
  // (frappe pendant la transition d'une validation) a toujours raison.
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [syncedUrlQuery, setSyncedUrlQuery] = useState(urlQuery);
  if (syncedUrlQuery !== urlQuery) {
    setSyncedUrlQuery(urlQuery);
    if (query === syncedUrlQuery) setQuery(urlQuery);
  }

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

  /** Vide (ou pose) le brouillon du champ — chips et suggestions de filtre. */
  const resetSearchField = (value: string) => {
    setQuery(value);
  };

  /** Entrée sans suggestion active : le brouillon est validé et poussé. */
  const commitSearch = () => setFilter("q", query);

  /**
   * Une suggestion vient d'être suivie (son `<Link>` navigue déjà). Pour un
   * filtre auteur/libellé, le champ se vide immédiatement : l'URL cible ne
   * porte pas de `q`, et attendre la resynchro laisserait le brouillon
   * affiché pendant la transition. Un titre suivi quitte la page — le
   * brouillon n'a pas à bouger.
   */
  const handleSuggestionPick = (kind: SuggestionKind) => {
    if (kind !== "title") resetSearchField("");
  };

  /**
   * Cible d'une suggestion auteur/libellé : le filtre remplace la recherche
   * (même algèbre que `pushFilters`, en `href` pour rester un vrai lien).
   */
  const suggestionFilterHref = (field: "author" | "libelle") => (slug: string) =>
    catalogueHref(withFilter(withoutFilter(filters, "q"), field, slug), pathname);

  const removeFilter = (param: string) => {
    if (param === "q") resetSearchField("");
    pushFilters(withoutFilter(filters, param));
  };

  const clearAll = () => {
    resetSearchField("");
    pushFilters(clearFilters(filters));
  };

  const activeEdition = filters.edition ?? "";
  // Filtres AUTO-REPRÉSENTÉS hors de la rangée de chips (retour client
  // 2026-08-30, 7e passe) : le libellé actif est déjà surligné dans
  // l'index-manifeste (un seul sélectionnable à la fois) et la maison sur sa
  // bascule accentée — leur chip doublonnait. Conséquence assumée : « Tout
  // effacer » n'apparaît plus que pour recherche/auteur/statut ; le retour
  // au catalogue complet passe par « Tous les livres » et les bascules.
  const chips = activeChips(filters, { libelles, authors, lockedEdition }).filter(
    (chip) => chip.param !== "libelle" && chip.param !== "edition",
  );
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
          (`1fr 1fr auto`, 8e passe — le Tri à la largeur de son CONTENU,
          les deux maisons se répartissent le reste ; `1fr` valant
          `minmax(auto,1fr)`, une maison ne descend jamais sous son
          min-content, la répartition s'ajuste) et la liste Auteur
          disparaît — composé sur LE MÊME élément grille, jamais un wrapper
          intercalé qui casserait le mortier de 2px. */}
      <FramedGrid
        role="group"
        aria-label="Recherche et tri du catalogue"
        className={`grid-cols-[1fr_1fr_auto] items-stretch sm:grid-cols-[1fr_auto_auto] ${showHouseGroup ? "sm:mt-[2px]" : ""}`}
      >
        {/* La cellule de recherche vit dans son propre fichier depuis la
            complétion (combobox + dropdown, `catalogue-search-box.tsx`) —
            l'état de la requête (brouillon validé à l'Entrée) reste ICI, la
            boîte ne reçoit que la valeur et les gestes. `min-w-0` : cellule
            d'un track compressible (même garde que les `SelectCell`
            voisines). */}
        <CatalogueSearchBox
          className="col-span-3 sm:col-span-1"
          value={query}
          lockedEdition={lockedEdition}
          onValueChange={setQuery}
          onCommit={commitSearch}
          onPick={handleSuggestionPick}
          hrefForAuthor={suggestionFilterHref("author")}
          hrefForLibelle={suggestionFilterHref("libelle")}
        />

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
          label="Trier par"
          ariaLabel="Trier par"
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

      {/* Chips AVANT la liste de mots-clés (7e passe 2026-08-30) : la barre
          des filtres actifs reste collée à la recherche qui les produit. */}
      <FilterChips chips={chips} onRemove={removeFilter} onClearAll={clearAll} />

      {libellesSlot && <div className="mt-4">{libellesSlot}</div>}
    </div>
  );
}

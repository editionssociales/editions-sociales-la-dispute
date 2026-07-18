/**
 * Modèle de navigation principal — les sections (et les deux maisons) comme
 * *données*, avec leur matcher d'état actif. Une seule source de vérité rendue
 * dans la grille mobile, la grille desktop et le pied de page ; le couplage
 * href ↔ prédicat d'activité cesse d'être recopié à la main.
 *
 * L'apparence (placement en grille, tables d'accent littérales pour le JIT)
 * reste dans les composants ; ce module ne porte que le contenu et la logique.
 */

export type NavSectionId = "catalogue" | "geme" | "a-paraitre" | "agenda";

/** Lecture minimale des query params (URLSearchParams ou objet get-only). */
export type NavSearch = { get(name: string): string | null };

export interface NavSection {
  id: NavSectionId;
  label: string;
  href: string;
  /**
   * Vrai si la section correspond à l'URL courante (hors accueil, cf.
   * `activeSections`). `search` sert aux facettes partagées sur `/catalogue`
   * (Geme, À paraître).
   */
  isActive(pathname: string, search?: NavSearch | null): boolean;
}

function param(search: NavSearch | null | undefined, name: string): string | null {
  return search?.get(name) ?? null;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "catalogue",
    label: "Catalogue",
    href: "/catalogue",
    isActive: (p, search) => {
      if (!p.startsWith("/catalogue")) return false;
      // Geme et À paraître ont leurs propres cellules.
      if (p.startsWith("/catalogue/editions-sociales") && param(search, "collection") === "geme") {
        return false;
      }
      if ((p === "/catalogue" || p === "/catalogue/") && param(search, "upcoming") === "1") {
        return false;
      }
      return true;
    },
  },
  {
    id: "geme",
    label: "La Geme",
    href: "/catalogue/editions-sociales?collection=geme",
    isActive: (p, search) =>
      p.startsWith("/catalogue/editions-sociales") && param(search, "collection") === "geme",
  },
  {
    id: "a-paraitre",
    label: "À paraître",
    href: "/catalogue?upcoming=1",
    isActive: (p, search) =>
      (p === "/catalogue" || p === "/catalogue/") && param(search, "upcoming") === "1",
  },
  {
    id: "agenda",
    label: "Agenda",
    href: "/rencontres",
    isActive: (p) => p.startsWith("/rencontres"),
  },
];

export interface NavHouse {
  label: string;
  href: string;
}

/** Les deux maisons de la navbar (cellules pleine largeur). */
export const NAV_HOUSES: NavHouse[] = [
  { label: "La Dispute", href: "/editions/la-dispute" },
  { label: "Les Éditions sociales", href: "/editions/editions-sociales" },
];

/**
 * Sections actives d'après pathname + query : sur l'accueil les 4 restent
 * allumées ; sur une page de section, seule la cellule correspondante.
 */
export function activeSections(
  pathname: string,
  search?: NavSearch | null,
): Record<NavSectionId, boolean> {
  if (pathname === "/") {
    return { catalogue: true, geme: true, "a-paraitre": true, agenda: true };
  }
  return {
    catalogue: NAV_SECTIONS[0].isActive(pathname, search),
    geme: NAV_SECTIONS[1].isActive(pathname, search),
    "a-paraitre": NAV_SECTIONS[2].isActive(pathname, search),
    agenda: NAV_SECTIONS[3].isActive(pathname, search),
  };
}

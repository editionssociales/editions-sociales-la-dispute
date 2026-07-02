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

export interface NavSection {
  id: NavSectionId;
  label: string;
  href: string;
  /** Vrai si la section correspond au chemin courant (hors accueil, cf. `activeSections`). */
  isActive(pathname: string): boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "catalogue",
    label: "Catalogue",
    href: "/catalogue",
    isActive: (p) =>
      p.startsWith("/catalogue") && !p.startsWith("/catalogue/editions-sociales"),
  },
  {
    id: "geme",
    label: "La Geme",
    href: "/catalogue/editions-sociales?collection=geme",
    isActive: (p) => p.startsWith("/catalogue/editions-sociales"),
  },
  {
    id: "a-paraitre",
    label: "À paraître",
    href: "/catalogue?upcoming=1",
    // À paraître partage /catalogue : on n'allume jamais cette cellule sur une section.
    isActive: () => false,
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
 * Sections actives d'après le pathname : sur l'accueil les 4 restent allumées ;
 * sur une page de section, seule la cellule correspondante (via son matcher).
 */
export function activeSections(pathname: string): Record<NavSectionId, boolean> {
  if (pathname === "/") {
    return { catalogue: true, geme: true, "a-paraitre": true, agenda: true };
  }
  return {
    catalogue: NAV_SECTIONS[0].isActive(pathname),
    geme: NAV_SECTIONS[1].isActive(pathname),
    "a-paraitre": NAV_SECTIONS[2].isActive(pathname),
    agenda: NAV_SECTIONS[3].isActive(pathname),
  };
}

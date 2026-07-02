import type { EditionSlug, SourceKey } from "./types";
import type { Accent } from "./format";

export interface EditionInfo {
  slug: EditionSlug;
  /** Source de données (base OVH) associée. */
  source: SourceKey;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  legacyUrl: string;
  /** Couleur d'identité de la maison dans la palette du site. */
  accent: Accent;
}

export const EDITIONS: Record<EditionSlug, EditionInfo> = {
  "editions-sociales": {
    slug: "editions-sociales",
    source: "es",
    name: "Les Éditions sociales",
    shortName: "Éditions sociales",
    tagline: "La pensée critique et le mouvement ouvrier depuis 1927.",
    description:
      "Fondées en 1927, Les Éditions sociales publient les grands textes du marxisme, de la philosophie et des sciences sociales, ainsi que la recherche critique contemporaine.",
    legacyUrl: "https://editionssociales.fr",
    accent: "navy",
  },
  "la-dispute": {
    slug: "la-dispute",
    source: "ld",
    name: "La Dispute",
    shortName: "La Dispute",
    tagline: "Sciences sociales, féminisme et critique.",
    description:
      "La Dispute publie des essais de sciences humaines et sociales, à la croisée de la recherche universitaire et des mouvements sociaux.",
    legacyUrl: "https://ladispute.fr",
    accent: "brick",
  },
};

export const EDITION_LIST: EditionInfo[] = Object.values(EDITIONS);

export function isEditionSlug(value: string): value is EditionSlug {
  return value === "editions-sociales" || value === "la-dispute";
}

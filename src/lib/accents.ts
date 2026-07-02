/**
 * Palette d'accents (couvertures Éditions sociales) sous forme de classes
 * Tailwind statiques — le JIT ne compile pas les classes construites
 * dynamiquement, d'où ces correspondances explicites.
 */
import type { Accent } from "./format";

export const ACCENTS: Accent[] = ["navy", "bottle", "ocher", "brick"];

export const ACCENT_BG: Record<Accent, string> = {
  navy: "bg-navy",
  bottle: "bg-bottle",
  ocher: "bg-ocher",
  brick: "bg-brick",
};

export const ACCENT_TEXT: Record<Accent, string> = {
  navy: "text-navy",
  bottle: "text-bottle",
  // Ocre assombri pour le texte : l'ocre vif échoue au contraste AA sur paper.
  ocher: "text-ocher-text",
  brick: "text-brick",
};

export const ACCENT_BORDER_T: Record<Accent, string> = {
  navy: "border-t-navy",
  bottle: "border-t-bottle",
  ocher: "border-t-ocher",
  brick: "border-t-brick",
};

export const ACCENT_BORDER_L: Record<Accent, string> = {
  navy: "border-l-navy",
  bottle: "border-l-bottle",
  ocher: "border-l-ocher",
  brick: "border-l-brick",
};

export const ACCENT_BORDER_B: Record<Accent, string> = {
  navy: "border-b-navy",
  bottle: "border-b-bottle",
  ocher: "border-b-ocher",
  brick: "border-b-brick",
};

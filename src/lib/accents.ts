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
  // Identité La Dispute (cf. `format.ts`) — accent CLAIR, contrairement aux
  // quatre de couverture : tout texte posé dessus est `ink`, jamais `paper`
  // (5,09:1 vs 3,38:1, cf. `pop-palette.ts`) — à traiter par l'appelant.
  "pop-orange": "bg-pop-orange",
};


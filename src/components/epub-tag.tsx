/**
 * Étiquette de format « ePub » — LE repère visuel d'un titre vendu uniquement
 * en numérique (client 2026-09-09, « Notes sur Mill » : « juste signifier que
 * c'est un ePub, visuellement, que personne ne se trompe »). Même recette que
 * les libraires en ligne (Decitre, Fnac, leslibraires.fr) : une pastille de
 * format collée au prix ou au titre, jamais une phrase d'explication.
 * Inversée (encre sur papier → papier sur encre) pour ne pas se confondre
 * avec les badges de statut d'achat (`book-card.tsx`), qui restent sobres.
 *
 * Primitive partagée SERVEUR (zéro `"use client"`), même famille que
 * `BookPrice`/`NewTabMark` — utilisée par la carte catalogue, la boîte
 * d'achat de la fiche (`buy-links.tsx`) et la ligne de panier
 * (`cart-view.tsx`). Deux tailles, classes LITTÉRALES (JIT Tailwind).
 */
export function EpubTag({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={
        size === "lg"
          ? "inline-flex flex-none items-center bg-ink px-2.5 py-1 font-sans text-sm font-black uppercase tracking-[.08em] text-paper"
          : "inline-flex flex-none items-center bg-ink px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.08em] text-paper"
      }
    >
      ePub
    </span>
  );
}

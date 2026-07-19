import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { ACCENT_BG } from "@/lib/accents";
import type { Accent } from "@/lib/format";

// Petite scène : trois livres droits, un quatrième qui a glissé.
const SPINES: { h: number; w: string; accent: Accent; fallen?: boolean }[] = [
  { h: 64, w: "w-4", accent: "navy" },
  { h: 80, w: "w-5", accent: "bottle" },
  { h: 56, w: "w-4", accent: "ocher" },
  { h: 68, w: "w-4", accent: "brick", fallen: true },
];

/**
 * Composition bespoke (R6/0.3) — exception nommée à l'échelle `<PageHero>` :
 * le « 404 » géant est le vrai titre visuel de cette page, aucun tone ne le
 * couvre. `error.tsx`/`catalogue/error.tsx` reprendront ce vocabulaire au
 * chantier « finitions » (5.3) ; pas cette page-ci.
 */
export default function NotFound() {
  return (
    <Container className="bg-paper py-24 text-center sm:py-32">
      {/* L'étagère où un livre est tombé */}
      <div className="mx-auto w-fit" aria-hidden="true">
        <div className="flex items-end gap-1.5">
          {SPINES.map((s, i) => (
            <div
              key={i}
              className={`${s.w} rounded-t-sm ${ACCENT_BG[s.accent]} animate-[spine-rise_0.7s_ease-out_both] ${
                s.fallen ? "ml-3 origin-bottom-left -rotate-12" : ""
              }`}
              style={{ height: s.h, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <div className="-mx-3 h-1.5 rounded bg-ink/25" />
      </div>

      {/* 404 géant, le zéro devenu losange */}
      <p
        className="mt-10 flex items-center justify-center gap-3 font-sans text-8xl font-black italic leading-none text-ink"
        aria-hidden="true"
      >
        <span>4</span>
        <span className="h-7 w-7 rotate-45 rounded-sm bg-brick" />
        <span>4</span>
      </p>

      <h1 className="mt-6 font-sans text-2xl font-black italic text-ink sm:text-3xl">
        <span className="sr-only">Erreur 404 — </span>Page introuvable
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink/70">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Elle a peut-être glissé derrière l&apos;étagère.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/catalogue" className="px-7 py-3.5 text-sm tracking-[.04em]">
          Retour au catalogue
        </Button>
        <Button
          href="/souscription"
          variant="outline"
          className="px-7 py-3.5 text-sm tracking-[.04em]"
        >
          Découvrir la souscription
        </Button>
      </div>
    </Container>
  );
}

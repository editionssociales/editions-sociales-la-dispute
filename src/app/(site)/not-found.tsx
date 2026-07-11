import Link from "next/link";
import { Container } from "@/components/container";
import { ACCENT_BG } from "@/lib/accents";
import type { Accent } from "@/lib/format";

// Petite scène : trois livres droits, un quatrième qui a glissé.
const SPINES: { h: number; w: string; accent: Accent; fallen?: boolean }[] = [
  { h: 64, w: "w-4", accent: "navy" },
  { h: 80, w: "w-5", accent: "bottle" },
  { h: 56, w: "w-4", accent: "ocher" },
  { h: 68, w: "w-4", accent: "brick", fallen: true },
];

export default function NotFound() {
  return (
    <Container className="py-24 text-center sm:py-32">
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
        <div className="-mx-3 h-1.5 rounded bg-ink/20" />
      </div>

      {/* 404 géant, le zéro devenu losange */}
      <p
        className="mt-10 flex items-center justify-center gap-3 font-serif text-8xl font-semibold leading-none text-ink"
        aria-hidden="true"
      >
        <span>4</span>
        <span className="h-7 w-7 rotate-45 rounded-sm bg-brick" />
        <span>4</span>
      </p>

      <h1 className="mt-6 font-serif text-2xl font-semibold sm:text-3xl">
        <span className="sr-only">Erreur 404 — </span>Page introuvable
      </h1>
      <p className="mx-auto mt-3 max-w-md text-ink-soft">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Elle a peut-être glissé derrière l&apos;étagère.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/catalogue"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transition-none"
        >
          Retour au catalogue
        </Link>
        <Link
          href="/souscription"
          className="inline-flex rounded-full px-6 py-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2 motion-reduce:transition-none"
        >
          Découvrir la souscription
        </Link>
      </div>
    </Container>
  );
}

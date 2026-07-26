"use client";

import "./(site)/globals.css";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { ACCENT_BG } from "@/lib/accents";
import type { Accent } from "@/lib/format";

/**
 * Filet de sécurité racine (issue #75) — `(site)/error.tsx` n'enveloppe QUE
 * son propre segment (doc Next installée, `file-conventions/error.md:96`) et
 * n'a délibérément aucun root layout parent (`src/app/CLAUDE.md`,
 * « Multi-root-layouts ») : une exception levée DANS `(site)/layout.tsx`
 * lui-même (ex. `getReglagesSite()` qui échoue) n'a donc AUCUNE frontière au
 * niveau du groupe de routes et tombe sur l'écran Next par défaut — non
 * marqué, en anglais. Seul `global-error.tsx`, à la racine littérale de
 * `app/` (hors des route groups, même contrainte que `robots.ts`/`sitemap.ts`),
 * peut intercepter une erreur DANS le root layout lui-même.
 *
 * Contraintes Next (doc installée) : Error boundary → composant CLIENT ;
 * remplace le root layout quand il s'active → rend ses PROPRES `<html>` et
 * `<body>` (aucun héritage possible du layout qui vient de planter) ; pas de
 * `metadata`/`generateMetadata` (Client Component). D'où l'import direct de
 * `globals.css` (thème + Tailwind) : sans lui, aucune classe utilitaire ne
 * serait stylée sur cet écran qui ne traverse plus `(site)/layout.tsx`.
 *
 * Composition reprise de `(site)/not-found.tsx` (même scène d'étagère, même
 * système visuel déjà validé) plutôt que du motif carré brick de
 * `(site)/error.tsx`/`catalogue/error.tsx` — consigne de l'issue : cet écran
 * doit rester reconnaissable même quand `(site)/layout.tsx`, source de ces
 * deux autres frontières, est lui-même hors service. Ni `SiteHeader` ni
 * `SiteFooter` (dépendent tous deux du layout en défaut) : `Container` et
 * `Button` seuls, comme la 404.
 */
const SPINES: { h: number; w: string; accent: Accent; fallen?: boolean }[] = [
  { h: 64, w: "w-4", accent: "navy" },
  { h: 80, w: "w-5", accent: "bottle" },
  { h: 56, w: "w-4", accent: "ocher" },
  { h: 68, w: "w-4", accent: "brick", fallen: true },
];

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <Container className="bg-paper py-24 text-center sm:py-32">
          {/* L'étagère où un livre est tombé — même scène que la 404. */}
          <div className="mx-auto w-fit" aria-hidden="true">
            <div className="flex items-end gap-1.5">
              {SPINES.map((s, i) => (
                <div
                  key={i}
                  className={`${s.w} ${ACCENT_BG[s.accent]} animate-[spine-rise_0.7s_ease-out_both] ${
                    s.fallen ? "ml-3 origin-bottom-left -rotate-12" : ""
                  }`}
                  style={{ height: s.h, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
            <div className="-mx-3 h-1.5 bg-ink/25" />
          </div>

          <h1 className="mt-10 font-sans text-2xl font-black italic text-ink sm:text-3xl">
            Une erreur est survenue
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink/70">
            Le site n&apos;a pas pu s&apos;afficher. Réessayez, ou revenez à
            l&apos;accueil.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => unstable_retry()}
              className="px-7 py-3.5 text-sm tracking-[.04em]"
            >
              Réessayer
            </Button>
            <Button href="/" variant="outline" className="px-7 py-3.5 text-sm tracking-[.04em]">
              Retour à l&apos;accueil
            </Button>
          </div>
        </Container>
      </body>
    </html>
  );
}

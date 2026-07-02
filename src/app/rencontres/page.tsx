import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { Reveal } from "@/components/reveal";
import { ColorStripe } from "@/components/color-stripe";
import type { Accent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
};

/* Classes accent en littéraux complets — le JIT ne compile pas les classes dynamiques. */
const GHOST_BG: Record<Accent, string> = {
  navy: "bg-navy",
  bottle: "bg-bottle",
  ocher: "bg-ocher",
  brick: "bg-brick",
};

/**
 * Silhouettes d'événements à venir : purement décoratives (aucune date
 * réelle), elles donnent la forme de l'agenda en attendant son contenu.
 */
const GHOSTS: { accent: Accent; lines: string[] }[] = [
  { accent: "navy", lines: ["w-full", "w-4/5", "w-3/5"] },
  { accent: "brick", lines: ["w-11/12", "w-full", "w-1/2"] },
  { accent: "bottle", lines: ["w-full", "w-2/3", "w-3/4"] },
];

export default function RencontresPage() {
  return (
    <>
      {/* Héro */}
      <section>
        <Container className="py-16 sm:py-24">
          <Reveal>
            <div className="max-w-3xl">
              <Kicker accent="ocher">Rencontres</Kicker>
              <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.1] sm:text-5xl">
                Faire vivre les livres, dans et hors les murs
              </h1>
              <p className="mt-6 text-lg text-ink-soft">
                Présentations d&apos;ouvrages, débats et rencontres avec nos
                autrices et auteurs : toutes les dates seront bientôt réunies
                ici.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* L'agenda arrive bientôt : état d'attente */}
      <section className="border-y border-line bg-paper-2">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Kicker accent="bottle">En préparation</Kicker>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
              L&apos;agenda arrive bientôt
            </h2>
            <p className="mt-4 max-w-2xl text-ink-soft">
              Cette page accueillera l&apos;agenda des rencontres. Les
              événements pourront être gérés depuis le back-office, au même
              endroit que le catalogue.
            </p>
          </Reveal>
          {/* Cartes fantômes : décor, en attendant les vraies dates */}
          <div className="mt-10 grid gap-6 md:grid-cols-3" aria-hidden="true">
            {GHOSTS.map((g, i) => (
              <Reveal key={i} delay={i * 120} className="h-full">
                <div className="flex h-full select-none flex-col rounded-xl border border-line bg-paper p-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${GHOST_BG[g.accent]}`}
                    >
                      <span className="font-serif text-2xl font-semibold text-paper">
                        ?
                      </span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 rounded-full bg-line" />
                      <div className="h-2.5 w-1/2 rounded-full bg-line" />
                    </div>
                  </div>
                  <div className="mt-6 space-y-2.5">
                    {g.lines.map((w, j) => (
                      <div key={j} className={`h-2.5 rounded-full bg-line ${w}`} />
                    ))}
                  </div>
                  <div className="mt-6 flex gap-2">
                    <div className="h-6 w-24 rounded-full bg-paper-2 ring-1 ring-inset ring-line" />
                    <div className="h-6 w-16 rounded-full bg-paper-2 ring-1 ring-inset ring-line" />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA : en attendant les premières dates */}
      <section className="bg-ink text-paper">
        <ColorStripe />
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold sm:text-3xl">
              En attendant les premières dates
            </h2>
            <p className="mt-2 text-paper/75">
              Parcourez le catalogue des deux maisons, ou soutenez la
              souscription de lancement.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/catalogue"
              className="rounded-full bg-paper px-7 py-3.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 hover:bg-paper/90 motion-reduce:transition-none"
            >
              Découvrir le catalogue
            </Link>
            <Link
              href="/souscription"
              className="rounded-full px-7 py-3.5 text-sm font-semibold text-paper ring-1 ring-inset ring-paper/40 transition-colors hover:bg-paper/10"
            >
              Soutenir la souscription
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}

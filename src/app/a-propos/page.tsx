import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { Reveal } from "@/components/reveal";
import { EDITION_LIST } from "@/lib/editions";
import type { Accent } from "@/lib/format";

export const metadata: Metadata = {
  title: "À propos",
  description: "La maison de la pensée critique et des sciences sociales.",
};

/* ------------------------------------------------------------------ */
/* Classes accent en littéraux complets — le JIT de Tailwind ne        */
/* compile pas les classes construites dynamiquement.                  */
/* ------------------------------------------------------------------ */

const MAISON_TEXT: Record<Accent, string> = {
  navy: "text-navy",
  bottle: "text-bottle",
  ocher: "text-ocher-text",
  brick: "text-brick",
};

const MAISON_BORDER_L: Record<Accent, string> = {
  navy: "border-l-navy",
  bottle: "border-l-bottle",
  ocher: "border-l-ocher",
  brick: "border-l-brick",
};

const MAISON_BG: Record<Accent, string> = {
  navy: "bg-navy",
  bottle: "bg-bottle",
  ocher: "bg-ocher",
  brick: "bg-brick",
};

// Repères du héro, repris de l'intro — décoratifs.
const REPERES: { label: string; accent: Accent }[] = [
  { label: "Deux fonds historiques", accent: "navy" },
  { label: "Une seule équipe d'éditrices", accent: "brick" },
  { label: "Un même engagement", accent: "bottle" },
];

export default function AProposPage() {
  return (
    <>
      {/* Héro : qui nous sommes */}
      <section>
        <Container className="py-16 sm:py-24">
          <Reveal>
            <div className="max-w-3xl">
              <Kicker accent="brick">Qui nous sommes</Kicker>
              <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.1] sm:text-5xl">
                La maison de la pensée critique et des sciences sociales
              </h1>
              <p className="mt-6 text-lg text-ink-soft">
                Une maison d&apos;édition de la pensée critique et des sciences
                sociales, portée par deux fonds historiques — sans rien perdre
                de ce qui fait leur singularité.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
                {REPERES.map((r) => (
                  <span key={r.label} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rotate-45 ${MAISON_BG[r.accent]}`}
                      aria-hidden="true"
                    />
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Les deux maisons, côte à côte */}
      <section className="border-y border-line bg-paper-2">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Kicker accent="navy">Deux maisons</Kicker>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
              Deux catalogues, une seule équipe d&apos;éditrices
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {EDITION_LIST.map((e, i) => (
              <Reveal key={e.slug} delay={i * 120} className="h-full">
                <article
                  className={`flex h-full flex-col rounded-xl border border-line border-l-4 bg-paper p-7 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5 motion-reduce:transition-none ${MAISON_BORDER_L[e.accent]}`}
                >
                  <h3
                    className={`font-serif text-2xl font-semibold ${MAISON_TEXT[e.accent]}`}
                  >
                    {e.name}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-muted">
                    {e.tagline}
                  </p>
                  <p className="mt-4 flex-1 leading-relaxed text-ink-soft">
                    {e.description}
                  </p>
                  <Link
                    href={`/editions/${e.slug}`}
                    className="mt-6 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink hover:underline"
                  >
                    Découvrir {e.shortName}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Citation en exergue */}
      <section className="border-b border-line">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <blockquote className="mx-auto max-w-3xl rounded-xl bg-bottle p-8 text-paper sm:p-12">
              <p className="font-serif text-2xl font-semibold leading-snug sm:text-3xl">
                « Renforcer la puissance de penser et d&apos;agir de celles et
                ceux qui veulent transformer le monde et changer la vie. »
              </p>
              <footer className="mt-5 text-sm text-paper/80">
                Campagne 2024, « Sauvez les Éditions sociales et La Dispute »
              </footer>
            </blockquote>
          </Reveal>
        </Container>
      </section>

      {/* Le catalogue, sur ce site */}
      <section className="bg-paper-2">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <div className="max-w-2xl">
              <Kicker accent="ocher">Sur ce site</Kicker>
              <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
                Le catalogue
              </h2>
              <p className="mt-4 text-ink-soft">
                Un catalogue filtrable par collection et par auteur, une
                librairie en ligne, et une page de souscription pour
                accompagner ce nouveau départ. Les deux fonds réunis, à
                parcourir dès maintenant.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/catalogue"
                  className="inline-flex rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 hover:bg-ink/90 motion-reduce:transition-none"
                >
                  Parcourir le catalogue
                </Link>
                <Link
                  href="/souscription"
                  className="inline-flex rounded-full px-7 py-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper motion-reduce:transition-none"
                >
                  Soutenir la souscription
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { ACCENT_TEXT, ACCENT_BORDER_L } from "@/lib/accents";
import { EDITION_LIST } from "@/lib/editions";
import { countBooks } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Nos collections",
  description: "Les fonds Éditions sociales et La Dispute, au sein d'une même maison.",
};

export const dynamic = "force-dynamic";

export default async function EditionsPage() {
  const counts = await Promise.all(
    EDITION_LIST.map((e) => countBooks(e.slug)),
  );

  return (
    <Container className="py-12 sm:py-16">
      <Reveal>
        <header className="max-w-2xl">
          <Kicker accent="bottle">Deux maisons, une équipe</Kicker>
          <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
            Nos collections
          </h1>
          <p className="mt-4 text-lg text-ink-soft">
            Deux fonds éditoriaux, chacun avec son identité, réunis dans le
            même catalogue.
          </p>
        </header>
      </Reveal>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {EDITION_LIST.map((e, i) => (
          <Reveal key={e.slug} delay={i * 120} className="h-full">
            <section
              className={`flex h-full flex-col rounded-xl border border-line border-l-4 bg-paper p-8 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5 ${ACCENT_BORDER_L[e.accent]}`}
            >
              <Kicker accent={e.accent}>{e.name}</Kicker>
              <h2 className="mt-3 font-serif text-2xl font-semibold sm:text-3xl">
                {e.tagline}
              </h2>
              <p className="mt-3 flex-1 text-ink-soft">{e.description}</p>
              <p className="mt-6 flex items-baseline gap-2">
                <CountUp
                  value={counts[i]}
                  className={`font-serif text-4xl font-semibold ${ACCENT_TEXT[e.accent]}`}
                />
                <span className="text-sm text-ink-soft">titres au catalogue</span>
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/editions/${e.slug}`}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5"
                >
                  Découvrir
                </Link>
                <Link
                  href={`/catalogue/${e.slug}`}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2"
                >
                  Le catalogue
                </Link>
              </div>
            </section>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

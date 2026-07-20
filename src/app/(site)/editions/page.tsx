import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { Button } from "@/components/button";
import { FramedGrid } from "@/components/framed-grid";
import { PageHero } from "@/components/page-hero";
import { ACCENT_BG } from "@/lib/accents";
import { EDITION_LIST } from "@/lib/editions";
import { countBooks } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Nos collections",
  description: "Les fonds Éditions sociales et La Dispute, au sein d'une même maison.",
  alternates: { canonical: "/editions" },
};

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

export default async function EditionsPage() {
  const counts = await Promise.all(
    EDITION_LIST.map((e) => countBooks(e.slug)),
  );

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <PageHero title="Nos collections" className="max-w-2xl">
        <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-ink/70">
          Deux fonds éditoriaux, chacun avec son identité, réunis dans le
          même catalogue.
        </p>
      </PageHero>

      <FramedGrid className="mt-8 sm:mt-10 sm:grid-cols-2">
        {EDITION_LIST.map((e, i) => (
          <Reveal key={e.slug} delay={i * 120} className="h-full">
            <section className="flex h-full flex-col bg-paper p-7 sm:p-8">
              <span
                aria-hidden="true"
                className={`block h-[6px] w-16 ${ACCENT_BG[e.accent]}`}
              />
              <h2 className="mt-5 font-sans text-3xl font-black italic uppercase leading-[0.98] text-ink sm:text-4xl">
                {e.name}
              </h2>
              <p className="mt-3 text-[15px] font-bold leading-snug text-ink/80">
                {e.tagline}
              </p>
              <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink/70">
                {e.description}
              </p>
              <p className="mt-6 flex items-baseline gap-2">
                <CountUp
                  value={counts[i]}
                  className="font-sans text-4xl font-black italic text-ink"
                />
                <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
                  titres au catalogue
                </span>
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button href={`/editions/${e.slug}`} className="px-5 py-3 text-[13px] tracking-[.04em]">
                  Découvrir
                </Button>
                <Button
                  href={`/catalogue/${e.slug}`}
                  variant="outline"
                  className="px-5 py-3 text-[13px] tracking-[.04em]"
                >
                  Le catalogue
                </Button>
              </div>
            </section>
          </Reveal>
        ))}
      </FramedGrid>
    </Container>
  );
}

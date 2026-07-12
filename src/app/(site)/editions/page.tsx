import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { Breadcrumb } from "@/components/breadcrumb";
import { FramedGrid } from "@/components/framed-grid";
import { ACCENT_BG } from "@/lib/accents";
import { EDITION_LIST } from "@/lib/editions";
import { countBooks } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Nos collections",
  description: "Les fonds Éditions sociales et La Dispute, au sein d'une même maison.",
  alternates: { canonical: "/editions" },
};

export const revalidate = 3600; // aligne la fraîcheur de la page sur le cache REST (WP_REVALIDATE)

export default async function EditionsPage() {
  const counts = await Promise.all(
    EDITION_LIST.map((e) => countBooks(e.slug)),
  );

  return (
    <Container className="bg-white py-12">
      <Breadcrumb
        trail={[{ label: "Accueil", href: "/" }, { label: "Nos collections" }]}
      />

      <Reveal>
        <div className="mt-3.5 max-w-2xl">
          <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
            Deux maisons, une équipe
          </p>
          <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.96] text-black sm:text-5xl">
            Nos collections
          </h1>
          <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-black/70">
            Deux fonds éditoriaux, chacun avec son identité, réunis dans le
            même catalogue.
          </p>
        </div>
      </Reveal>

      <FramedGrid className="mt-8 sm:mt-10 sm:grid-cols-2">
        {EDITION_LIST.map((e, i) => (
          <Reveal key={e.slug} delay={i * 120} className="h-full">
            <section className="flex h-full flex-col bg-white p-7 sm:p-8">
              <span
                aria-hidden="true"
                className={`block h-[6px] w-16 ${ACCENT_BG[e.accent]}`}
              />
              <h2 className="mt-5 font-sans text-3xl font-black italic uppercase leading-[0.96] text-black sm:text-4xl">
                {e.name}
              </h2>
              <p className="mt-3 text-[15px] font-bold leading-snug text-black/80">
                {e.tagline}
              </p>
              <p className="mt-4 flex-1 text-[15px] leading-relaxed text-black/70">
                {e.description}
              </p>
              <p className="mt-6 flex items-baseline gap-2">
                <CountUp
                  value={counts[i]}
                  className="font-sans text-4xl font-black italic text-black"
                />
                <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-black/50">
                  titres au catalogue
                </span>
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={`/editions/${e.slug}`}
                  className="border-2 border-black bg-black px-5 py-3 font-sans text-[13px] font-bold uppercase tracking-[.04em] text-white transition-colors motion-reduce:transition-none hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
                >
                  Découvrir
                </Link>
                <Link
                  href={`/catalogue/${e.slug}`}
                  className="border-2 border-black bg-white px-5 py-3 font-sans text-[13px] font-bold uppercase tracking-[.04em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
                >
                  Le catalogue
                </Link>
              </div>
            </section>
          </Reveal>
        ))}
      </FramedGrid>
    </Container>
  );
}

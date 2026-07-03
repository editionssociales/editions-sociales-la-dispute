import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { EDITION_LIST } from "@/lib/editions";
import { ACCENT_BORDER_T } from "@/lib/accents";
import { Breadcrumb } from "@/components/breadcrumb";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";

export const metadata: Metadata = {
  title: "À propos",
  description: "La maison de la pensée critique et des sciences sociales.",
};

const FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pop-yellow";

// Repères du héro, repris de l'intro — décoratifs, sans code couleur (réservé
// aux 4 sections de la navbar).
const REPERES = [
  "Deux fonds historiques",
  "Une seule équipe d'éditrices",
  "Un même engagement",
];

export default function AProposPage() {
  return (
    <>
      {/* Héro : qui nous sommes */}
      <Container className="bg-white pb-16 pt-10 sm:pb-24 sm:pt-14">
        <Breadcrumb
          trail={[{ label: "Accueil", href: "/" }, { label: "À propos" }]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
              Qui nous sommes
            </p>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
              La maison de la pensée critique et des sciences sociales
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-black/70">
              Une maison d&apos;édition de la pensée critique et des sciences
              sociales, portée par deux fonds historiques — sans rien perdre
              de ce qui fait leur singularité.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {REPERES.map((r) => (
                <span
                  key={r}
                  className="border-2 border-black px-3 py-1.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-black"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Container>

      {/* Les deux maisons, côte à côte */}
      <section className="border-t-2 border-black">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
              Deux maisons
            </p>
            <h2 className="mt-2 font-sans text-3xl font-black italic leading-[0.98] text-black sm:text-4xl">
              Deux catalogues, une seule équipe d&apos;éditrices
            </h2>
          </Reveal>
          <FramedGrid className="mt-8 md:grid-cols-2">
            {EDITION_LIST.map((e, i) => (
              <Reveal key={e.slug} delay={i * 120} className="h-full">
                <article
                  className={`flex h-full flex-col border-t-4 bg-white p-7 ${ACCENT_BORDER_T[e.accent]}`}
                >
                  <h3 className="font-sans text-2xl font-black italic text-black">
                    {e.name}
                  </h3>
                  <p className="mt-1 font-sans text-xs font-bold uppercase tracking-[.05em] text-black/60">
                    {e.tagline}
                  </p>
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-black/70">
                    {e.description}
                  </p>
                  <Link
                    href={`/editions/${e.slug}`}
                    className={`mt-6 inline-flex w-fit items-center gap-1.5 border-b-2 border-black font-sans text-xs font-bold uppercase tracking-[.05em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white ${FOCUS_CLASS}`}
                  >
                    Découvrir {e.shortName}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* Citation en exergue */}
      <section className="border-t-2 border-black">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <blockquote className="mx-auto max-w-3xl border-2 border-black bg-black p-8 text-white sm:p-12">
              <p className="font-sans text-2xl font-black italic leading-snug sm:text-3xl">
                « Renforcer la puissance de penser et d&apos;agir de celles et
                ceux qui veulent transformer le monde et changer la vie. »
              </p>
              <footer className="mt-5 font-sans text-xs font-bold uppercase tracking-[.05em] text-white/70">
                Campagne 2024, « Sauvez les Éditions sociales et La Dispute »
              </footer>
            </blockquote>
          </Reveal>
        </Container>
      </section>

      {/* Le catalogue, sur ce site */}
      <section className="border-t-2 border-black">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <div className="max-w-2xl">
              <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
                Sur ce site
              </p>
              <h2 className="mt-2 font-sans text-3xl font-black italic leading-[0.98] text-black sm:text-4xl">
                Le catalogue
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-black/70">
                Un catalogue filtrable par collection et par auteur, une
                librairie en ligne, et une page de souscription pour
                accompagner ce nouveau départ. Les deux fonds réunis, à
                parcourir dès maintenant.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  href="/catalogue"
                  className="px-7 py-3.5 text-sm tracking-[.04em]"
                >
                  Parcourir le catalogue
                </Button>
                <Button
                  href="/souscription"
                  variant="outline"
                  className="px-7 py-3.5 text-sm tracking-[.04em]"
                >
                  Soutenir la souscription
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}

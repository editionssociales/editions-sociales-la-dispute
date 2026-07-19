import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { ACCENT_BORDER_T } from "@/lib/accents";
import { Breadcrumb } from "@/components/breadcrumb";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { Eyebrow } from "@/components/eyebrow";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { getPageAPropos } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "À propos",
  description: "La maison de la pensée critique et des sciences sociales.",
  alternates: { canonical: "/a-propos" },
};

// Repères du héro, repris de l'intro — décoratifs, sans code couleur (réservé
// aux 4 sections de la navbar).
const REPERES = [
  "Deux fonds historiques",
  "Une seule équipe d'éditrices",
  "Un même engagement",
];

export default async function AProposPage() {
  // Global `page-a-propos` (spec « éditeur de contenus ») : textes du héros,
  // citation, surcharge des deux maisons et sections libres. Global vide =
  // les textes en dur d'`EDITION_LIST` et de `site-content-core.ts`,
  // strictement iso au rendu d'avant le chantier.
  const content = await getPageAPropos();
  return (
    <>
      {/* Héro : qui nous sommes */}
      <Container className="bg-paper pb-16 pt-10 sm:pb-24 sm:pt-14">
        <Breadcrumb
          trail={[{ label: "Accueil", href: "/" }, { label: "À propos" }]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <Eyebrow>
              Qui nous sommes
            </Eyebrow>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
              {content.herosTitre}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink/70">
              {content.herosIntro}
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {REPERES.map((r) => (
                <span
                  key={r}
                  className="border-2 border-ink px-3 py-1.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Container>

      {/* Les deux maisons, côte à côte */}
      <section className="border-t-2 border-ink">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Eyebrow>
              Deux maisons
            </Eyebrow>
            <h2 className="mt-2 font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
              Deux catalogues, une seule équipe d&apos;éditrices
            </h2>
          </Reveal>
          <FramedGrid className="mt-8 md:grid-cols-2">
            {content.maisons.map((m, i) => (
              <Reveal key={m.slug} delay={i * 120} className="h-full">
                <article
                  className={`flex h-full flex-col border-t-4 bg-paper p-7 ${ACCENT_BORDER_T[m.accent]}`}
                >
                  <h3 className="font-sans text-2xl font-black italic text-ink">
                    {m.name}
                  </h3>
                  <p className="mt-1 font-sans text-xs font-bold uppercase tracking-[.05em] text-ink/60">
                    {m.tagline}
                  </p>
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink/70">
                    {m.description}
                  </p>
                  <Link
                    href={`/editions/${m.slug}`}
                    className={`mt-6 inline-flex w-fit items-center gap-1.5 border-b-2 border-ink font-sans text-xs font-bold uppercase tracking-[.05em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
                  >
                    Découvrir {m.shortName}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* Citation en exergue */}
      <section className="border-t-2 border-ink">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <blockquote className="mx-auto max-w-3xl border-2 border-ink bg-ink p-8 text-paper sm:p-12">
              <p className="font-sans text-2xl font-black italic leading-snug sm:text-3xl">
                {content.citation}
              </p>
              <footer className="mt-5 font-sans text-xs font-bold uppercase tracking-[.05em] text-paper/70">
                {content.citationAttribution}
              </footer>
            </blockquote>
          </Reveal>
        </Container>
      </section>

      {/* Sections éditées dans /admin, sinon la section « Le catalogue » en dur */}
      {content.sections ? (
        content.sections.map((s, i) => (
          <section key={`${i}-${s.titre}`} className="border-t-2 border-ink">
            <Container className="py-16 sm:py-20">
              <Reveal>
                <div className="max-w-2xl">
                  <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
                    {s.titre}
                  </h2>
                  {s.html && (
                    <div
                      className="prose-book mt-4 max-w-none"
                      dangerouslySetInnerHTML={{ __html: s.html }}
                    />
                  )}
                </div>
              </Reveal>
            </Container>
          </section>
        ))
      ) : (
        <section className="border-t-2 border-ink">
          <Container className="py-16 sm:py-20">
            <Reveal>
              <div className="max-w-2xl">
                <Eyebrow>
                  Sur ce site
                </Eyebrow>
                <h2 className="mt-2 font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
                  Le catalogue
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-ink/70">
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
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { FOCUS_RING_DARK_OUTER, FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
  alternates: { canonical: "/rencontres" },
};

/**
 * Silhouettes d'événements à venir : purement décoratives (aucune date
 * réelle), elles donnent la forme de l'agenda en attendant son contenu — la
 * structure reprend la maquette agenda : en-tête (date sur fond noir +
 * lieu), puis vignette de couverture + description.
 */
const GHOSTS = [1, 2, 3];

export default function RencontresPage() {
  return (
    <>
      {/* Héro */}
      <Container className="bg-paper pb-16 pt-10 sm:pb-24 sm:pt-14">
        <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Rencontres" }]} />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <span className="inline-flex border-2 border-ink bg-pop-yellow px-3 py-1 font-sans text-xs font-extrabold uppercase tracking-[.08em] text-black">
              Agenda
            </span>
            <h1 className="mt-4 font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
              Faire vivre les livres, dans et hors les murs
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink/70">
              Présentations d&apos;ouvrages, débats et rencontres avec nos
              autrices et auteurs : toutes les dates seront bientôt réunies
              ici.
            </p>
          </div>
        </Reveal>
      </Container>

      {/* L'agenda arrive bientôt : état d'attente */}
      <section className="border-y-2 border-ink bg-paper">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Eyebrow>
              En préparation
            </Eyebrow>
            <h2 className="mt-2 font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
              L&apos;agenda arrive bientôt
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink/70">
              Cette page accueillera l&apos;agenda des rencontres. Les
              événements pourront être gérés depuis le back-office, au même
              endroit que le catalogue.
            </p>
          </Reveal>

          {/* Cartes fantômes : décor, en attendant les vraies dates */}
          <FramedGrid className="mt-10 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {GHOSTS.map((g, i) => (
              <Reveal key={g} delay={i * 120} className="h-full">
                <article className="flex h-full select-none flex-col bg-paper">
                  {/* En-tête : date sur fond noir + lieu */}
                  <div className="flex items-stretch border-b-2 border-ink">
                    <div className="flex items-center bg-ink px-4 py-3">
                      <span className="font-sans text-xs font-extrabold uppercase tracking-[.05em] text-pop-yellow">
                        Date à venir
                      </span>
                    </div>
                    <div className="flex flex-1 items-center border-l-2 border-ink px-4 py-3">
                      <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-ink/60">
                        Lieu à préciser
                      </span>
                    </div>
                  </div>
                  {/* Vignette de couverture + description */}
                  <div className="flex flex-1 gap-4 p-5">
                    <div className="h-24 w-16 shrink-0 border-2 border-ink bg-paper-2" />
                    <div className="flex-1 space-y-2.5 pt-1">
                      <div className="h-3 w-3/4 bg-ink/10" />
                      <div className="h-2.5 w-1/2 bg-ink/10" />
                      <div className="mt-3 h-2.5 w-full bg-ink/10" />
                      <div className="h-2.5 w-2/3 bg-ink/10" />
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* CTA : en attendant les premières dates */}
      <section className="bg-ink text-paper">
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-sans text-2xl font-black italic sm:text-3xl">
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
              className={`border-2 border-paper bg-paper px-7 py-3.5 font-sans text-sm font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
            >
              Découvrir le catalogue
            </Link>
            <Link
              href="/souscription"
              className={`border-2 border-paper px-7 py-3.5 font-sans text-sm font-bold uppercase tracking-[.04em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK_OUTER}`}
            >
              Soutenir la souscription
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}

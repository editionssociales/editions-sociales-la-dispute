import type { Metadata } from "next";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/button";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
  alternates: { canonical: "/rencontres" },
};

/**
 * Emplacements d'événements à venir : purement décoratifs (aucune date
 * réelle). État honnête plutôt que skeleton (5.4/R8, bordures pointillées
 * assumées) — pas de barres grises qui imiteraient un chargement en cours,
 * juste la forme de l'agenda (en-tête date/lieu) et le mot « en préparation ».
 */
const PLACEHOLDER_EVENTS = [1, 2, 3];

export default function RencontresPage() {
  return (
    <>
      {/* Héro */}
      <Container className="bg-paper py-16 sm:py-20">
        <Reveal>
          <div className="max-w-3xl">
            <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
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
            <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
              L&apos;agenda arrive bientôt
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink/70">
              Cette page accueillera l&apos;agenda des rencontres. Les
              événements pourront être gérés depuis le back-office, au même
              endroit que le catalogue.
            </p>
          </Reveal>

          {/* État « programmation en préparation » : décor, en attendant les
              vraies dates — bordures pointillées (R8 assumé, exception
              nommée), aucune barre grise qui laisserait croire à un
              chargement imminent. */}
          <FramedGrid className="mt-10 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {PLACEHOLDER_EVENTS.map((g, i) => (
              <Reveal key={g} delay={i * 120} className="h-full">
                <article className="flex h-full select-none flex-col border-2 border-dashed border-ink bg-paper-2">
                  {/* En-tête : date sur fond noir + lieu */}
                  <div className="flex items-stretch border-b-2 border-dashed border-ink">
                    <div className="flex items-center bg-ink px-4 py-3">
                      <span className="font-sans text-xs font-extrabold uppercase tracking-[.05em] text-pop-yellow">
                        Date à venir
                      </span>
                    </div>
                    <div className="flex flex-1 items-center border-l-2 border-dashed border-ink px-4 py-3">
                      <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
                        Lieu à préciser
                      </span>
                    </div>
                  </div>
                  {/* État honnête : pas de vraie date tant que le back-office
                      n'a rien à afficher. */}
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
                    <span className="font-sans text-xs font-bold uppercase tracking-[.08em] text-muted">
                      Programmation
                    </span>
                    <span className="font-sans text-sm text-ink-soft">en préparation</span>
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
            <Button
              href="/catalogue"
              variant="outline"
              className="px-7 py-3.5 text-sm tracking-[.04em]"
            >
              Découvrir le catalogue
            </Button>
            <Button
              href="/souscription"
              variant="outline"
              className="px-7 py-3.5 text-sm tracking-[.04em]"
            >
              Soutenir la souscription
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

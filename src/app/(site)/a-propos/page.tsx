import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { ACCENT_BORDER_T } from "@/lib/accents";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { getPageAPropos, getReglagesSite } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "À propos",
  description: "La maison de la pensée critique et des sciences sociales.",
  alternates: { canonical: "/a-propos" },
};

// Repères du bloc de présentation, repris de l'intro — décoratifs, sans code
// couleur (réservé aux 4 sections de la navbar).
const REPERES = [
  "Deux fonds historiques",
  "Une seule équipe d'éditrices",
  "Un même engagement",
];

/**
 * Équipe et dépôt de manuscrit (maquette « Qui sommes-nous ? », 2026-07) :
 * éditorial figé, hors CMS — même statut que le pitch 2026 du héros de
 * `/souscription`. À déplacer dans le global `page-a-propos` si le client
 * veut la main dessus.
 */
const EQUIPE_PERMANENTE =
  "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes";
const BUREAUX: { maison: string; membres: string }[] = [
  {
    maison: "La Dispute",
    membres:
      "Noémie Brun, Alexis Cukier, Jérôme Deauvieau, Pauline Delage, Étienne Douat, Amélie Jeammet, Danièle Kergoat, Aurore Koechlin, Richard Lagache, Clara Laspalas, Jacqueline Martinez, Marina Simonin et Hélène Stevens",
  },
  {
    maison: "Les Éditions sociales",
    membres:
      "Alexia Blin, Yohann Douet, Isabelle Garo, Marion Leclair, Alix Bouffard, Alexandre Feron, Vincent Heimendinger, Antony Burlaud, Guillaume Fondu, Richard Lagache, Jean Quétier, Alexis Cukier et Quentin Fondu",
  },
];
const MANUSCRITS_EMAIL = "manuscritsldes@gmail.com";

/** Recette des liens inline sur paper (celle du footer), réunie ici une fois. */
const INLINE_LINK =
  "font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

/** Bandeau d'en-tête des colonnes Équipe / Dépôt de manuscrit. */
const COL_HEADING =
  "bg-ink px-6 py-3 text-center font-sans text-sm font-extrabold uppercase tracking-[.08em] text-paper";

export default async function AProposPage() {
  // Global `page-a-propos` (textes du bloc de présentation, citation,
  // surcharge des deux maisons, sections libres) + `pages-legales` (liens
  // réseaux sociaux, les mêmes que la cellule « Suivez-nous » du footer).
  // Global vide = les textes en dur d'`EDITION_LIST` et de
  // `site-content-core.ts`.
  const [content, reglages] = await Promise.all([
    getPageAPropos(),
    getReglagesSite(),
  ]);
  const reseaux = reglages.footer.reseauxSociaux;

  return (
    <>
      {/* Bandeau-titre plein cadre (maquette 2026-07) — aplat ink, seule
          variante sombre de PageHero (tone="cover", même recette que les
          héros de /editions/[slug]). */}
      <section className="border-b-2 border-ink bg-ink">
        <Container className="py-12 sm:py-16">
          <PageHero tone="cover" title={<>Qui sommes-nous&nbsp;?</>} />
        </Container>
      </section>

      {/* Grand bloc de présentation encadré : titre + intro CMS + repères */}
      <section>
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="border-2 border-ink bg-paper p-7 sm:p-10">
              <h2 className="max-w-3xl font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
                {content.herosTitre}
              </h2>
              <p className="mt-5 max-w-[70ch] text-lg leading-relaxed text-ink/70">
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
      </section>

      {/* Réseaux sociaux — mêmes liens que la cellule « Suivez-nous » du
          footer (global `pages-legales`) ; aucune saisie = pas de section. */}
      {reseaux.length > 0 && (
        <section className="border-t-2 border-ink">
          <Container className="py-12 sm:py-16">
            <Reveal>
              <nav
                aria-label="Réseaux sociaux"
                className="border-2 border-ink bg-paper p-6 sm:p-7"
              >
                <ul className="flex flex-wrap gap-2">
                  {reseaux.map((r) => (
                    <li key={r.url}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex min-h-11 items-center border-2 border-ink px-4 py-2 font-sans text-xs font-bold uppercase tracking-[.05em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
                      >
                        {r.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </Reveal>
          </Container>
        </section>
      )}

      {/* Équipe | Dépôt de manuscrit — deux colonnes à bandeau (maquette) */}
      <section className="border-t-2 border-ink">
        <Container className="py-16 sm:py-20">
          <FramedGrid className="md:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={COL_HEADING}>Équipe</h2>
                <div className="flex flex-1 flex-col gap-5 p-6 text-[15px] leading-relaxed text-ink/70 sm:p-7">
                  <p>
                    Les Éditions sociales et La Dispute sont animées par une
                    équipe permanente&nbsp;: {EQUIPE_PERMANENTE}.
                  </p>
                  {BUREAUX.map((b) => (
                    <div key={b.maison}>
                      <p className="font-sans text-xs font-bold uppercase tracking-[.05em] text-ink">
                        Bureau éditorial — {b.maison}
                      </p>
                      <p className="mt-1.5">{b.membres}.</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={120} className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={COL_HEADING}>Dépôt de manuscrit</h2>
                <div className="flex flex-1 flex-col gap-4 p-6 text-[15px] leading-relaxed text-ink/70 sm:p-7">
                  <p>
                    Vous pouvez nous soumettre un manuscrit en nous contactant à{" "}
                    <a href={`mailto:${MANUSCRITS_EMAIL}`} className={INLINE_LINK}>
                      {MANUSCRITS_EMAIL}
                    </a>
                    . Pour cela, merci de nous faire parvenir un synopsis
                    contenant au minimum un résumé du manuscrit, une
                    présentation de l&apos;auteur·ice et une table des matières
                    indicative. Nos bureaux éditoriaux se réunissent et
                    discutent des projets soumis une fois par trimestre.
                  </p>
                  <p>
                    Nous recevons une très grande quantité de manuscrits, qui ne
                    nous permet malheureusement pas de répondre à chaque
                    proposition.
                  </p>
                </div>
              </div>
            </Reveal>
          </FramedGrid>
        </Container>
      </section>

      {/* Les deux maisons, côte à côte */}
      <section className="border-t-2 border-ink">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
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
                  <p className="mt-1 font-sans text-xs font-bold uppercase tracking-[.05em] text-muted">
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
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
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

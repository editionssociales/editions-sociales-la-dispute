import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { Eyebrow } from "@/components/eyebrow";
import { NouveautesCarousel, type NouveauteBook } from "@/components/nouveautes-carousel";
import { NAV_ACCENT_BG } from "@/components/nav-accent";
import { getActiveHighlight } from "@/lib/highlight";
import { getNewReleases, countBooks } from "@/lib/catalogue";
import { EDITIONS, EDITION_LIST } from "@/lib/editions";
import { ACCENT_BG } from "@/lib/accents";
import { NAV_BOUTIQUE, NAV_SECTIONS } from "@/lib/nav";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import type { Book, Cover, EditionSlug } from "@/lib/types";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "Les Éditions sociales x La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
  alternates: { canonical: "/" },
};

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

/**
 * Couleur du bandeau de mise en avant (`Highlight.couleur`, PR #29) →
 * classes littérales (contrat Tailwind JIT). Depuis la refonte (chantier 4
 * §3, R2), la couleur éditée ne peint plus un aplat de fond : elle devient
 * le LISERÉ du bloc éditorial — la palette pop reste un langage de nav, le
 * bandeau reste lisible (texte ink sur paper-2).
 */
const HIGHLIGHT_EDGE: Record<string, string> = {
  "pop-pink": "border-l-pop-pink",
  "pop-teal": "border-l-pop-teal",
  "pop-orange": "border-l-pop-orange",
  "pop-yellow": "border-l-pop-yellow",
};

/** Un livre est éligible au carrousel s'il a une couverture et une fiche d'origine (édition connue). */
function readyForCarousel(
  book: Book,
): book is Book & { edition: EditionSlug; cover: Cover } {
  return book.cover != null && book.edition != null;
}

export default async function HomePage() {
  const [releases, highlight, counts] = await Promise.all([
    getNewReleases(12),
    getActiveHighlight(),
    Promise.all(EDITION_LIST.map((e) => countBooks(e.slug))),
  ]);
  const books: NouveauteBook[] = releases.filter(readyForCarousel).map((book) => ({
    href: `/catalogue/${book.edition}/${book.slug}`,
    title: book.title,
    author: book.authors.map((a) => a.name).join(", "),
    coverUrl: book.cover.url,
    coverW: book.cover.width,
    coverH: book.cover.height,
    upcoming: book.status === "upcoming",
    imprint: EDITIONS[book.edition].shortName,
  }));

  return (
    <div className="bg-paper pb-[clamp(38px,6vw,76px)]">
      {/* Héros de marque (chantier 4 §1) — composition bespoke, comme la 404
          et le héros plein cadre de /editions/[slug] (R6/0.3) : le format
          XXL sur fond ink porte le SEUL h1 de la page (déclassé en h2 dans
          NouveautesCarousel) et n'entre dans aucun des 3 tons fermés de
          PageHero (content/system/cover), conçus pour une page secondaire —
          pas la vitrine. */}
      <section className="border-b-2 border-ink bg-ink text-paper">
        <Container className="py-[clamp(44px,7vw,92px)]">
          <Reveal>
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/60">
                  Deux maisons, un catalogue
                </p>
                <h1 className="mt-3 font-sans text-[clamp(40px,6.8vw,84px)] font-black italic uppercase leading-[0.92] text-paper">
                  Les Éditions sociales
                  <br />× La Dispute
                </h1>
                <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-paper/75">
                  La pensée critique et le mouvement ouvrier depuis 1927, les
                  sciences sociales et le féminisme en dialogue{" "}: un
                  catalogue commun, deux fonds distincts, une même exigence
                  éditoriale.
                </p>
              </div>
              <div className="flex flex-none flex-col gap-3 sm:flex-row">
                <Button
                  href="/editions/editions-sociales"
                  variant="house"
                  tone="navy"
                  className="justify-between gap-3 px-6 py-4 text-sm tracking-[.06em]"
                >
                  Éditions sociales <span aria-hidden="true">→</span>
                </Button>
                <Button
                  href="/editions/la-dispute"
                  variant="house"
                  tone="brick"
                  className="justify-between gap-3 px-6 py-4 text-sm tracking-[.06em]"
                >
                  La Dispute <span aria-hidden="true">→</span>
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      <div className="pt-[clamp(28px,4.5vw,52px)]">
        <NouveautesCarousel books={books} />
      </div>

      {/* Les deux maisons (chantier 4 §2) — pattern déjà éprouvé de
          /editions (Reveal + CountUp + barre d'accent + CTA), rapatrié entre
          le carrousel et les bandeaux : l'accueil n'est plus la seule page
          du site sans Reveal ni CountUp, et l'équilibre entre les deux
          maisons devient visible dès la vitrine. */}
      <Container className="mt-[clamp(48px,7vw,88px)]">
        <Reveal>
          <Eyebrow>Deux maisons, une équipe</Eyebrow>
          <h2 className="mt-2 font-sans text-[clamp(26px,3.4vw,40px)] font-black italic uppercase leading-[0.98] text-ink">
            Le catalogue par maison
          </h2>
        </Reveal>
        <FramedGrid className="mt-8 sm:grid-cols-2">
          {EDITION_LIST.map((edition, i) => (
            <Reveal key={edition.slug} delay={i * 120} className="h-full">
              <section className="flex h-full flex-col bg-paper p-7 sm:p-8">
                <span
                  aria-hidden="true"
                  className={`block h-[6px] w-16 ${ACCENT_BG[edition.accent]}`}
                />
                <h3 className="mt-5 font-sans text-2xl font-black italic uppercase leading-[0.98] text-ink">
                  {edition.name}
                </h3>
                <p className="mt-3 text-[15px] font-bold leading-snug text-ink/80">
                  {edition.tagline}
                </p>
                <p className="mt-6 flex items-baseline gap-2">
                  <CountUp
                    value={counts[i]}
                    className="font-sans text-3xl font-black italic text-ink"
                  />
                  <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
                    titres au catalogue
                  </span>
                </p>
                <Button
                  href={`/editions/${edition.slug}`}
                  className="mt-6 w-fit px-5 py-3 text-[13px] tracking-[.04em]"
                >
                  Découvrir
                </Button>
              </section>
            </Reveal>
          ))}
        </FramedGrid>
      </Container>

      {/* Mise en avant ponctuelle (E6bis / PR #29) : une seule entrée active à
          la fois (collection Highlight — l'ex-bandeau souscription codé en dur
          est devenu une entrée semée par la migration `highlight_couleur_cta`).
          Deux rendus (chantier 4 §3, R2) : la campagne souscription (lien vers
          /souscription) garde l'identité du héros de la page de dons (bg-ink,
          eyebrow pop-yellow) ; toute autre mise en avant est un highlight
          éditorial bg-paper-2 bordé, la couleur choisie dans /admin en liseré
          (HIGHLIGHT_EDGE) — jamais un aplat pop (R2). Rien n'est rendu sans
          entrée active : aucun wrapper laissé derrière. */}
      {highlight &&
        (highlight.lien?.startsWith("/souscription") ? (
          <Container className="mt-[clamp(30px,4.5vw,60px)]">
            <Reveal>
              <div className="flex flex-col gap-6 bg-ink px-6 py-8 text-paper sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-9">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-pop-yellow">
                    Souscription 2026
                  </p>
                  <p className="mt-1 font-sans text-[clamp(22px,2.8vw,34px)] font-black italic leading-[1.05] text-paper">
                    {highlight.titre}
                  </p>
                  {highlight.texte && (
                    <p className="mt-0.5 max-w-[56ch] text-sm text-paper/75">
                      {highlight.texte}
                    </p>
                  )}
                </div>
                <Button
                  href={highlight.lien}
                  variant="outline"
                  className="flex-none gap-2 whitespace-nowrap px-8 py-6 text-sm tracking-[.06em]"
                >
                  {highlight.lienLibelle?.trim() || "Souscrire"}{" "}
                  <span aria-hidden="true">→</span>
                </Button>
              </div>
            </Reveal>
          </Container>
        ) : (
          <Container className="mt-[clamp(48px,7vw,88px)]">
            <Reveal>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div
                  className={`flex min-w-0 flex-1 flex-col justify-center gap-1.5 border-2 border-ink border-l-4 bg-paper-2 px-6 py-6 sm:px-7 ${HIGHLIGHT_EDGE[highlight.couleur ?? "pop-pink"] ?? HIGHLIGHT_EDGE["pop-pink"]}`}
                >
                  <p className="font-sans text-[clamp(19px,2.2vw,28px)] font-black italic leading-[1.05] text-ink">
                    {highlight.titre}
                  </p>
                  {highlight.texte && (
                    <p className="mt-0.5 max-w-[56ch] text-sm text-ink/70">{highlight.texte}</p>
                  )}
                </div>
                {highlight.lien && (
                  <Button
                    href={highlight.lien}
                    className="flex-none items-center gap-2 whitespace-nowrap px-8 py-6 text-sm tracking-[.06em] sm:self-stretch"
                  >
                    {highlight.lienLibelle?.trim() || "En savoir plus"}{" "}
                    <span aria-hidden="true">→</span>
                  </Button>
                )}
              </div>
            </Reveal>
          </Container>
        ))}

      {/* Mosaïque pop de pied de page (chantier 4 §4, R2) : les 4 sections
          du quadrillage du header (mêmes hrefs/couleurs, `lib/nav` +
          `components/nav-accent`) + Boutique (hors palette pop — pas une
          section de nav au sens `NAV_SECTIONS`, chantier 3 §1) — la palette
          pop boucle entre header et pied de page, redevient un système de
          nav plutôt qu'un décor de bandeau. */}
      <Container className="mt-[clamp(30px,4.5vw,60px)]">
        <Reveal>
          <nav aria-label="Parcourir par section">
            <FramedGrid as="ul" className="grid-cols-2 sm:grid-cols-5">
              {NAV_SECTIONS.map((section) => (
                <li key={section.id} className="contents">
                  <Link
                    href={section.href}
                    className={`flex min-h-11 items-center justify-between gap-2 px-5 py-6 font-sans text-sm font-extrabold uppercase tracking-[.04em] text-black transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${NAV_ACCENT_BG[section.id]} ${FOCUS_RING_LIGHT}`}
                  >
                    {section.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
              <li className="contents">
                <Link
                  href={NAV_BOUTIQUE.href}
                  className={`col-span-2 flex min-h-11 items-center justify-between gap-2 bg-ink px-5 py-6 font-sans text-sm font-extrabold uppercase tracking-[.04em] text-paper transition-colors hover:bg-paper hover:text-ink motion-reduce:transition-none sm:col-span-1 ${FOCUS_RING_DARK}`}
                >
                  {NAV_BOUTIQUE.label}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            </FramedGrid>
          </nav>
        </Reveal>
      </Container>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
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
  // Titre absolu : la vitrine porte le nom du site seul — jamais
  // « Accueil — … » (onglet et snippet Google plus lisibles).
  title: { absolute: "Les Éditions sociales × La Dispute" },
  description:
    "Les Éditions sociales × La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
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
    <div className="bg-paper pb-[clamp(38px,6vw,76px)] pt-[clamp(20px,3vw,36px)]">
      {/* Épure minimaliste (chantier « épure ») : le héros de marque plein
          cadre a été retiré — la vitrine ouvre directement sur le carrousel
          Nouveautés. Le h1 unique de la page devient invisible (a11y/SEO
          seuls) puisqu'aucune section ne porte plus ce rôle visuellement. */}
      <h1 className="sr-only">Les Éditions sociales × La Dispute</h1>

      <NouveautesCarousel books={books} />

      {/* Les deux maisons (chantier 4 §2) — pattern déjà éprouvé de
          /editions (Reveal + CountUp + barre d'accent + CTA), rapatrié entre
          le carrousel et les bandeaux : l'accueil n'est plus la seule page
          du site sans Reveal ni CountUp, et l'équilibre entre les deux
          maisons devient visible dès la vitrine. */}
      <Container className="mt-[clamp(48px,7vw,88px)]">
        <FramedGrid className="sm:grid-cols-2">
          {EDITION_LIST.map((edition, i) => (
            <Reveal key={edition.slug} delay={i * 120} className="h-full">
              <section className="flex h-full flex-col bg-paper p-7 sm:p-8">
                <span
                  aria-hidden="true"
                  className={`block h-[6px] w-16 ${ACCENT_BG[edition.accent]}`}
                />
                <h2 className="mt-5 font-sans text-2xl font-black italic uppercase leading-[0.98] text-ink">
                  {edition.name}
                </h2>
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
                  <p className="font-sans text-[clamp(22px,2.8vw,34px)] font-black italic leading-[1.05] text-paper">
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

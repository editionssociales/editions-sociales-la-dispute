import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { NouveautesCarousel, type NouveauteBook } from "@/components/nouveautes-carousel";
import { getActiveHighlight } from "@/lib/highlight";
import { getNewReleases } from "@/lib/catalogue";
import { EDITIONS } from "@/lib/editions";
import type { Book, Cover, EditionSlug } from "@/lib/types";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "Les Éditions sociales x La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
  alternates: { canonical: "/" },
};

export const revalidate = 3600; // aligne la fraîcheur de la page sur le cache REST (WP_REVALIDATE)

/** Un livre est éligible au carrousel s'il a une couverture et une fiche d'origine (édition connue). */
function readyForCarousel(
  book: Book,
): book is Book & { edition: EditionSlug; cover: Cover } {
  return book.cover != null && book.edition != null;
}

export default async function HomePage() {
  const [releases, highlight] = await Promise.all([getNewReleases(12), getActiveHighlight()]);
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
    <div className="bg-white pb-[clamp(38px,6vw,76px)]">
      <div className="pt-[clamp(28px,4.5vw,52px)]">
        <NouveautesCarousel books={books} />
      </div>

      {/* Mise en avant ponctuelle (E6bis, engagement C32) : rien n'est rendu
          quand `highlight` est absent (inactif ou hors dates) — page
          strictement iso à l'état actuel, aucun wrapper laissé derrière. */}
      {highlight && (
        <Container className="mt-[clamp(30px,4.5vw,60px)]">
          <FramedGrid className="grid-cols-1 sm:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 flex-col justify-center gap-1.5 bg-pop-pink px-6 py-6 sm:px-7">
              <p className="font-sans text-[clamp(19px,2.2vw,28px)] font-black italic leading-[1.05] text-black">
                {highlight.titre}
              </p>
              {highlight.texte && (
                <p className="mt-0.5 max-w-[56ch] text-sm text-black/70">{highlight.texte}</p>
              )}
            </div>
            {highlight.lien && (
              <Link
                href={highlight.lien}
                className="flex flex-none items-center justify-center gap-2 whitespace-nowrap bg-black px-8 py-6 font-sans text-sm font-extrabold uppercase tracking-[.06em] text-white transition-colors hover:bg-pop-orange hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pop-yellow motion-reduce:transition-none"
              >
                En savoir plus <span aria-hidden="true">→</span>
              </Link>
            )}
          </FramedGrid>
        </Container>
      )}

      <Container className="mt-[clamp(30px,4.5vw,60px)]">
        <FramedGrid className="grid-cols-1 sm:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-col justify-center gap-1.5 bg-pop-yellow px-6 py-6 sm:px-7">
            <p className="font-sans text-[clamp(19px,2.2vw,28px)] font-black italic leading-[1.05] text-black">
              La souscription est ouverte
            </p>
            <p className="mt-0.5 max-w-[56ch] text-sm text-black/70">
              Soutenez les Éditions sociales et La Dispute — chaque
              souscription finance les prochains titres.
            </p>
          </div>
          <Link
            href="/souscription"
            className="flex flex-none items-center justify-center gap-2 whitespace-nowrap bg-black px-8 py-6 font-sans text-sm font-extrabold uppercase tracking-[.06em] text-white transition-colors hover:bg-pop-orange hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pop-yellow motion-reduce:transition-none"
          >
            Souscrire <span aria-hidden="true">→</span>
          </Link>
        </FramedGrid>
      </Container>
    </div>
  );
}

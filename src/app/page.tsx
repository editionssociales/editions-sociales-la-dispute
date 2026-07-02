import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { NouveautesCarousel, type NouveauteBook } from "@/components/nouveautes-carousel";
import { ACCENTS, ACCENT_BG } from "@/lib/accents";
import { getNewReleases } from "@/lib/catalogue";
import { EDITIONS } from "@/lib/editions";
import type { Book, Cover, EditionSlug } from "@/lib/types";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "Les Éditions sociales x La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
};

export const dynamic = "force-dynamic";

/** Un livre est éligible au carrousel s'il a une couverture et une fiche d'origine (édition connue). */
function readyForCarousel(
  book: Book,
): book is Book & { edition: EditionSlug; cover: Cover } {
  return book.cover != null && book.edition != null;
}

export default async function HomePage() {
  const releases = await getNewReleases(12);
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
    <div className="pt-[clamp(30px,4.5vw,60px)] pb-[clamp(38px,6vw,76px)]">
      <NouveautesCarousel books={books} />

      <Container className="mt-[clamp(30px,4.5vw,60px)]">
        <div className="flex flex-wrap items-center justify-between gap-6 border border-line bg-paper-2 px-6 py-6 sm:px-7">
          <div className="flex min-w-0 items-stretch gap-4 sm:gap-5">
            <div className="grid w-2 flex-none grid-rows-4" aria-hidden="true">
              {ACCENTS.map((a) => (
                <div key={a} className={ACCENT_BG[a]} />
              ))}
            </div>
            <div>
              <p className="font-serif text-[clamp(18px,2vw,25px)] font-semibold leading-[1.1] text-ink">
                La souscription est ouverte
              </p>
              <p className="mt-1.5 max-w-[56ch] text-sm text-ink-soft">
                Soutenez les Éditions sociales et La Dispute — chaque
                souscription finance les prochains titres.
              </p>
            </div>
          </div>
          <Link
            href="/souscription"
            className="flex-none whitespace-nowrap bg-ink px-[22px] py-3.5 text-sm font-bold uppercase tracking-[0.04em] text-paper transition-colors hover:bg-ocher-text focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-2 motion-reduce:transition-none"
          >
            Souscrire <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Container>
    </div>
  );
}

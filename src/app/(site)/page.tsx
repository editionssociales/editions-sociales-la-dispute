import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { NouveautesCarousel, type NouveauteBook } from "@/components/nouveautes-carousel";
import { getActiveHighlight } from "@/lib/highlight";
import { getNewReleases } from "@/lib/catalogue";
import { EDITIONS } from "@/lib/editions";
import { FOCUS_RING_DARK_OUTER } from "@/lib/ui";
import type { Book, Cover, EditionSlug } from "@/lib/types";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "Les Éditions sociales x La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
  alternates: { canonical: "/" },
};

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

/**
 * Couleurs du bandeau de mise en avant (`Highlight.couleur`) → classes
 * littérales (contrat Tailwind : le JIT ne compile pas le dynamique). Le
 * hover du CTA bascule sur jaune quand le fond est orange — sinon le bouton
 * survolé se fondrait dans le bandeau.
 */
const HIGHLIGHT_STYLES: Record<string, { block: string; ctaHover: string }> = {
  "pop-pink": { block: "bg-pop-pink", ctaHover: "hover:bg-pop-orange" },
  "pop-teal": { block: "bg-pop-teal", ctaHover: "hover:bg-pop-orange" },
  "pop-orange": { block: "bg-pop-orange", ctaHover: "hover:bg-pop-yellow" },
  "pop-yellow": { block: "bg-pop-yellow", ctaHover: "hover:bg-pop-orange" },
};

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
    <div className="bg-paper pb-[clamp(38px,6vw,76px)]">
      <div className="pt-[clamp(28px,4.5vw,52px)]">
        <NouveautesCarousel books={books} />
      </div>

      {/* Mise en avant ponctuelle (E6bis, engagement C32) : rien n'est rendu
          quand `highlight` est absent (inactif ou hors dates) — page
          strictement iso à l'état actuel, aucun wrapper laissé derrière.
          L'ex-bandeau souscription codé en dur vit désormais ici : c'est une
          entrée de la collection (semée par la migration
          `highlight_couleur_cta`), soumise à « une campagne à la fois ». */}
      {highlight && (
        <Container className="mt-[clamp(30px,4.5vw,60px)]">
          <FramedGrid className="grid-cols-1 sm:grid-cols-[1fr_auto]">
            <div
              className={`flex min-w-0 flex-col justify-center gap-1.5 px-6 py-6 sm:px-7 ${(HIGHLIGHT_STYLES[highlight.couleur ?? "pop-pink"] ?? HIGHLIGHT_STYLES["pop-pink"]).block}`}
            >
              <p className="font-sans text-[clamp(19px,2.2vw,28px)] font-black italic leading-[1.05] text-ink">
                {highlight.titre}
              </p>
              {highlight.texte && (
                <p className="mt-0.5 max-w-[56ch] text-sm text-ink/70">{highlight.texte}</p>
              )}
            </div>
            {highlight.lien && (
              <Link
                href={highlight.lien}
                className={`flex flex-none items-center justify-center gap-2 whitespace-nowrap bg-ink px-8 py-6 font-sans text-sm font-extrabold uppercase tracking-[.06em] text-paper transition-colors hover:text-black motion-reduce:transition-none ${FOCUS_RING_DARK_OUTER} ${(HIGHLIGHT_STYLES[highlight.couleur ?? "pop-pink"] ?? HIGHLIGHT_STYLES["pop-pink"]).ctaHover}`}
              >
                {highlight.lienLibelle?.trim() || "En savoir plus"}{" "}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </FramedGrid>
        </Container>
      )}
    </div>
  );
}

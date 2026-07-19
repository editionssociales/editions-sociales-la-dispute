import type { Metadata } from "next";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
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

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

/**
 * Couleurs du bandeau de mise en avant (`Highlight.couleur`) → classes
 * littérales (contrat Tailwind : le JIT ne compile pas le dynamique). Le CTA
 * suit désormais la recette canonique `<Button>` (R4, inversion ink↔paper) —
 * la couleur éditée ne pilote plus que l'aplat du bloc texte.
 */
const HIGHLIGHT_BLOCK: Record<string, string> = {
  "pop-pink": "bg-pop-pink",
  "pop-teal": "bg-pop-teal",
  "pop-orange": "bg-pop-orange",
  "pop-yellow": "bg-pop-yellow",
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
              className={`flex min-w-0 flex-col justify-center gap-1.5 px-6 py-6 sm:px-7 ${HIGHLIGHT_BLOCK[highlight.couleur ?? "pop-pink"] ?? HIGHLIGHT_BLOCK["pop-pink"]}`}
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
                className="flex-none gap-2 whitespace-nowrap px-8 py-6 text-sm tracking-[.06em]"
              >
                {highlight.lienLibelle?.trim() || "En savoir plus"}{" "}
                <span aria-hidden="true">→</span>
              </Button>
            )}
          </FramedGrid>
        </Container>
      )}
    </div>
  );
}

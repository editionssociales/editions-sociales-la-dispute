import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllBookParams, getBook } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { CollectionTag } from "@/components/collection-tag";
import { BuyLinksList } from "@/components/buy-links";
import { FramedGrid } from "@/components/framed-grid";
import { Eyebrow } from "@/components/eyebrow";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { formatDateFr } from "@/lib/format";
import { cmsExcerpt } from "@/lib/cms-html";
import { ACCENT_BG } from "@/lib/accents";
import { FOCUS_RING_LIGHT } from "@/lib/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string; slug: string }>;
}): Promise<Metadata> {
  const { edition, slug } = await params;
  if (!isEditionSlug(edition)) return {};
  const book = await getBook(edition, slug);
  if (!book) return {};
  return {
    title: book.title,
    description:
      cmsExcerpt(book.presentation, 160) ||
      `${book.title} — ${EDITIONS[edition].name}`,
    alternates: { canonical: `/catalogue/${edition}/${slug}` },
  };
}

/** Métadonnée du livre en cellule de la grille encadrée noir/blanc. */
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-1 bg-paper px-3.5 py-3">
      <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-muted">
        {label}
      </dt>
      <dd className="font-sans text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

type PersonLd = { "@type": "Person"; name: string };
type OfferLd = {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  url?: string;
};
/** Structured data `Book` (schema.org) — canaux légitimes (JSON-LD), pas de texte visible dupliqué. */
type BookJsonLd = {
  "@context": "https://schema.org";
  "@type": "Book";
  name: string;
  author?: PersonLd[];
  inLanguage: string;
  isbn?: string;
  numberOfPages?: number;
  datePublished?: string;
  publisher: { "@type": "Organization"; name: string };
  image?: string;
  description?: string;
  offers?: OfferLd;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllBookParams();
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ edition: string; slug: string }>;
}) {
  const { edition, slug } = await params;
  if (!isEditionSlug(edition)) notFound();
  const book = await getBook(edition, slug);
  if (!book) notFound();

  const editionInfo = EDITIONS[edition];
  const accentBg = ACCENT_BG[editionInfo.accent];

  const authorsLd: PersonLd[] = book.authors.map((a) => ({
    "@type": "Person",
    name: a.name,
  }));
  const descriptionLd = cmsExcerpt(book.presentation, 300) || undefined;
  const canOffer =
    book.price != null && (book.status === "available" || book.status === "external");

  const bookJsonLd: BookJsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    ...(authorsLd.length > 0 ? { author: authorsLd } : {}),
    inLanguage: "fr",
    ...(book.isbn != null ? { isbn: book.isbn } : {}),
    ...(book.pages != null ? { numberOfPages: book.pages } : {}),
    ...(book.publishedAt != null ? { datePublished: book.publishedAt } : {}),
    publisher: { "@type": "Organization", name: editionInfo.name },
    ...(book.cover?.url ? { image: book.cover.url } : {}),
    ...(descriptionLd ? { description: descriptionLd } : {}),
    ...(canOffer
      ? {
          offers: {
            "@type": "Offer",
            price: String(book.price),
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            ...(book.permalink ? { url: book.permalink } : {}),
          } satisfies OfferLd,
        }
      : {}),
  };
  const bookJsonLdScript = JSON.stringify(bookJsonLd).replace(/</g, "\\u003c");

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: bookJsonLdScript }}
      />
      <Breadcrumb
        trail={[
          { label: "Accueil", href: "/" },
          { label: "Catalogue", href: "/catalogue" },
          { label: editionInfo.name, href: `/catalogue/${edition}` },
        ]}
        currentIsPage={false}
      />

      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          {/* Largeur fixée par la colonne ; la hauteur suit le ratio réel de
              la couverture — jamais recadrée, jamais de bande. Couverture
              encadrée d'un contour noir 2px, comme les vignettes du catalogue. */}
          <div className="relative w-full overflow-hidden border-2 border-ink bg-paper-2">
            <BookCover
              cover={book.cover}
              title={book.title}
              alt={`Couverture de « ${book.title} »`}
              fit="width"
              sizes="300px"
              preload
              className="block h-auto w-full"
              fallbackClassName="p-6"
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[.08em] text-ink">
              Acheter
            </p>
            <BuyLinksList book={book} />
          </div>

          <FramedGrid as="dl" className="mt-6 grid-cols-2">
            <Info label="Collection" value={book.collection?.name} />
            <Info label="Parution" value={formatDateFr(book.publishedAt)} />
            <Info label="Pages" value={book.pages ? `${book.pages} p.` : null} />
            <Info label="ISBN" value={book.isbn} />
          </FramedGrid>

          {(book.tocUrl || book.excerptUrl) && (
            <FramedGrid as="div" flow="flex" className="mt-4">
              {book.tocUrl && (
                <a
                  href={book.tocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center bg-paper px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
                >
                  Table des matières
                </a>
              )}
              {book.excerptUrl && (
                <a
                  href={book.excerptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center bg-paper px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
                >
                  Extrait choisi
                </a>
              )}
            </FramedGrid>
          )}
        </div>

        <article>
          <Eyebrow variant="sm" className="mb-2">
            {editionInfo.name}
          </Eyebrow>
          {book.collection && <CollectionTag collection={book.collection} className="mb-3" />}
          <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-ink">
            {book.title}
          </h1>
          <div className={`mt-4 h-1 w-16 ${accentBg}`} aria-hidden="true" />
          {book.authors.length > 0 && (
            <p className="mt-4 font-sans text-lg font-bold text-ink/80">
              {book.authors.map((a) => a.name).join(", ")}
            </p>
          )}

          {book.presentation && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-ink">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rotate-45 ${accentBg}`}
                  aria-hidden="true"
                />
                Présentation
              </h2>
              <div
                className="prose-book max-w-none"
                dangerouslySetInnerHTML={{ __html: book.presentation }}
              />
            </section>
          )}

          {book.furtherReading && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-ink">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rotate-45 ${accentBg}`}
                  aria-hidden="true"
                />
                Pour aller plus loin
              </h2>
              <div
                className="prose-book max-w-none"
                dangerouslySetInnerHTML={{ __html: book.furtherReading }}
              />
            </section>
          )}
        </article>
      </div>
    </Container>
  );
}

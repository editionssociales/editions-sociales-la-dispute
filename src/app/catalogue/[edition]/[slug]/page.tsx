import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/catalogue";
import { Cover } from "@/lib/cover";
import { Container } from "@/components/container";
import { CollectionTag } from "@/components/collection-tag";
import { BuyLinksList } from "@/components/buy-links";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { excerptFromHtml, formatDateFr } from "@/lib/format";
import { ACCENT_BG } from "@/lib/accents";

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
      excerptFromHtml(book.presentation, 160) ||
      `${book.title} — ${EDITIONS[edition].name}`,
  };
}

/** Métadonnée du livre en cellule de la grille encadrée noir/blanc. */
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-1 bg-white px-3.5 py-3">
      <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-black/50">
        {label}
      </dt>
      <dd className="font-sans text-sm font-bold text-black">{value}</dd>
    </div>
  );
}

export const dynamic = "force-dynamic";

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

  return (
    <Container className="bg-white py-12">
      <nav
        aria-label="Fil d'ariane"
        className="mb-8 font-sans text-xs font-bold uppercase tracking-[.06em] text-black/60"
      >
        <Link
          href="/"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Accueil
        </Link>
        <span aria-hidden="true" className="px-1.5">
          /
        </span>
        <Link
          href="/catalogue"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Catalogue
        </Link>
        <span aria-hidden="true" className="px-1.5">
          /
        </span>
        <Link
          href={`/catalogue/${edition}`}
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          {editionInfo.name}
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          {/* Largeur fixée par la colonne ; la hauteur suit le ratio réel de
              la couverture — jamais recadrée, jamais de bande. Couverture
              encadrée d'un contour noir 2px, comme les vignettes du catalogue. */}
          <div className="relative w-full overflow-hidden border-2 border-black bg-paper-2">
            {book.cover ? (
              <Cover
                cover={book.cover}
                alt={`Couverture de « ${book.title} »`}
                fit="width"
                sizes="300px"
                preload
                className="block h-auto w-full"
              />
            ) : (
              <span className="flex aspect-[2/3] items-center justify-center p-6 text-center font-sans text-sm font-bold uppercase text-black">
                {book.title}
              </span>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[.08em] text-black">
              Acheter
            </p>
            <BuyLinksList book={book} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-[2px] bg-black p-[2px]">
            <Info label="Collection" value={book.collection?.name} />
            <Info label="Parution" value={formatDateFr(book.publishedAt)} />
            <Info label="Pages" value={book.pages ? `${book.pages} p.` : null} />
            <Info label="ISBN" value={book.isbn} />
          </dl>

          {(book.tocUrl || book.excerptUrl) && (
            <div className="mt-4 flex flex-wrap gap-[2px] bg-black p-[2px]">
              {book.tocUrl && (
                <a
                  href={book.tocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center bg-white px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]"
                >
                  Table des matières
                </a>
              )}
              {book.excerptUrl && (
                <a
                  href={book.excerptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center bg-white px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]"
                >
                  Extrait choisi
                </a>
              )}
            </div>
          )}
        </div>

        <article>
          <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
            {editionInfo.name}
          </p>
          {book.collection && <CollectionTag collection={book.collection} className="mb-3" />}
          <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-black">
            {book.title}
          </h1>
          <div className={`mt-4 h-1 w-16 ${accentBg}`} aria-hidden="true" />
          {book.authors.length > 0 && (
            <p className="mt-4 font-sans text-lg font-bold text-black/80">
              {book.authors.map((a) => a.name).join(", ")}
            </p>
          )}

          {book.presentation && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-black">
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
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-black">
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

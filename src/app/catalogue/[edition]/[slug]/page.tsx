import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/catalogue";
import { Container } from "@/components/container";
import { CollectionTag } from "@/components/collection-tag";
import { BuyLinksList } from "@/components/buy-links";
import { Kicker } from "@/components/kicker";
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

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
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
    <Container className="py-12">
      <nav
        aria-label="Fil d'ariane"
        className="mb-8 flex flex-wrap items-center gap-2.5 text-sm text-muted"
      >
        <Link href="/catalogue" className="transition-colors hover:text-ink">
          Catalogue
        </Link>
        <span className={`h-1.5 w-1.5 rotate-45 ${accentBg}`} aria-hidden="true" />
        <Link href={`/catalogue/${edition}`} className="transition-colors hover:text-ink">
          {editionInfo.name}
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div
            className="relative w-full overflow-hidden rounded-sm bg-paper-2 ring-1 ring-line"
            style={{ aspectRatio: book.cover ? `${book.cover.width} / ${book.cover.height}` : "2 / 3" }}
          >
            {book.cover ? (
              <Image
                src={book.cover.url}
                alt={`Couverture de « ${book.title} »`}
                fill
                sizes="300px"
                className="object-contain"
                priority
              />
            ) : (
              <span className="flex h-full items-center justify-center p-6 text-center font-serif text-muted">
                {book.title}
              </span>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-ink">Acheter</p>
            <BuyLinksList book={book} />
          </div>

          <dl className="mt-6 rounded-xl border border-line bg-paper-2 p-5">
            <Info label="Collection" value={book.collection?.name} />
            <Info label="Parution" value={formatDateFr(book.publishedAt)} />
            <Info label="Pages" value={book.pages ? `${book.pages} p.` : null} />
            <Info label="ISBN" value={book.isbn} />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {book.tocUrl && (
              <a
                href={book.tocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2 motion-reduce:transition-none"
              >
                Table des matières
              </a>
            )}
            {book.excerptUrl && (
              <a
                href={book.excerptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2 motion-reduce:transition-none"
              >
                Extrait choisi
              </a>
            )}
          </div>
        </div>

        <article>
          <Kicker accent={editionInfo.accent} className="mb-2">
            {editionInfo.name}
          </Kicker>
          {book.collection && <CollectionTag collection={book.collection} className="mb-3" />}
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            {book.title}
          </h1>
          <div className={`mt-4 h-1 w-16 ${accentBg}`} aria-hidden="true" />
          {book.authors.length > 0 && (
            <p className="mt-4 text-lg text-ink-soft">
              {book.authors.map((a) => a.name).join(", ")}
            </p>
          )}

          {book.presentation && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2.5 font-serif text-xl font-semibold">
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
              <h2 className="mb-3 flex items-center gap-2.5 font-serif text-xl font-semibold">
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

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/catalogue";
import { Container } from "@/components/container";
import { CollectionTag } from "@/components/collection-tag";
import { BuyLinksList } from "@/components/buy-links";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { excerptFromHtml, formatDateFr } from "@/lib/format";

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
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm">
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

  return (
    <Container className="py-12">
      <nav className="mb-8 text-sm text-muted">
        <Link href="/catalogue" className="hover:text-ink">
          Catalogue
        </Link>{" "}
        /{" "}
        <Link href={`/catalogue/${edition}`} className="hover:text-ink">
          {EDITIONS[edition].name}
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

          <dl className="mt-6">
            <Info label="Collection" value={book.collection?.name} />
            <Info label="Parution" value={formatDateFr(book.publishedAt)} />
            <Info label="Pages" value={book.pages ? `${book.pages} p.` : null} />
            <Info label="ISBN" value={book.isbn} />
          </dl>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {book.tocUrl && (
              <a href={book.tocUrl} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                Table des matières
              </a>
            )}
            {book.excerptUrl && (
              <a href={book.excerptUrl} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                Extrait choisi
              </a>
            )}
          </div>
        </div>

        <article>
          <p className="mb-2 text-sm font-medium text-muted">{EDITIONS[edition].name}</p>
          {book.collection && <CollectionTag collection={book.collection} className="mb-3" />}
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            {book.title}
          </h1>
          {book.authors.length > 0 && (
            <p className="mt-3 text-lg text-ink-soft">
              {book.authors.map((a) => a.name).join(", ")}
            </p>
          )}

          {book.presentation && (
            <section className="mt-8">
              <h2 className="mb-3 font-serif text-xl font-semibold">Présentation</h2>
              <div
                className="prose-book max-w-none"
                dangerouslySetInnerHTML={{ __html: book.presentation }}
              />
            </section>
          )}

          {book.furtherReading && (
            <section className="mt-8">
              <h2 className="mb-3 font-serif text-xl font-semibold">
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

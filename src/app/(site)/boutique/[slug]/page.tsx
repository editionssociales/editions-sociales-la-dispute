import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllBoutiqueParams, getBoutiqueBook } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { BuyLinksList } from "@/components/buy-links";
import { FramedGrid } from "@/components/framed-grid";
import { Eyebrow } from "@/components/eyebrow";
import { formatDateFr } from "@/lib/format";
import { cmsExcerpt } from "@/lib/cms-html";

/**
 * Fiche minimale d'un article boutique-seul (plan §4 étape 7) — même
 * composant d'achat (`BuyLinksList`) que les fiches catalogue, sans les
 * métadonnées propres à un livre édité (collection, ISBN, ex-libris de
 * maison) que ces articles (goodies, manuels, correspondances) n'ont pas
 * toujours. Les liens historiques `/produit/<slug>/` y arrivent via la table
 * de redirections (`next.config.ts`).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBoutiqueBook(slug);
  if (!book) return {};
  return {
    title: book.title,
    description: cmsExcerpt(book.presentation, 160) || book.title,
    alternates: { canonical: `/boutique/${slug}` },
  };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllBoutiqueParams();
}

export default async function BoutiqueBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await getBoutiqueBook(slug);
  if (!book) notFound();

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
          href="/boutique"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Boutique
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative w-full overflow-hidden border-2 border-black bg-paper-2">
            <BookCover
              cover={book.cover}
              title={book.title}
              alt={book.title}
              fit="width"
              sizes="300px"
              preload
              className="block h-auto w-full"
              fallbackClassName="p-6"
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[.08em] text-black">
              Acheter
            </p>
            <BuyLinksList book={book} />
          </div>

          {(book.pages || book.publishedAt) && (
            <FramedGrid as="dl" className="mt-6 grid-cols-2">
              {book.publishedAt && (
                <div className="flex flex-col gap-1 bg-white px-3.5 py-3">
                  <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-black/50">
                    Parution
                  </dt>
                  <dd className="font-sans text-sm font-bold text-black">
                    {formatDateFr(book.publishedAt)}
                  </dd>
                </div>
              )}
              {book.pages && (
                <div className="flex flex-col gap-1 bg-white px-3.5 py-3">
                  <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-black/50">
                    Pages
                  </dt>
                  <dd className="font-sans text-sm font-bold text-black">{book.pages} p.</dd>
                </div>
              )}
            </FramedGrid>
          )}

          {(book.tocUrl || book.excerptUrl) && (
            <FramedGrid as="div" flow="flex" className="mt-4">
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
            </FramedGrid>
          )}
        </div>

        <article>
          <Eyebrow className="mb-2">Boutique</Eyebrow>
          <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-black">
            {book.title}
          </h1>
          <div className="mt-4 h-1 w-16 bg-black" aria-hidden="true" />

          {book.presentation && (
            <section className="mt-8">
              <div
                className="prose-book max-w-none"
                dangerouslySetInnerHTML={{ __html: book.presentation }}
              />
            </section>
          )}

          {book.furtherReading && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-black">
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-black" aria-hidden="true" />
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

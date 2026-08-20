import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBoutiqueBook } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { BuyLinksList } from "@/components/buy-links";
import { NewTabMark } from "@/components/new-tab-mark";
import { FramedGrid } from "@/components/framed-grid";
import { formatDateFr } from "@/lib/format";
import { cmsExcerpt } from "@/lib/cms-html";
import { getReglagesSite } from "@/lib/site-content";
import { FOCUS_RING_LIGHT, PDF_LINK_CLASS } from "@/lib/ui";

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
    // Issue #87b : même composition que la fiche catalogue (même forme de
    // données, `BookDetail`) — `openGraph` REMPLACE celui du layout (fusion
    // superficielle par champ, `src/app/CLAUDE.md`), donc `siteName`/`locale`
    // sont reposés ici.
    openGraph: {
      type: "website",
      siteName: (await getReglagesSite()).seo.titre,
      locale: "fr_FR",
      ...(book.cover?.url ? { images: [{ url: book.cover.url }] } : {}),
    },
    twitter: {
      card: book.cover?.url ? "summary_large_image" : "summary",
      ...(book.cover?.url ? { images: [book.cover.url] } : {}),
    },
  };
}

type OfferLd = {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  url?: string;
};
/** Structured data `Product` (schema.org) — même rôle que le `Book` JSON-LD de la fiche catalogue, canaux légitimes (JSON-LD), pas de texte visible dupliqué. */
type ProductJsonLd = {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  image?: string;
  description?: string;
  brand: { "@type": "Organization"; name: string };
  offers?: OfferLd;
};

export const revalidate = 3600;

// Vide : même politique que les fiches catalogue (génération à la première
// visite, ISR ensuite) — voir catalogue/[edition]/[slug]/page.tsx pour le
// pourquoi (quota transfert Neon, pas de Data Cache au build).
export async function generateStaticParams() {
  return [];
}

export default async function BoutiqueBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await getBoutiqueBook(slug);
  if (!book) notFound();

  const descriptionLd = cmsExcerpt(book.presentation, 300) || undefined;
  const canOffer = book.price != null && (book.status === "available" || book.status === "external");
  const productJsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: book.title,
    brand: { "@type": "Organization", name: (await getReglagesSite()).seo.titre },
    // URL absolue exigée par schema.org (même repli que la fiche livre).
    ...(book.cover?.url
      ? {
          image: new URL(
            book.cover.url,
            process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr",
          ).toString(),
        }
      : {}),
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
  const productJsonLdScript = JSON.stringify(productJsonLd).replace(/</g, "\\u003c");

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLdScript }}
      />
      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        {/* Même règle que la fiche catalogue : titre avant achat sur mobile
            (order), couverture jamais plus large que 300px CSS avant lg. */}
        <div className="order-2 mx-auto w-full max-w-[300px] lg:order-1 lg:mx-0 lg:max-w-none lg:self-start">
          <div className="relative w-full overflow-hidden border-2 border-ink bg-paper-2">
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

          <div className="mt-6 border-2 border-ink bg-paper p-4">
            <BuyLinksList book={book} />
          </div>

          {(book.pages || book.publishedAt) && (
            <FramedGrid as="dl" className="mt-6 grid-cols-2">
              {book.publishedAt && (
                <div className="flex flex-col gap-1 bg-paper px-3.5 py-3">
                  <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-muted">
                    Parution
                  </dt>
                  <dd className="font-sans text-sm font-bold text-ink">
                    {formatDateFr(book.publishedAt)}
                  </dd>
                </div>
              )}
              {book.pages && (
                <div className="flex flex-col gap-1 bg-paper px-3.5 py-3">
                  <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-muted">
                    Pages
                  </dt>
                  <dd className="font-sans text-sm font-bold text-ink">{book.pages} p.</dd>
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
                  className={`${PDF_LINK_CLASS} ${FOCUS_RING_LIGHT}`}
                >
                  Table des matières (PDF)
                  <NewTabMark />
                </a>
              )}
              {book.excerptUrl && (
                <a
                  href={book.excerptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${PDF_LINK_CLASS} ${FOCUS_RING_LIGHT}`}
                >
                  Extrait choisi (PDF)
                  <NewTabMark />
                </a>
              )}
            </FramedGrid>
          )}
        </div>

        <article className="order-1 lg:order-2">
          <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
            {book.title}
          </h1>
          <div className="mt-4 h-1 w-16 bg-ink" aria-hidden="true" />

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
              <h2 className="mb-3 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-ink">
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-ink" aria-hidden="true" />
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

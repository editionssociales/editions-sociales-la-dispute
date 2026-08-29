import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBoutiqueBook } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { BuyLinksList } from "@/components/buy-links";
import { BookTabs, type BookTab } from "@/components/book-tabs";
import { NewTabMark } from "@/components/new-tab-mark";
import { FramedGrid } from "@/components/framed-grid";
import { youTubeEmbedUrl } from "@/lib/video";
import { formatDateFr } from "@/lib/format";
import { cmsExcerpt } from "@/lib/cms-html";
import { getPagesLegales, getReglagesSite } from "@/lib/site-content";
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

// Fenêtre ISR 24 h — filet seulement : la fiche est purgée à l'édition
// (hooks back-office) ET au paiement (décrément de stock, `order-handler.ts`)
// — audit coûts Vercel 2026-08-23.
export const revalidate = 86400;

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
  const { livraisonDelai } = await getPagesLegales();

  const descriptionLd = cmsExcerpt(book.presentation, 300) || undefined;
  // Prix TEXTE visible = fait du livre (toujours affiché, `BuyLinksList`) ;
  // Offer STRUCTURÉE = promesse de vendabilité pour les moteurs (réservée à
  // available/external/preorder) — même donnée, deux règles de canal,
  // distinctes à dessein.
  const canOffer =
    book.price != null &&
    (book.status === "available" || book.status === "external" || book.status === "preorder");
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
            // Précommande (client 2026-08-20) : rien n'est en stock avant la
            // parution — n'annonce jamais `InStock` pour un livre `preorder`.
            availability:
              book.status === "preorder" ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
            ...(book.permalink ? { url: book.permalink } : {}),
          } satisfies OfferLd,
        }
      : {}),
  };
  const productJsonLdScript = JSON.stringify(productJsonLd).replace(/</g, "\\u003c");

  // Onglets de la fiche (même traitement que la fiche catalogue,
  // `catalogue/[edition]/[slug]/page.tsx`) : « Pour aller plus loin » n'est
  // plus une section empilée sous la présentation, c'est le premier onglet,
  // suivi de « La presse en parle » (citations + vidéo YouTube) et « Table
  // des matières » (richText). Aucun contenu = pas de bloc d'onglets du tout.
  const videoEmbed = book.videoUrl ? youTubeEmbedUrl(book.videoUrl) : null;
  const tabs: BookTab[] = [];
  if (book.furtherReading) {
    tabs.push({
      id: "pour-aller-plus-loin",
      label: "Pour aller plus loin",
      panel: (
        <div
          className="prose-book max-w-none"
          dangerouslySetInnerHTML={{ __html: book.furtherReading }}
        />
      ),
    });
  }
  if (book.press.length > 0 || videoEmbed) {
    tabs.push({
      id: "presse",
      label: "La presse en parle",
      panel: (
        <div className="flex flex-col gap-6">
          {book.press.length > 0 && (
            <ul className="flex flex-col gap-4">
              {book.press.map((q, i) => (
                <li key={i} className="text-[15px] leading-relaxed text-ink/80">
                  {q.url ? (
                    <a
                      href={q.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`font-serif italic text-ink underline decoration-1 underline-offset-2 hover:decoration-2 ${FOCUS_RING_LIGHT}`}
                    >
                      «&nbsp;{q.quote}&nbsp;»
                      <NewTabMark />
                    </a>
                  ) : (
                    <span className="font-serif italic text-ink">
                      «&nbsp;{q.quote}&nbsp;»
                    </span>
                  )}{" "}
                  <span className="font-sans text-sm font-bold text-ink">
                    {q.source}
                    {q.date ? `, ${q.date}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {videoEmbed && (
            <div className="border-2 border-ink bg-paper-2">
              <iframe
                src={videoEmbed}
                title={`Vidéo — ${book.title}`}
                className="aspect-video w-full"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
        </div>
      ),
    });
  }
  if (book.tocHtml) {
    tabs.push({
      id: "table-des-matieres",
      label: "Table des matières",
      panel: (
        <div
          className="prose-book max-w-none"
          dangerouslySetInnerHTML={{ __html: book.tocHtml }}
        />
      ),
    });
  }

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
            <BuyLinksList book={book} livraisonDelai={livraisonDelai} />
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

          {tabs.length > 0 && (
            <section className="mt-8">
              <BookTabs tabs={tabs} />
            </section>
          )}
        </article>
      </div>
    </Container>
  );
}

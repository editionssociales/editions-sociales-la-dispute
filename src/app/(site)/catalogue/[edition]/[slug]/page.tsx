import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllBookParams, getBook, getBooks } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { LibelleTag } from "@/components/libelle-tag";
import { BuyLinksList } from "@/components/buy-links";
import { FramedGrid } from "@/components/framed-grid";
import { Eyebrow } from "@/components/eyebrow";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { formatDateFr } from "@/lib/format";
import { cmsExcerpt } from "@/lib/cms-html";
import { ACCENT_BG } from "@/lib/accents";
import { FOCUS_RING_LIGHT, FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string; slug: string }>;
}): Promise<Metadata> {
  const { edition, slug } = await params;
  if (!isEditionSlug(edition)) return {};
  const book = await getBook(edition, slug);
  if (!book) return {};
  const description =
    cmsExcerpt(book.presentation, 160) || `${book.title} — ${EDITIONS[edition].name}`;
  return {
    title: book.title,
    description,
    alternates: { canonical: `/catalogue/${edition}/${slug}` },
    // Carte de partage : la couverture en visuel (URL absolue via
    // `metadataBase`), type `book` + carte large — title/description/url
    // suivent les champs ci-dessus (résolution Next).
    openGraph: {
      type: "book",
      ...(book.cover?.url ? { images: [{ url: book.cover.url }] } : {}),
    },
    twitter: {
      card: book.cover?.url ? "summary_large_image" : "summary",
    },
  };
}

/**
 * Métadonnée du livre en cellule de la grille encadrée noir/blanc. Avec
 * `href`, la cellule entière devient cliquable (libellé → catalogue de
 * l'édition filtré sur ce thème) : la valeur se souligne au survol/focus
 * pour signaler le lien sans changer la recette visuelle des autres cellules.
 */
function Info({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  if (value == null || value === "") return null;
  const dt = (
    <dt className="font-sans text-[10px] font-bold uppercase tracking-[.08em] text-muted">
      {label}
    </dt>
  );
  const dd = href ? (
    <dd className="font-sans text-sm font-bold text-ink underline decoration-ink/30 underline-offset-2 group-hover:decoration-ink">
      {value}
    </dd>
  ) : (
    <dd className="font-sans text-sm font-bold text-ink">{value}</dd>
  );
  if (href) {
    return (
      <Link href={href} className={`group contents ${FOCUS_RING_LIGHT}`}>
        <div className="flex flex-col gap-1 bg-paper px-3.5 py-3">
          {dt}
          {dd}
        </div>
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1 bg-paper px-3.5 py-3">
      {dt}
      {dd}
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

  // Bouclage éditorial en pied de fiche : jusqu'à 4 autres titres partageant
  // le premier libellé (le livre courant exclu). Aucun résultat → pas de section.
  const primaryLibelle = book.libelles[0] ?? null;
  const sameLibelle = primaryLibelle
    ? (await getBooks({ edition, libelle: primaryLibelle.slug }))
        .filter((b) => b.id !== book.id)
        .slice(0, 4)
    : [];

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
    // URL absolue exigée par schema.org (le chemin `/api/media/...` relatif
    // n'est pas exploitable hors du document).
    ...(book.cover?.url
      ? {
          image: new URL(
            book.cover.url,
            process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr",
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
        {/* Mobile/tablette : le titre (article, order-1) précède l'achat
            (order-2) — l'achat ne doit jamais s'afficher avant ce qu'on
            achète. À partir de lg, la colonne fixe reprend sa place à gauche
            et devient sticky. Couverture bornée à 300px CSS jusqu'à lg (le
            `sizes="300px"` de BookCover reste vrai à tout moment). */}
        <div className="order-2 mx-auto w-full max-w-[300px] lg:sticky lg:top-24 lg:order-1 lg:mx-0 lg:max-w-none lg:self-start">
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

          <div className="mt-6 border-2 border-ink bg-paper p-4">
            <Eyebrow variant="sm" className="mb-2">
              Acheter
            </Eyebrow>
            <BuyLinksList book={book} />
          </div>

          <FramedGrid as="dl" className="mt-6 grid-cols-2">
            {book.libelles.map((libelle) => (
              <Info
                key={libelle.slug}
                label="Libellé"
                value={libelle.name}
                href={`/catalogue/${edition}?libelle=${libelle.slug}`}
              />
            ))}
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

        <article className="order-1 lg:order-2">
          <Eyebrow variant="sm" className="mb-2">
            {editionInfo.name}
          </Eyebrow>
          {book.libelles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {book.libelles.map((libelle) => (
                <LibelleTag key={libelle.slug} libelle={libelle} />
              ))}
            </div>
          )}
          <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
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

          {sameLibelle.length > 0 && (
            <section className="mt-10 border-t-2 border-ink pt-8">
              <h2 className="mb-4 flex items-center gap-2.5 font-sans text-xl font-black italic uppercase tracking-[.01em] text-ink">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rotate-45 ${accentBg}`}
                  aria-hidden="true"
                />
                Même libellé
              </h2>
              <FramedGrid className="grid-cols-2 sm:grid-cols-4">
                {sameLibelle.map((related) => (
                  <Link
                    key={related.id}
                    href={`/catalogue/${related.edition}/${related.slug}`}
                    className={`group flex flex-col bg-paper p-3 ${FOCUS_RING_LIGHT_OUTER}`}
                  >
                    <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2">
                      <BookCover
                        cover={related.cover}
                        title={related.title}
                        alt={`Couverture de « ${related.title} »`}
                        fit="width"
                        sizes="200px"
                        className="block h-auto w-full"
                        fallbackClassName="p-3"
                      />
                    </span>
                    <p className="mt-2 font-sans text-xs font-bold leading-snug text-ink line-clamp-2 group-hover:underline">
                      {related.title}
                    </p>
                  </Link>
                ))}
              </FramedGrid>
            </section>
          )}
        </article>
      </div>
    </Container>
  );
}

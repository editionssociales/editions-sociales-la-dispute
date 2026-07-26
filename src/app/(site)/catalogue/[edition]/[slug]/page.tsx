import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllBookParams, getBook, getBooks } from "@/lib/catalogue";
import { BookCover } from "@/lib/cover";
import { Container } from "@/components/container";
import { LibelleTag } from "@/components/libelle-tag";
import { BuyLinksList } from "@/components/buy-links";
import { BookTabs, type BookTab } from "@/components/book-tabs";
import { FramedGrid } from "@/components/framed-grid";
import { youTubeEmbedUrl } from "@/lib/video";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { getReglagesSite } from "@/lib/site-content";
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
    // suivent les champs ci-dessus (résolution Next). `openGraph` REMPLACE
    // celui du layout (fusion superficielle par champ) : siteName/locale
    // doivent être reposés ici, sinon ils disparaissent des fiches.
    openGraph: {
      type: "book",
      siteName: (await getReglagesSite()).seo.titre,
      locale: "fr_FR",
      ...(book.cover?.url ? { images: [{ url: book.cover.url }] } : {}),
    },
    // Issue #87a : `summary_large_image` n'a de sens que si une image est
    // RÉELLEMENT émise — `images` reprend ici la même couverture que
    // `openGraph` (jamais une carte large sans visuel).
    twitter: {
      card: book.cover?.url ? "summary_large_image" : "summary",
      ...(book.cover?.url ? { images: [book.cover.url] } : {}),
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
    // Issue #86a : `display:contents` sur le <Link> lui ôte toute boîte —
    // un `outline` posé dessus (via `FOCUS_RING_LIGHT`) ne s'affiche donc
    // JAMAIS (échec WCAG 2.4.7). L'anneau doit vivre sur l'enfant qui porte
    // réellement le fond (`bg-paper`) ; `group-focus-visible:` le déclenche
    // depuis l'état focus du lien parent.
    return (
      <Link href={href} className="group contents">
        <div className="flex flex-col gap-1 bg-paper px-3.5 py-3 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-ink group-focus-visible:outline-offset-[-2px]">
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

  // Onglets de la fiche (maquette client « essai page de livre »,
  // 2026-07-23) : « La presse en parle » (citations + vidéo YouTube) et
  // « Table des matières » (richText, sinon lien vers le PDF téléversé).
  // Aucun contenu = pas de bloc d'onglets du tout.
  const videoEmbed = book.videoUrl ? youTubeEmbedUrl(book.videoUrl) : null;
  const tabs: BookTab[] = [];
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
                  {/* Maquette : la citation elle-même est le lien (soulignée)
                      quand un article est renseigné. */}
                  {q.url ? (
                    <a
                      href={q.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`font-serif italic text-ink underline decoration-1 underline-offset-2 hover:decoration-2 ${FOCUS_RING_LIGHT}`}
                    >
                      «&nbsp;{q.quote}&nbsp;»
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
  if (book.tocHtml || book.tocUrl) {
    tabs.push({
      id: "table-des-matieres",
      label: "Table des matières",
      panel: book.tocHtml ? (
        <div
          className="prose-book max-w-none"
          dangerouslySetInnerHTML={{ __html: book.tocHtml }}
        />
      ) : (
        <a
          href={book.tocUrl!}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex min-h-11 items-center border-2 border-ink bg-paper px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
        >
          Table des matières (PDF)
        </a>
      ),
    });
  }

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: bookJsonLdScript }}
      />
      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        {/* Mobile/tablette : le titre (article, order-1) précède l'achat
            (order-2) — l'achat ne doit jamais s'afficher avant ce qu'on
            achète. À partir de lg, la colonne fixe reprend sa place à gauche,
            SANS sticky (l'ancrage se superposait aux sections plus basses —
            retiré, il vit désormais sur l'aside paliers de /souscription).
            Couverture bornée à 300px CSS jusqu'à lg (le
            `sizes="300px"` de BookCover reste vrai à tout moment). */}
        <div className="order-2 mx-auto w-full max-w-[300px] lg:order-1 lg:mx-0 lg:max-w-none lg:self-start">
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
            <BuyLinksList book={book} />
          </div>

          <FramedGrid as="dl" className="mt-6 grid-cols-2">
            <Info label="Parution" value={formatDateFr(book.publishedAt)} />
            <Info label="Pages" value={book.pages ? `${book.pages} p.` : null} />
            <Info label="ISBN" value={book.isbn} />
            <Info label="Éditeur" value={editionInfo.name} href={`/catalogue/${edition}`} />
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
                  Table des matières (PDF)
                </a>
              )}
              {book.excerptUrl && (
                <a
                  href={book.excerptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center bg-paper px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
                >
                  Extrait choisi (PDF)
                </a>
              )}
            </FramedGrid>
          )}
        </div>

        <article className="order-1 lg:order-2">
          {book.libelles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {book.libelles.map((libelle) => (
                <LibelleTag
                  key={libelle.slug}
                  libelle={libelle}
                  href={`/catalogue/${edition}?libelle=${libelle.slug}`}
                />
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

          {tabs.length > 0 && (
            <section className="mt-10">
              <BookTabs tabs={tabs} />
            </section>
          )}
        </article>

        {/* Bandeau pleine largeur SOUS les deux colonnes (order-3) : sur
            mobile, il passait avant la couverture et le bloc d'achat quand il
            vivait dans l'article — la couverture se retrouvait enterrée en
            bas de page. L'ordre mobile devient : article → achat → liés. */}
        {sameLibelle.length > 0 && (
          <section className="order-3 border-t-2 border-ink pt-8 lg:col-span-2">
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
                  <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
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
                </Link>
              ))}
            </FramedGrid>
          </section>
        )}
      </div>
    </Container>
  );
}

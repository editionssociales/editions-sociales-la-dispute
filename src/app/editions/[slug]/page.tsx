import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { Kicker } from "@/components/kicker";
import { Reveal } from "@/components/reveal";
import { ACCENT_BG } from "@/lib/accents";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { getBooks } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isEditionSlug(slug)) return {};
  return { title: EDITIONS[slug].name, description: EDITIONS[slug].description };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isEditionSlug(slug)) notFound();
  const info = EDITIONS[slug];
  const books = await getBooks({ edition: slug, sort: "recent" });

  return (
    <>
      {/* Héro pleine couleur, dans l'accent de la maison */}
      <section className={`${ACCENT_BG[info.accent]} text-paper`}>
        <Container className="py-16 sm:py-24">
          <Reveal>
            <Kicker light>{info.name}</Kicker>
            <h1 className="mt-4 max-w-4xl font-serif text-4xl font-semibold leading-[1.08] sm:text-6xl">
              {info.tagline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-paper/85">
              {info.description}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <p className="flex items-baseline gap-2">
                <span className="font-serif text-4xl font-semibold">
                  {books.length}
                </span>
                <span className="text-sm text-paper/85">titres au catalogue</span>
              </p>
              <span className="hidden h-8 w-px bg-paper/30 sm:block" aria-hidden="true" />
              <a
                href={info.legacyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-paper ring-1 ring-inset ring-paper/40 transition-colors hover:bg-paper/10"
              >
                Site historique
                <span aria-hidden="true">&nbsp;↗</span>
              </a>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Parutions récentes — liste utilitaire, sans effet d'apparition */}
      <Container className="py-12 sm:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker accent={info.accent}>{info.shortName}</Kicker>
            <h2 className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">
              Parutions récentes
            </h2>
          </div>
          <Link
            href={`/catalogue/${slug}`}
            className="text-sm font-semibold text-ink hover:underline"
          >
            Tout le catalogue →
          </Link>
        </div>
        <BookGrid books={books.slice(0, 8)} />
      </Container>

      {/* Bandeau final, discret, vers le catalogue de la maison */}
      <section className="border-t border-line bg-paper-2">
        <Container className="flex flex-col items-start gap-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-ink-soft">
            Le fonds {info.shortName} compte {books.length} titres — tous
            réunis dans le catalogue de la maison.
          </p>
          <Link
            href={`/catalogue/${slug}`}
            className="shrink-0 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5"
          >
            Parcourir tout le fonds
          </Link>
        </Container>
      </section>
    </>
  );
}

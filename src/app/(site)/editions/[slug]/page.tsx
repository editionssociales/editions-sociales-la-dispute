import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { Reveal } from "@/components/reveal";
import { ACCENT_BG } from "@/lib/accents";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { getBooks } from "@/lib/catalogue";

export const revalidate = 3600; // aligne la fraîcheur de la page sur le cache REST (WP_REVALIDATE)

export function generateStaticParams() {
  return [{ slug: "editions-sociales" }, { slug: "la-dispute" }];
}

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
      {/* Héro plein cadre, dans l'accent de la maison */}
      <section className={`border-b-2 border-black ${ACCENT_BG[info.accent]}`}>
        <Container className="py-14 sm:py-20">
          <Reveal>
            <nav
              aria-label="Fil d'ariane"
              className="font-sans text-xs font-bold uppercase tracking-[.06em] text-white/70"
            >
              <Link
                href="/"
                className="transition-colors motion-reduce:transition-none hover:text-white"
              >
                Accueil
              </Link>
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
              <Link
                href="/editions"
                className="transition-colors motion-reduce:transition-none hover:text-white"
              >
                Nos collections
              </Link>
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
              <span className="text-white">{info.shortName}</span>
            </nav>
            <h1 className="mt-5 max-w-4xl font-sans text-4xl font-black italic uppercase leading-[0.94] text-white sm:text-6xl">
              {info.name}
            </h1>
            <p className="mt-4 max-w-2xl font-sans text-lg font-bold leading-snug text-white/90">
              {info.tagline}
            </p>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/80">
              {info.description}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <p className="flex items-baseline gap-2 border-2 border-white px-4 py-2.5">
                <span className="font-sans text-2xl font-black italic text-white">
                  {books.length}
                </span>
                <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-white/80">
                  titres au catalogue
                </span>
              </p>
              <a
                href={info.legacyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 border-2 border-white px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[.04em] text-white transition-colors motion-reduce:transition-none hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              >
                Site historique
                <span aria-hidden="true">&nbsp;↗</span>
              </a>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Parutions récentes — liste utilitaire, sans effet d'apparition */}
      <Container className="bg-white py-12 sm:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-black pb-4 sm:mb-8">
          <div>
            <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
              {info.shortName}
            </p>
            <h2 className="mt-2 font-sans text-2xl font-black italic uppercase leading-[0.96] text-black sm:text-3xl">
              Parutions récentes
            </h2>
          </div>
          <Link
            href={`/catalogue/${slug}`}
            className="font-sans text-sm font-bold uppercase tracking-[.03em] text-black hover:underline"
          >
            Tout le catalogue →
          </Link>
        </div>
        <BookGrid books={books.slice(0, 8)} />
      </Container>

      {/* Bandeau final, discret, vers le catalogue de la maison */}
      <section className="border-t-2 border-black bg-white">
        <Container className="flex flex-col items-start gap-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[15px] leading-relaxed text-black/70">
            Le fonds {info.shortName} compte {books.length} titres — tous
            réunis dans le catalogue de la maison.
          </p>
          <Link
            href={`/catalogue/${slug}`}
            className="shrink-0 border-2 border-black bg-black px-6 py-3.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-white transition-colors motion-reduce:transition-none hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
          >
            Parcourir tout le fonds
          </Link>
        </Container>
      </section>
    </>
  );
}

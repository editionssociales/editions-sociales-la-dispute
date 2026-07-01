import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
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
      <section
        className="border-b border-line"
        style={{ background: `color-mix(in srgb, var(--color-${info.accent}) 8%, var(--color-paper))` }}
      >
        <Container className="py-16">
          <p
            className="text-sm font-semibold uppercase tracking-[0.18em]"
            style={{ color: `var(--color-${info.accent})` }}
          >
            {info.name}
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold sm:text-5xl">
            {info.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">{info.description}</p>
          <p className="mt-6 text-sm text-muted">
            {books.length} titres · <a href={info.legacyUrl} className="underline" target="_blank" rel="noreferrer">site historique</a>
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-serif text-2xl font-semibold">Parutions récentes</h2>
          <Link href={`/catalogue/${slug}`} className="text-sm font-semibold text-es hover:underline">
            Tout le catalogue →
          </Link>
        </div>
        <BookGrid books={books.slice(0, 8)} />
      </Container>
    </>
  );
}

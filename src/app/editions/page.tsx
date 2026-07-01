import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { EDITION_LIST } from "@/lib/editions";
import { countBooks } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Nos collections",
  description: "Les fonds Éditions sociales et La Dispute, au sein d'une même maison.",
};

export const dynamic = "force-dynamic";

export default async function EditionsPage() {
  const counts = await Promise.all(
    EDITION_LIST.map((e) => countBooks(e.slug)),
  );

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold">Nos collections</h1>
        <p className="mt-3 text-ink-soft">
          Deux fonds éditoriaux, chacun avec son identité, réunis dans le même
          catalogue.
        </p>
      </header>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {EDITION_LIST.map((e, i) => (
          <section
            key={e.slug}
            className="flex flex-col rounded-lg border border-line bg-white/40 p-8"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              {e.name}
            </span>
            <h2 className="mt-2 font-serif text-2xl font-semibold">{e.tagline}</h2>
            <p className="mt-3 flex-1 text-ink-soft">{e.description}</p>
            <p className="mt-4 text-sm text-muted">{counts[i]} titres au catalogue</p>
            <div className="mt-5 flex gap-3">
              <Link
                href={`/editions/${e.slug}`}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:opacity-90"
              >
                Découvrir
              </Link>
              <Link
                href={`/catalogue/${e.slug}`}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-paper-2"
              >
                Le catalogue
              </Link>
            </div>
          </section>
        ))}
      </div>
    </Container>
  );
}

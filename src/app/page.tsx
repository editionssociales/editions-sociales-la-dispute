import Link from "next/link";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { getNewReleases, countBooks } from "@/lib/catalogue";
import { countProducts } from "@/lib/boutique";
import { EDITION_LIST } from "@/lib/editions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [newReleases, totalBooks, totalProducts] = await Promise.all([
    getNewReleases(8),
    countBooks(),
    countProducts(),
  ]);

  return (
    <>
      {/* Héro — la fusion */}
      <section className="border-b border-line">
        <Container className="grid gap-10 py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-es">
              Éditions sociales · La Dispute
            </p>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Deux maisons,
              <br />
              un seul catalogue.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Les Éditions sociales et La Dispute réunissent {totalBooks} titres
              de pensée critique, de philosophie et de sciences sociales — et une
              boutique commune de {totalProducts} références.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/catalogue" className="rounded-full bg-es px-6 py-3 text-sm font-semibold text-white hover:bg-es-dark">
                Explorer le catalogue
              </Link>
              <Link href="/souscription" className="rounded-full px-6 py-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:text-es">
                Soutenir la souscription
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            {EDITION_LIST.map((e) => (
              <Link
                key={e.slug}
                href={`/editions/${e.slug}`}
                className="group rounded-lg border border-line bg-white/40 p-6 transition-colors hover:border-ink/30"
              >
                <span
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: `var(--color-${e.accent})` }}
                >
                  {e.name}
                </span>
                <p className="mt-1 font-serif text-lg font-medium">{e.tagline}</p>
                <span className="mt-2 inline-block text-sm text-es group-hover:underline">
                  Découvrir →
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Nouveautés */}
      <Container className="py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold">Nouveautés</h2>
            <p className="mt-1 text-ink-soft">Les dernières parutions des deux maisons.</p>
          </div>
          <Link href="/catalogue" className="text-sm font-semibold text-es hover:underline">
            Tout le catalogue →
          </Link>
        </div>
        <BookGrid books={newReleases} />
      </Container>

      {/* Souscription */}
      <section className="border-y border-line bg-paper-2">
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl font-semibold">
              Une souscription pour un nouveau départ
            </h2>
            <p className="mt-3 text-ink-soft">
              Aidez-nous à financer la réunion des deux maisons : un site commun,
              un catalogue unifié et une boutique repensée.
            </p>
          </div>
          <Link href="/souscription" className="shrink-0 rounded-full bg-es px-6 py-3 text-sm font-semibold text-white hover:bg-es-dark">
            Participer
          </Link>
        </Container>
      </section>
    </>
  );
}

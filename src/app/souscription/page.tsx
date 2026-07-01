import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { getNewReleases, countBooks } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "Soutenez le lancement des Éditions sociales x La Dispute : campagne de souscription.",
};

export const dynamic = "force-dynamic";

const PALIERS = [
  { montant: "25 €", titre: "Ami·e", desc: "Un grand merci, et votre nom sur la page des soutiens." },
  { montant: "50 €", titre: "Lecteur·rice", desc: "Un livre du catalogue au choix parmi une sélection." },
  { montant: "120 €", titre: "Souscripteur·rice", desc: "Trois ouvrages, et l'accès en avant-première aux nouveautés." },
  { montant: "300 €", titre: "Mécène", desc: "Un abonnement d'un an à toutes les parutions." },
];

const FAQ = [
  {
    q: "À quoi va servir ma contribution ?",
    a: "À financer le nouveau site, le catalogue unifié et la boutique en ligne repensée, ainsi que l'impression des ouvrages à paraître.",
  },
  {
    q: "Quand le nouveau site sera-t-il en ligne ?",
    a: "Le catalogue et la page de souscription ouvrent dès maintenant ; la boutique intégrée suit dans un second temps.",
  },
  {
    q: "Puis-je choisir mes livres pour les paliers Lecteur·rice et Souscripteur·rice ?",
    a: "Oui, une sélection vous sera proposée après votre contribution.",
  },
];

export default async function SouscriptionPage() {
  const [newReleases, totalBooks] = await Promise.all([
    getNewReleases(4),
    countBooks(),
  ]);

  return (
    <>
      {/* Héro — grand format, c'est l'entrée principale du site pendant le lancement */}
      <section className="bg-ink text-paper">
        <Container className="py-24 sm:py-32">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-paper/70">
            Souscription de lancement
          </p>
          <h1 className="mt-4 max-w-4xl font-serif text-5xl font-semibold leading-[1.05] sm:text-6xl">
            Un nouveau chapitre pour la pensée critique
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-paper/85 sm:text-xl">
            {`Les Éditions sociales et La Dispute rejoignent une même maison. Pour financer ce nouveau départ — catalogue unifié, boutique repensée, ${totalBooks} titres réunis — nous lançons une souscription. Chaque contribution compte, sans commission d'intermédiaire.`}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href="#paliers"
              className="inline-flex rounded-full bg-paper px-7 py-3.5 text-sm font-semibold text-ink hover:bg-paper/90"
            >
              Choisir un palier
            </a>
            <Link
              href="/catalogue"
              className="inline-flex rounded-full px-7 py-3.5 text-sm font-semibold text-paper ring-1 ring-inset ring-paper/40 hover:bg-paper/10"
            >
              Découvrir le catalogue
            </Link>
          </div>
        </Container>
      </section>

      {/* Pourquoi maintenant */}
      <Container className="py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Pourquoi cette souscription</h2>
            <p className="mt-3 text-ink-soft">
              Deux fonds indépendants de sciences sociales et de pensée
              critique unissent leurs moyens : un catalogue unifié, une
              boutique unique, un site à la hauteur de leurs textes. Ce
              rapprochement se prépare depuis plusieurs mois — la souscription
              en marque le lancement public.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">Où va votre argent</h2>
            <p className="mt-3 text-ink-soft">
              La construction du nouveau site et de la boutique, la migration
              du catalogue existant, et l&apos;impression des ouvrages à
              paraître dans les prochains mois.
            </p>
          </div>
        </div>
      </Container>

      {/* Paliers */}
      <section className="border-y border-line bg-paper-2" id="paliers">
        <Container className="py-16">
          <h2 className="font-serif text-2xl font-semibold">Les paliers</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Contributions directes, sans intermédiaire — 100&nbsp;% pour la
            maison.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PALIERS.map((p) => (
              <div
                key={p.montant}
                className="flex flex-col rounded-lg border border-line bg-paper p-6"
              >
                <span className="font-serif text-4xl font-semibold text-ink">{p.montant}</span>
                <span className="mt-1 font-semibold text-ink-soft">{p.titre}</span>
                <p className="mt-3 flex-1 text-sm text-ink-soft">{p.desc}</p>
                <button
                  type="button"
                  className="mt-5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:opacity-90"
                >
                  Contribuer
                </button>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Aperçu du catalogue */}
      {newReleases.length > 0 && (
        <Container className="py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-serif text-2xl font-semibold">En attendant, le catalogue vous attend</h2>
              <p className="mt-1 text-ink-soft">Dernières parutions des deux fonds réunis.</p>
            </div>
            <Link href="/catalogue" className="text-sm font-semibold text-ink hover:underline">
              Tout voir →
            </Link>
          </div>
          <BookGrid books={newReleases} />
        </Container>
      )}

      {/* FAQ */}
      <section className="border-t border-line">
        <Container className="max-w-3xl py-16">
          <h2 className="font-serif text-2xl font-semibold">Questions fréquentes</h2>
          <dl className="mt-6 space-y-6">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-ink">{item.q}</dt>
                <dd className="mt-1 text-ink-soft">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* CTA final */}
      <section className="bg-ink text-paper">
        <Container className="flex flex-col items-start gap-6 py-14 md:flex-row md:items-center md:justify-between">
          <h2 className="font-serif text-2xl font-semibold sm:text-3xl">
            Prêt·e à faire partie de l&apos;aventure ?
          </h2>
          <a
            href="#paliers"
            className="shrink-0 rounded-full bg-paper px-7 py-3.5 text-sm font-semibold text-ink hover:bg-paper/90"
          >
            Choisir un palier
          </a>
        </Container>
      </section>
    </>
  );
}

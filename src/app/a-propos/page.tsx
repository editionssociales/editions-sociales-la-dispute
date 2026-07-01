import type { Metadata } from "next";
import { Container } from "@/components/container";
import { EDITION_LIST } from "@/lib/editions";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Deux maisons d'édition de la pensée critique réunies dans une même structure.",
};

export default function AProposPage() {
  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold">Qui sommes-nous</h1>
        <p className="mt-4 text-lg text-ink-soft">
          Deux maisons d&apos;édition indépendantes de la pensée critique et des
          sciences sociales choisissent de se réunir dans une même structure,
          pour mutualiser leur catalogue, leur boutique et leurs moyens — sans
          rien perdre de ce qui fait leur singularité.
        </p>
      </header>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        {EDITION_LIST.map((e) => (
          <section key={e.slug}>
            <h2
              className="font-serif text-2xl font-semibold"
              style={{ color: `var(--color-${e.accent})` }}
            >
              {e.name}
            </h2>
            <p className="mt-3 text-ink-soft">{e.description}</p>
          </section>
        ))}
      </div>

      <section className="mt-14 max-w-2xl">
        <h2 className="font-serif text-2xl font-semibold">Le projet commun</h2>
        <p className="mt-3 text-ink-soft">
          Ce site réunit pour la première fois les deux catalogues et la boutique
          en un seul endroit : un catalogue filtrable par maison, collection et
          auteur, une librairie en ligne, et une page de souscription pour
          accompagner ce nouveau départ.
        </p>
      </section>
    </Container>
  );
}

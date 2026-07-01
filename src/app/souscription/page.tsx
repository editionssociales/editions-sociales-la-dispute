import type { Metadata } from "next";
import { Container } from "@/components/container";

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "Soutenez la réunion des Éditions sociales et de La Dispute : campagne de souscription.",
};

const PALIERS = [
  { montant: "25 €", titre: "Ami·e", desc: "Un grand merci + votre nom sur la page des soutiens." },
  { montant: "50 €", titre: "Lecteur·rice", desc: "Un livre du catalogue au choix parmi une sélection." },
  { montant: "120 €", titre: "Souscripteur·rice", desc: "Trois ouvrages + l'accès en avant-première aux nouveautés." },
  { montant: "300 €", titre: "Mécène", desc: "Un abonnement d'un an aux parutions des deux maisons." },
];

export default function SouscriptionPage() {
  return (
    <>
      <section className="border-b border-line bg-es text-white">
        <Container className="py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Campagne de souscription
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold sm:text-5xl">
            Aidez-nous à réunir deux maisons d&apos;édition
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/90">
            Les Éditions sociales et La Dispute unissent leurs forces. Pour lancer
            ce nouveau chapitre — un catalogue commun, une boutique unique, un site
            à notre image — nous avons besoin de vous.
          </p>
          <a
            href="#paliers"
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-es hover:bg-white/90"
          >
            Choisir un palier
          </a>
        </Container>
      </section>

      <Container className="py-16" id="paliers">
        <h2 className="font-serif text-2xl font-semibold">Les paliers</h2>
        <p className="mt-2 text-ink-soft">
          Contributions sans commission d&apos;intermédiaire — 100 % pour les
          maisons. Paiement Stripe (à brancher à l&apos;étape suivante).
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PALIERS.map((p) => (
            <div key={p.montant} className="flex flex-col rounded-lg border border-line bg-white/40 p-6">
              <span className="font-serif text-3xl font-semibold text-es">{p.montant}</span>
              <span className="mt-1 font-semibold">{p.titre}</span>
              <p className="mt-2 flex-1 text-sm text-ink-soft">{p.desc}</p>
              <button
                type="button"
                className="mt-5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Contribuer
              </button>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}

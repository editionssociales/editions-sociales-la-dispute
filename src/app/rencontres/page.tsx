import type { Metadata } from "next";
import { Container } from "@/components/container";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
};

export default function RencontresPage() {
  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold">Rencontres</h1>
        <p className="mt-3 text-ink-soft">
          Présentations d&apos;ouvrages, débats et rencontres avec les autrices et
          auteurs des deux maisons.
        </p>
      </header>

      <div className="mt-10 rounded-lg border border-dashed border-line bg-white/30 p-10 text-center text-muted">
        <p className="font-serif text-lg text-ink">Agenda à venir</p>
        <p className="mx-auto mt-2 max-w-md text-sm">
          Cette page accueillera l&apos;agenda des rencontres. Les événements
          pourront être gérés depuis le back-office, au même endroit que le
          catalogue.
        </p>
      </div>
    </Container>
  );
}

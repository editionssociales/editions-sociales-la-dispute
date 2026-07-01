import Link from "next/link";
import { Container } from "@/components/container";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-es">404</p>
      <h1 className="mt-4 font-serif text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-ink-soft">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-es px-5 py-2.5 text-sm font-semibold text-white hover:bg-es-dark"
      >
        Retour à l&apos;accueil
      </Link>
    </Container>
  );
}

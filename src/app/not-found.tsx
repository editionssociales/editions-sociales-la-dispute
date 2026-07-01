import Link from "next/link";
import { Container } from "@/components/container";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-ink">404</p>
      <h1 className="mt-4 font-serif text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-ink-soft">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/catalogue"
        className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90"
      >
        Retour à l&apos;accueil
      </Link>
    </Container>
  );
}

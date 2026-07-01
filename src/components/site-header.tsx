import Link from "next/link";
import { Container } from "./container";

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/editions", label: "Nos collections" },
  { href: "/rencontres", label: "Rencontres" },
  { href: "/a-propos", label: "À propos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
          Les Éditions sociales <span className="text-muted">x</span> La Dispute
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/souscription"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
        >
          Souscrire
        </Link>
      </Container>
    </header>
  );
}

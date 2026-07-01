import Link from "next/link";
import { Container } from "./container";

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/editions", label: "Les maisons" },
  { href: "/rencontres", label: "Rencontres" },
  { href: "/boutique", label: "Boutique" },
  { href: "/a-propos", label: "À propos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex flex-col leading-none">
          <span className="font-serif text-lg font-semibold tracking-tight">
            Éditions sociales
            <span className="text-muted"> · </span>
            La Dispute
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Une maison, deux catalogues
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-es"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/souscription"
          className="rounded-full bg-es px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-es-dark"
        >
          Souscrire
        </Link>
      </Container>
    </header>
  );
}

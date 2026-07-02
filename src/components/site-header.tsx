import Link from "next/link";
import { Container } from "./container";
import { ColorStripe } from "./color-stripe";
import { DesktopNav, MobileNav } from "./site-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <ColorStripe className="h-1" />
      <Container className="relative flex h-16 items-center justify-between gap-6">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
          Les Éditions sociales <span className="text-muted">x</span> La Dispute
        </Link>

        <DesktopNav />

        <div className="flex items-center gap-3">
          <Link
            href="/souscription"
            className="hidden rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 hover:opacity-90 md:inline-flex"
          >
            Souscrire
          </Link>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}

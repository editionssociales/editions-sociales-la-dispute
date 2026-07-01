import Link from "next/link";
import { Container } from "./container";
import { EDITION_LIST } from "@/lib/editions";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-paper-2">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-serif text-lg font-semibold">
            Éditions sociales · La Dispute
          </p>
          <p className="mt-3 max-w-xs text-sm text-ink-soft">
            Deux maisons d&apos;édition réunies&nbsp;: la pensée critique, les
            sciences sociales et le mouvement ouvrier.
          </p>
        </div>

        <nav aria-label="Catalogue" className="text-sm">
          <p className="mb-3 font-semibold uppercase tracking-wider text-muted">
            Catalogue
          </p>
          <ul className="space-y-2">
            <li>
              <Link href="/catalogue" className="text-ink-soft hover:text-es">
                Tous les livres
              </Link>
            </li>
            {EDITION_LIST.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/catalogue/${e.slug}`}
                  className="text-ink-soft hover:text-es"
                >
                  {e.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="La maison" className="text-sm">
          <p className="mb-3 font-semibold uppercase tracking-wider text-muted">
            La maison
          </p>
          <ul className="space-y-2">
            <li><Link href="/editions" className="text-ink-soft hover:text-es">Les deux maisons</Link></li>
            <li><Link href="/rencontres" className="text-ink-soft hover:text-es">Rencontres</Link></li>
            <li><Link href="/a-propos" className="text-ink-soft hover:text-es">À propos</Link></li>
            <li><Link href="/souscription" className="text-ink-soft hover:text-es">Souscription</Link></li>
          </ul>
        </nav>

        <nav aria-label="Boutique" className="text-sm">
          <p className="mb-3 font-semibold uppercase tracking-wider text-muted">
            Boutique
          </p>
          <ul className="space-y-2">
            <li><Link href="/boutique" className="text-ink-soft hover:text-es">La librairie</Link></li>
            <li><Link href="/panier" className="text-ink-soft hover:text-es">Panier</Link></li>
          </ul>
        </nav>
      </Container>
      <Container className="flex flex-col gap-2 border-t border-line py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Les Éditions sociales — La Dispute</p>
        <p>Site en reconstruction · squelette unifié</p>
      </Container>
    </footer>
  );
}

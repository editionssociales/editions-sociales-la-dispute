import Link from "next/link";
import { Container } from "./container";
import { ColorStripe } from "./color-stripe";
import { ACCENT_BG } from "@/lib/accents";
import { EDITION_LIST } from "@/lib/editions";

function ColTitle({ accent, children }: { accent: "navy" | "bottle" | "ocher" | "brick"; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 font-semibold uppercase tracking-wider text-muted">
      <span className={`h-1.5 w-1.5 rotate-45 ${ACCENT_BG[accent]}`} aria-hidden="true" />
      {children}
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-paper-2">
      <ColorStripe className="h-1" />
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-serif text-lg font-semibold">
            Les Éditions sociales <span className="text-muted">x</span> La Dispute
          </p>
          <p className="mt-3 max-w-xs text-sm text-ink-soft">
            La maison de la pensée critique, des sciences sociales et du
            mouvement ouvrier.
          </p>
          <p className="mt-4 text-xs text-muted">
            Deux maisons, une équipe — indépendantes depuis près de 30 ans.
          </p>
        </div>

        <nav aria-label="Catalogue" className="text-sm">
          <ColTitle accent="navy">Catalogue</ColTitle>
          <ul className="space-y-2">
            <li>
              <Link href="/catalogue" className="text-ink-soft hover:text-ink">
                Tous les livres
              </Link>
            </li>
            {EDITION_LIST.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/catalogue/${e.slug}`}
                  className="text-ink-soft hover:text-ink"
                >
                  {e.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/panier" className="text-ink-soft hover:text-ink">
                Panier
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="La maison" className="text-sm">
          <ColTitle accent="bottle">La maison</ColTitle>
          <ul className="space-y-2">
            <li><Link href="/editions" className="text-ink-soft hover:text-ink">Nos collections</Link></li>
            <li><Link href="/rencontres" className="text-ink-soft hover:text-ink">Rencontres</Link></li>
            <li><Link href="/a-propos" className="text-ink-soft hover:text-ink">À propos</Link></li>
          </ul>
        </nav>

        <nav aria-label="Souscription" className="text-sm">
          <ColTitle accent="brick">Souscription</ColTitle>
          <ul className="space-y-2">
            <li><Link href="/souscription" className="text-ink-soft hover:text-ink">Participer</Link></li>
          </ul>
          <Link
            href="/souscription"
            className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            Choisir un palier
          </Link>
        </nav>
      </Container>
      <Container className="flex flex-col gap-2 border-t border-line py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Les Éditions sociales x La Dispute</p>
      </Container>
    </footer>
  );
}

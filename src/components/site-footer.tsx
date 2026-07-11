import Link from "next/link";
import { FramedGrid } from "@/components/framed-grid";

/**
 * Pied de page brutaliste — même recette de quadrillage noir 2px que la
 * navbar (`grid gap-[2px] bg-black p-[2px]`, cellules enfant `bg-white`) :
 * gauche « Adresse » / « Mentions légales » empilées, cellule centrale vide,
 * droite « S'abonner à la newsletter » / « Diffusion-Distribution » empilées.
 *
 * Desktop (lg+) : 3 colonnes × 2 rangées — gauche | vide | droite.
 * Mobile : empilé — les 4 cellules de contenu pleine largeur (la cellule
 * vide n'a pas de contenu, elle est masquée).
 */

const CELL_CLASS = "flex flex-col gap-3 bg-white p-6 font-sans sm:p-7";
const HEADING_CLASS =
  "text-xs font-extrabold uppercase tracking-[.08em] text-black";
const BODY_CLASS = "text-sm leading-relaxed text-black/70";
const LINK_CLASS =
  "inline-flex w-fit font-bold text-black underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";

function AdresseCell({ className = "" }: { className?: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Adresse</p>
      <p className="text-base font-black italic uppercase leading-tight text-black">
        Les Éditions sociales <span className="not-italic text-black/40">×</span>{" "}
        La Dispute
      </p>
      <p className={BODY_CLASS}>
        La maison de la pensée critique, des sciences sociales et du
        mouvement ouvrier. Paris, France.
      </p>
      <nav aria-label="Liens utiles">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <li>
            <Link href="/a-propos" className={LINK_CLASS}>
              À propos
            </Link>
          </li>
          <li>
            <Link href="/panier" className={LINK_CLASS}>
              Panier
            </Link>
          </li>
          <li>
            <Link href="/souscription" className={LINK_CLASS}>
              Souscription
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function MentionsCell({ className = "", year }: { className?: string; year: number }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Mentions légales</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/mentions-legales" className={`${LINK_CLASS} text-sm`}>
          Consulter les mentions légales
        </Link>
        <Link href="/confidentialite" className={`${LINK_CLASS} text-sm`}>
          Confidentialité
        </Link>
        <Link href="/cgv" className={`${LINK_CLASS} text-sm`}>
          CGV &amp; dons
        </Link>
      </div>
      <p className="mt-auto text-xs text-black/60">
        © {year} Les Éditions sociales × La Dispute
      </p>
    </div>
  );
}

function NewsletterCell({ className = "" }: { className?: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>S&apos;abonner à la newsletter</p>
      <p className={BODY_CLASS}>
        Parutions, rencontres et souscriptions : l&apos;essentiel, une fois
        par mois.
      </p>
      <form
        action="#"
        method="get"
        className="mt-1 flex border-2 border-black"
      >
        <label htmlFor="footer-newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="footer-newsletter-email"
          name="email"
          type="email"
          required
          placeholder="vous@exemple.fr"
          className="min-w-0 flex-1 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40 focus-visible:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 border-l-2 border-black bg-black px-4 py-2 text-xs font-extrabold uppercase tracking-[.06em] text-white transition-colors motion-reduce:transition-none hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
        >
          S&apos;abonner
        </button>
      </form>
    </div>
  );
}

function DiffusionCell({ className = "" }: { className?: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Diffusion-Distribution</p>
      <p className={BODY_CLASS}>
        Vente directe et distribution indépendante — sans mécène ni
        actionnaire.
      </p>
      <Link href="/catalogue" className={`${LINK_CLASS} text-sm`}>
        Parcourir le catalogue
      </Link>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-black">
      {/* Mobile (< lg) : cellules empilées pleine largeur ; la cellule
          centrale vide n'a pas de contenu, elle est masquée. */}
      <FramedGrid className="grid-cols-1 lg:hidden">
        <AdresseCell />
        <MentionsCell year={year} />
        <NewsletterCell />
        <DiffusionCell />
      </FramedGrid>

      {/* Desktop (lg+) : gauche (Adresse / Mentions légales) | vide |
          droite (Newsletter / Diffusion-Distribution). */}
      <FramedGrid className="hidden grid-cols-[1fr_1fr_1fr] grid-rows-2 lg:grid">
        <AdresseCell className="col-start-1 row-start-1" />
        <MentionsCell className="col-start-1 row-start-2" year={year} />
        <div
          aria-hidden="true"
          className="col-start-2 row-span-2 row-start-1 bg-white"
        />
        <NewsletterCell className="col-start-3 row-start-1" />
        <DiffusionCell className="col-start-3 row-start-2" />
      </FramedGrid>
    </footer>
  );
}

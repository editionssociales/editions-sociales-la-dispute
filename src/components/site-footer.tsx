import Link from "next/link";
import { FramedGrid } from "@/components/framed-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { NAV_BOUTIQUE, NAV_HOUSES, NAV_SECTIONS } from "@/lib/nav";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import type { ReglagesSiteContent, ReseauSocial } from "@/lib/site-content-core";

/**
 * Pied de page brutaliste — même recette de quadrillage noir 2px que la
 * navbar (`grid gap-[2px] bg-ink p-[2px]`, cellules enfant `bg-paper`) :
 * gauche « Adresse » / « Mentions légales » empilées, cellule centrale vide,
 * droite « S'abonner à la newsletter » / « Diffusion-Distribution » empilées.
 *
 * Desktop (lg+) : 3 colonnes × 2 rangées — gauche | vide | droite.
 * Mobile : empilé — les 4 cellules de contenu pleine largeur (la cellule
 * vide n'a pas de contenu, elle est masquée).
 *
 * Textes « Adresse »/« Diffusion » et liens réseaux sociaux : global
 * `pages-legales` (spec « éditeur de contenus »), descendus en props depuis
 * le layout — défauts durs dans `site-content-core.ts`, iso-rendu à global
 * vide. Sans réseau social saisi, la cellule centrale reste la cellule vide
 * décorative d'origine ; sinon elle devient la cellule « Suivez-nous »
 * (footer uniquement — jamais dans le header, décision documentée).
 *
 * Plan du site (chantier 3 §2) : la cellule « Adresse » porte deux groupes de
 * liens — « Explorer » (les deux maisons, la Boutique, l'Agenda — les hrefs
 * viennent de `lib/nav`, source unique) et « Pratique » (à propos, panier,
 * souscription, contact). Épure minimaliste : les deux groupes n'ont plus de
 * sous-titre visible (une info de navigation n'apporte rien) — seul
 * `aria-label` (« Explorer » / « Pratique ») distingue encore les deux `nav`
 * pour les technologies d'assistance.
 */

const CELL_CLASS = "flex flex-col gap-3 bg-paper p-6 font-sans sm:p-7";
const HEADING_CLASS =
  "text-xs font-extrabold uppercase tracking-[.08em] text-ink";
const BODY_CLASS = "text-sm leading-relaxed text-muted";
const LINK_CLASS =
  "inline-flex w-fit font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

const AGENDA_HREF = NAV_SECTIONS.find((section) => section.id === "agenda")!.href;

function AdresseCell({ className = "", adresse }: { className?: string; adresse: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Adresse</p>
      <p className="text-base font-black italic uppercase leading-tight text-ink">
        Les Éditions sociales <span className="not-italic text-ink/40">×</span>{" "}
        La Dispute
      </p>
      <p className={BODY_CLASS}>{adresse}</p>

      <nav aria-label="Explorer" className="mt-1">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {NAV_HOUSES.map((house) => (
            // Clef = label (convention posée quand les deux hrefs étaient
            // identiques ; le label reste la clef stable de `NAV_HOUSES`).
            <li key={house.label}>
              <Link href={house.href} className={LINK_CLASS}>
                {house.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href={NAV_BOUTIQUE.href} className={LINK_CLASS}>
              {NAV_BOUTIQUE.label}
            </Link>
          </li>
          <li>
            <Link href={AGENDA_HREF} className={LINK_CLASS}>
              Agenda
            </Link>
          </li>
        </ul>
      </nav>

      {/* « À propos » a disparu de cette liste : la page commune est
          supprimée (retour client 2026-07-23), les pages maisons de la nav
          « Explorer » ci-dessus portent désormais la présentation. */}
      <nav aria-label="Pratique" className="mt-2">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
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
          <li>
            <Link href="/contact" className={LINK_CLASS}>
              Contact
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
      <p className="mt-auto text-xs text-muted">
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
      <NewsletterForm />
    </div>
  );
}

function DiffusionCell({ className = "", texte }: { className?: string; texte: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Diffusion-Distribution</p>
      <p className={BODY_CLASS}>{texte}</p>
      <Link href="/catalogue" className={`${LINK_CLASS} text-sm`}>
        Parcourir le catalogue
      </Link>
    </div>
  );
}

function ReseauxCell({
  className = "",
  reseaux,
}: {
  className?: string;
  reseaux: ReseauSocial[];
}) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Suivez-nous</p>
      <nav aria-label="Réseaux sociaux">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm lg:flex-col">
          {reseaux.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function SiteFooter({ footer }: { footer: ReglagesSiteContent["footer"] }) {
  const year = new Date().getFullYear();
  const reseaux = footer.reseauxSociaux;

  return (
    <footer className="bg-ink">
      {/* Mobile (< lg) : cellules empilées pleine largeur ; la cellule
          centrale vide n'a pas de contenu, elle est masquée — la cellule
          « Suivez-nous » n'apparaît que si des réseaux sont saisis. */}
      <FramedGrid className="grid-cols-1 lg:hidden">
        <AdresseCell adresse={footer.adresse} />
        <MentionsCell year={year} />
        <NewsletterCell />
        <DiffusionCell texte={footer.texteDiffusion} />
        {reseaux.length > 0 && <ReseauxCell reseaux={reseaux} />}
      </FramedGrid>

      {/* Desktop (lg+) : gauche (Adresse / Mentions légales) | centre (vide,
          ou « Suivez-nous » si des réseaux sont saisis) | droite (Newsletter /
          Diffusion-Distribution). */}
      <FramedGrid className="hidden grid-cols-[1fr_1fr_1fr] grid-rows-2 lg:grid">
        <AdresseCell className="col-start-1 row-start-1" adresse={footer.adresse} />
        <MentionsCell className="col-start-1 row-start-2" year={year} />
        {reseaux.length > 0 ? (
          <ReseauxCell
            className="col-start-2 row-span-2 row-start-1"
            reseaux={reseaux}
          />
        ) : (
          <div
            aria-hidden="true"
            className="col-start-2 row-span-2 row-start-1 bg-paper"
          />
        )}
        <NewsletterCell className="col-start-3 row-start-1" />
        <DiffusionCell className="col-start-3 row-start-2" texte={footer.texteDiffusion} />
      </FramedGrid>
    </footer>
  );
}

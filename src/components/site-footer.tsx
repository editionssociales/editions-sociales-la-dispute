import Link from "next/link";
import { FramedGrid } from "@/components/framed-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { NAV_HOUSES, NAV_SECTIONS } from "@/lib/nav";
import {
  buildMailto,
  CONTACT_EMAIL,
  NEWSLETTER_MAILTO_SUBJECT,
} from "@/lib/contact-address";
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

/**
 * Adresse publique de la maison — UNE LIGNE dans la cellule « Adresse »
 * (épure du pied de page), à côté de l'adresse postale. Elle ne dépend pas de
 * Brevo : c'est le seul moyen de joindre la maison qui tienne dans tous les
 * états de provisioning, et le site n'en affichait aucun jusqu'ici.
 */
const CONTACT_MAILTO = buildMailto().href;

function AdresseCell({ className = "", adresse }: { className?: string; adresse: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Adresse</p>
      <p className="text-base font-black italic uppercase leading-tight text-ink">
        Les Éditions sociales <span className="not-italic text-ink/40">×</span>{" "}
        La Dispute
      </p>
      <p className={BODY_CLASS}>{adresse}</p>
      <a href={CONTACT_MAILTO} className={`${LINK_CLASS} text-sm`}>
        {CONTACT_EMAIL}
      </a>

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
          {/* Plus de lien « Boutique » (retour client 2026-07-23) : la page
              liste est supprimée, les goodies vivent au checkout du panier. */}
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

/**
 * Repli sans Brevo — le double opt-in EST la liste Brevo : sans clé, il n'y a
 * aucun dispositif d'inscription, seulement un champ qui échouerait en
 * silence. On rend donc une invitation honnête à écrire, objet pré-rempli.
 * AUCUNE mention de sous-traitance ici : rien n'est transmis à Brevo sur ce
 * chemin, la mention du formulaire (`NewsletterForm`) n'aurait plus d'objet —
 * elle suit l'état réel plutôt que de survivre par habitude.
 */
function NewsletterByEmail() {
  const { href } = buildMailto({ subject: NEWSLETTER_MAILTO_SUBJECT });

  return (
    <>
      <p className={BODY_CLASS}>
        L&apos;inscription en ligne n&apos;est pas encore en service. Écrivez-nous,
        nous vous inscrivons à la main :
      </p>
      <a href={href} className={`${LINK_CLASS} text-sm`}>
        {CONTACT_EMAIL}
      </a>
    </>
  );
}

/**
 * Cellule newsletter — SANS phrase de présentation (« Parutions, rencontres et
 * souscriptions… », supprimée sur retour Clara 2026-08-07) : le titre de la
 * cellule et la mention Brevo sous le champ (`NewsletterForm`) disent déjà tout
 * ce qu'il y a à dire.
 *
 * `enabled` (descendu du layout, jamais lu ici — cf. `SiteFooter`) aiguille
 * entre le formulaire à double opt-in et le repli manuel.
 */
function NewsletterCell({ className = "", enabled }: { className?: string; enabled: boolean }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>S&apos;abonner à la newsletter</p>
      {enabled ? <NewsletterForm /> : <NewsletterByEmail />}
    </div>
  );
}

/**
 * Cellule diffusion — titre + sortie catalogue seuls. La phrase « Vente directe
 * et distribution indépendante… » est supprimée (retour Clara 2026-08-07) ;
 * elle venait du global `pages-legales`, dont le champ `texteDiffusion` est
 * retiré avec elle (`mergeReglagesSite` retombait sur le défaut dur pour tout
 * champ vidé, la suppression n'était donc PAS faisable depuis /admin).
 */
function DiffusionCell({ className = "" }: { className?: string }) {
  return (
    <div className={`${CELL_CLASS} ${className}`}>
      <p className={HEADING_CLASS}>Diffusion-Distribution</p>
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

export function SiteFooter({
  footer,
  newsletterEnabled,
}: {
  footer: ReglagesSiteContent["footer"];
  /**
   * `true` quand la chaîne e-mail est provisionnée (`brevoConfigured()`, lu
   * dans le layout) — le composant reste de pure présentation et ne lit ni
   * l'environnement ni le réseau (`src/components/CLAUDE.md`).
   */
  newsletterEnabled: boolean;
}) {
  const year = new Date().getFullYear();
  const reseaux = footer.reseauxSociaux;

  return (
    <footer className="bg-ink">
      {/* UNE SEULE grille, responsive (#91) : deux `FramedGrid` séparés
          (`lg:hidden` / `hidden lg:grid`) montaient chacun leur PROPRE
          `NewsletterForm` en permanence — CSS `hidden` ne démonte rien, les
          deux instances vivaient dans le DOM à la fois, et franchir `lg` en
          cours de saisie perdait le champ (la copie visible changeait sous
          le doigt). Mobile (< lg) : cellules empilées dans l'ordre de
          lecture — la cellule « Suivez-nous » n'apparaît que si des réseaux
          sont saisis. Desktop (lg+) : placement EXPLICITE par cellule
          (gauche Adresse/Mentions, centre vide ou Suivez-nous, droite
          Newsletter/Diffusion) — l'ordre du DOM (mobile) n'a pas besoin de
          suivre l'ordre visuel desktop, chaque cellule porte son propre
          `lg:col-start`/`lg:row-start`. */}
      <FramedGrid className="grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] lg:grid-rows-2">
        <AdresseCell className="lg:col-start-1 lg:row-start-1" adresse={footer.adresse} />
        <MentionsCell className="lg:col-start-1 lg:row-start-2" year={year} />
        <NewsletterCell className="lg:col-start-3 lg:row-start-1" enabled={newsletterEnabled} />
        <DiffusionCell className="lg:col-start-3 lg:row-start-2" />
        {reseaux.length > 0 ? (
          <ReseauxCell
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
            reseaux={reseaux}
          />
        ) : (
          <div
            aria-hidden="true"
            className="hidden bg-paper lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block"
          />
        )}
      </FramedGrid>
    </footer>
  );
}

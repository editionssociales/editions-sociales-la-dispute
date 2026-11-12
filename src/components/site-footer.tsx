import Link from "next/link";
import { FramedGrid } from "@/components/framed-grid";
import { NewsletterForm } from "@/components/newsletter-form";
import { NewTabMark } from "@/components/new-tab-mark";
import { NAV_HOUSES, NAV_SECTIONS } from "@/lib/nav";
import {
  buildMailto,
  CONTACT_EMAIL,
  NEWSLETTER_MAILTO_SUBJECT,
} from "@/lib/contact-address";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import type { ReglagesSiteContent, ReseauSocial } from "@/lib/site-content-core";

/**
 * Pied de page brutaliste COMPACT (demande client : « les rectangles du bas
 * prennent beaucoup de place ») — même recette de quadrillage noir 2px que la
 * navbar (`FramedGrid`, cellules enfant `bg-paper`), mais UNE seule rangée en
 * desktop : Adresse (plus large) · Newsletter · Diffusion + Suivez-nous
 * empilés · Mentions. Tablette : 2 colonnes (Adresse et Mentions pleine
 * largeur). Mobile : empilé.
 *
 * Textes « Adresse » et liens réseaux sociaux : global `pages-legales`,
 * descendus en props depuis le layout (défauts durs dans
 * `site-content-core.ts`). La cellule « Suivez-nous » n'existe que si des
 * réseaux sont saisis (footer uniquement — jamais dans le header). Les liens
 * « Explorer » et « Pratique » forment une seule `nav` à retour à la ligne.
 */

const CELL_CLASS = "flex flex-col gap-2 bg-paper px-5 py-4 font-sans sm:px-6";
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
      <p className="text-sm font-black italic uppercase leading-tight text-ink">
        Les Éditions sociales <span className="not-italic text-ink/40">×</span>{" "}
        La Dispute
      </p>
      <p className={`${BODY_CLASS} leading-snug`}>{adresse}</p>
      <a href={CONTACT_MAILTO} className={`${LINK_CLASS} text-sm`}>
        {CONTACT_EMAIL}
      </a>

      {/* UNE seule nav (compacité, demande client) : « Explorer » puis
          « Pratique », mêmes liens, même ordre. Plus de lien « Boutique »
          (retour client 2026-07-23) : la page liste est supprimée, les
          goodies vivent au checkout du panier ; « À propos » a disparu
          aussi (page commune supprimée), les pages maisons portent la
          présentation. */}
      <nav aria-label="Plan du site">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {NAV_HOUSES.map((house) => (
            // Clef = label (le label reste la clef stable de `NAV_HOUSES`).
            <li key={house.label}>
              <Link href={house.href} className={LINK_CLASS}>
                {house.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href={AGENDA_HREF} className={LINK_CLASS}>
              Agenda
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
      <div className="flex flex-wrap gap-x-4 gap-y-1">
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
      <p className="text-xs text-muted">
        © {year} Les Éditions sociales × La Dispute
      </p>
      {/* Signature de l'atelier (demande client 2026-08-31) — même registre
          discret que le copyright, jamais plus. */}
      <p className="text-xs text-muted">
        Site créé par{" "}
        <a
          href="https://www.solidz.fr"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          Solidz — www.solidz.fr
          <NewTabMark />
        </a>
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
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {reseaux.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                {r.label}
                <NewTabMark />
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
          cours de saisie perdait le champ. Ordre du DOM = ordre de lecture
          mobile = ordre visuel desktop (aucun placement explicite). */}
      <FramedGrid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.4fr_minmax(20rem,1.3fr)_1fr_1fr]">
        <AdresseCell className="sm:col-span-2 xl:col-span-1" adresse={footer.adresse} />
        <NewsletterCell enabled={newsletterEnabled} />
        {/* Diffusion + Suivez-nous empilés dans UNE colonne : sous-grille au
            même filet de 2px ; Diffusion seule sans réseau saisi. */}
        <div className="grid gap-[2px] bg-ink">
          <DiffusionCell />
          {reseaux.length > 0 ? <ReseauxCell reseaux={reseaux} /> : null}
        </div>
        <MentionsCell className="sm:col-span-2 xl:col-span-1" year={year} />
      </FramedGrid>
    </footer>
  );
}

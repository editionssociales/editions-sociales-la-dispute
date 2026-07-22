import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { EDITIONS } from "@/lib/editions";
import type { EditionSlug } from "@/lib/types";
import { FramedGrid } from "@/components/framed-grid";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { getPageAPropos, getReglagesSite } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "À propos",
  description: "La maison de la pensée critique et des sciences sociales.",
  alternates: { canonical: "/a-propos" },
};

/**
 * Page « Qui sommes-nous ? » commune aux deux maisons — gabarit repris de la
 * maquette PDF client (2026-07-20, `_specs/qui-sommes-nous-maquette-*.pdf`),
 * dans cet ordre strict : bandeau-titre sur aplat pop-teal → encadré de texte
 * principal (justifié) → boîte réseaux sociaux (le « logo des réseaux » de la
 * maquette) → bandeau ÉQUIPE | DÉPÔT DE MANUSCRIT sur pop-teal → deux
 * colonnes encadrées. Rien d'autre : la maquette ne comporte ni cartes
 * maisons, ni citation, ni sections libres.
 *
 * Arbitrages maquette (à confirmer en validation client) :
 * - La maquette existe en 2 variantes mono-maison (teal = page « QUI
 *   SOMMES-NOUS ? », orange = page « MAKE MARXISM GREAT AGAIN ! ») ; cette
 *   page étant commune, on suit la variante teal — celle qui porte le titre.
 * - Aplats sur les tokens pop existants (#5fd0c4) plutôt que le #80D4CE
 *   mesuré dans le PDF : même palette DA, une seule source de couleurs (R1) —
 *   l'écart vient vraisemblablement de l'export PDF.
 * - Les titres du gabarit sont en gras DROIT (pas l'italique maison) — suivi.
 * - « Titre de la souscription » + lorem de l'encadré principal = remplissage
 *   InDesign → contenu réel CMS (`herosTitre`/`herosIntro`, /admin) dans la
 *   même boîte, en attendant le copy définitif de l'équipe souscription.
 *
 * ⚠️ Attribution des bureaux éditoriaux : les 2 variantes du PDF répètent la
 * même phrase d'intro (« Les éditions La Dispute sont composées… ») avec des
 * listes différentes — source non fiable pour trancher qui est qui. La
 * répartition ci-dessous (antérieure à la maquette) est conservée telle
 * quelle ; à confirmer avec le client avant tout changement.
 */
const EQUIPE_PERMANENTE =
  "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes";
const BUREAUX: { slug: EditionSlug; membres: string }[] = [
  {
    slug: "la-dispute",
    membres:
      "Noémie Brun, Alexis Cukier, Jérôme Deauvieau, Pauline Delage, Étienne Douat, Amélie Jeammet, Danièle Kergoat, Aurore Koechlin, Richard Lagache, Clara Laspalas, Jacqueline Martinez, Marina Simonin et Hélène Stevens",
  },
  {
    slug: "editions-sociales",
    membres:
      "Alexia Blin, Yohann Douet, Isabelle Garo, Marion Leclair, Alix Bouffard, Alexandre Feron, Vincent Heimendinger, Antony Burlaud, Guillaume Fondu, Richard Lagache, Jean Quétier, Alexis Cukier et Quentin Fondu",
  },
];
const MANUSCRITS_EMAIL = "manuscritsldes@gmail.com";

/** Recette des liens inline sur paper (celle du footer), réunie ici une fois. */
const INLINE_LINK =
  "font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

/** Bandeau de sous-titre sur aplat pop-teal (gabarit) : centré, gras droit. */
const BAND_HEADING =
  "bg-pop-teal px-6 py-4 text-center font-sans text-base font-extrabold uppercase tracking-[.08em] text-ink sm:text-lg";

export default async function AProposPage() {
  // Global `page-a-propos` (titre + intro de l'encadré principal) +
  // `pages-legales` (liens réseaux sociaux, les mêmes que la cellule
  // « Suivez-nous » du footer). Global vide = textes en dur de
  // `site-content-core.ts`.
  const [content, reglages] = await Promise.all([
    getPageAPropos(),
    getReglagesSite(),
  ]);
  const reseaux = reglages.footer.reseauxSociaux;

  return (
    <>
      {/* 1. Bandeau-titre pleine largeur sur aplat pop-teal (gabarit) —
          composition bespoke hors PageHero, comme la home et la 404 :
          l'échelle fermée R6 n'a pas de ton « aplat pop ». */}
      <section className="border-b-2 border-ink bg-pop-teal">
        <Container className="py-[clamp(36px,6vw,72px)]">
          <h1 className="font-sans text-[clamp(36px,6vw,72px)] font-black uppercase leading-[0.95] text-ink">
            Qui sommes-nous&nbsp;?
          </h1>
        </Container>
      </section>

      {/* 2. Encadré de texte principal — une seule boîte à filet noir, corps
          justifié (seul bloc justifié du gabarit). */}
      <section>
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="border-2 border-ink bg-paper p-7 sm:p-10">
              <p className="font-sans text-xl font-extrabold leading-snug text-ink sm:text-2xl">
                {content.herosTitre}
              </p>
              <p className="mt-4 max-w-none text-justify text-[15px] leading-relaxed text-ink/80 sm:text-base">
                {content.herosIntro}
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* 3. Réseaux sociaux — la boîte « logo des réseaux » du gabarit :
          encadré étroit aligné à gauche, pas pleine largeur. Liens réels du
          global `pages-legales` ; aucune saisie = pas de boîte. */}
      {reseaux.length > 0 && (
        <section>
          <Container className="pb-12 sm:pb-16">
            <Reveal>
              <nav
                aria-label="Réseaux sociaux"
                className="w-fit border-2 border-ink bg-paper p-4 sm:p-5"
              >
                <ul className="flex flex-wrap gap-2">
                  {reseaux.map((r) => (
                    <li key={r.url}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex min-h-11 items-center border-2 border-ink px-4 py-2 font-sans text-xs font-bold uppercase tracking-[.05em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
                      >
                        {r.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </Reveal>
          </Container>
        </section>
      )}

      {/* 4+5. Bandeau ÉQUIPE | DÉPÔT DE MANUSCRIT sur pop-teal + les deux
          colonnes encadrées. Une seule FramedGrid : le gap ink de 2px fait le
          filet vertical continu bandeau→colonnes du gabarit ; en mobile,
          chaque colonne empile son bandeau puis son texte. */}
      <section className="border-t-2 border-ink">
        <Container className="py-12 sm:py-16">
          <FramedGrid className="md:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={BAND_HEADING}>Équipe</h2>
                <div className="flex flex-1 flex-col gap-5 border-t-2 border-ink p-6 text-[15px] leading-relaxed text-ink/80 sm:p-7">
                  <p>
                    Les Éditions sociales et La Dispute sont animées par une
                    équipe permanente&nbsp;: {EQUIPE_PERMANENTE}.
                  </p>
                  {BUREAUX.map((b) => (
                    <div key={b.slug}>
                      <p className="font-sans text-xs font-extrabold uppercase tracking-[.05em] text-ink">
                        Bureau éditorial — {EDITIONS[b.slug].name}
                      </p>
                      <p className="mt-1.5">{b.membres}.</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={120} className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={BAND_HEADING}>Dépôt de manuscrit</h2>
                <div className="flex flex-1 flex-col gap-4 border-t-2 border-ink p-6 text-[15px] leading-relaxed text-ink/80 sm:p-7">
                  <p>
                    Vous pouvez nous soumettre un manuscrit en nous contactant à{" "}
                    <a href={`mailto:${MANUSCRITS_EMAIL}`} className={INLINE_LINK}>
                      {MANUSCRITS_EMAIL}
                    </a>
                    . Pour cela, merci de nous faire parvenir un synopsis
                    contenant au minimum un résumé du manuscrit, une
                    présentation de l&apos;auteur·ice et une table des matières
                    indicative. Nos bureaux éditoriaux se réunissent et
                    discutent des projets soumis une fois par trimestre.
                  </p>
                  <p>
                    Nous recevons une très grande quantité de manuscrits, qui ne
                    nous permet malheureusement pas de répondre à chaque
                    proposition.
                  </p>
                </div>
              </div>
            </Reveal>
          </FramedGrid>
        </Container>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import type { EditionSlug } from "@/lib/types";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { POP_BG } from "@/components/pop-palette";
import { getPageAPropos, getReglagesSite } from "@/lib/site-content";

export const revalidate = 3600; // même fenêtre ISR que le reste du contenu Payload

/**
 * Page de présentation PAR MAISON (retour client 2026-07-23) : les cellules
 * « La Dispute » / « Les Éditions sociales » de la nav mènent chacune à sa
 * propre page — la page commune `/a-propos` est supprimée (redirigée vers
 * l'accueil). Gabarit repris de l'ex-`/a-propos` (maquette PDF client
 * 2026-07-20) : bandeau-titre sur aplat → encadré de texte principal
 * (justifié) → boîte réseaux sociaux → bandeau ÉQUIPE | DÉPÔT DE MANUSCRIT →
 * deux colonnes encadrées. L'aplat porte une des quatre couleurs du site
 * (`BAND_BG` ci-dessous) — classes littérales (contrat Tailwind JIT).
 *
 * Textes : nom/tagline/description viennent du global `page-a-propos`
 * (onglet Maisons, surcharge champ par champ — vide = `EDITION_LIST` en
 * dur, via `mergePageAPropos`).
 */

/**
 * Aplats des bandeaux — LES COULEURS DU SITE (retour Clara 2026-08-07 : ces
 * pages « n'utilisent pas les bonnes couleurs »), plus les accents de
 * couverture navy/brick de R3. Correspondance choisie sur la famille de teinte
 * de chaque maison, pour que le repère de couleur ne se retourne pas :
 * Éditions sociales gardait un bleu (navy → le « bleu » turquoise de la
 * palette), La Dispute un rouge (brick → orange). Texte `ink` obligatoire sur
 * ces quatre teintes claires (cf. `pop-palette.ts`) : le `text-paper` des
 * anciens aplats sombres tombe avec eux.
 */
const BAND_BG: Record<EditionSlug, string> = {
  "editions-sociales": POP_BG.teal,
  "la-dispute": POP_BG.orange,
};

/**
 * ⚠️ Attribution des bureaux éditoriaux : les 2 variantes du PDF maquette
 * répètent la même phrase d'intro avec des listes différentes — source non
 * fiable pour trancher qui est qui. La répartition ci-dessous (antérieure à
 * la maquette) est conservée telle quelle ; à confirmer avec le client
 * avant tout changement.
 */
const EQUIPE_PERMANENTE =
  "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes";
const BUREAUX: Record<EditionSlug, string> = {
  "la-dispute":
    "Noémie Brun, Alexis Cukier, Jérôme Deauvieau, Pauline Delage, Étienne Douat, Amélie Jeammet, Danièle Kergoat, Aurore Koechlin, Richard Lagache, Clara Laspalas, Jacqueline Martinez, Marina Simonin et Hélène Stevens",
  "editions-sociales":
    "Alexia Blin, Yohann Douet, Isabelle Garo, Marion Leclair, Alix Bouffard, Alexandre Feron, Vincent Heimendinger, Antony Burlaud, Guillaume Fondu, Richard Lagache, Jean Quétier, Alexis Cukier et Quentin Fondu",
};
const MANUSCRITS_EMAIL = "manuscritsldes@gmail.com";

/** Recette des liens inline sur paper (celle du footer), réunie ici une fois. */
const INLINE_LINK =
  "font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

/**
 * Bandeau de sous-titre sur l'aplat maison (gabarit) : centré, gras droit.
 * L'aplat vient de `BAND_BG` — la correspondance maison → couleur n'est écrite
 * qu'une fois.
 */
const BAND_HEADING_BASE =
  "px-6 py-4 text-center font-sans text-base font-extrabold uppercase tracking-[.08em] text-ink sm:text-lg";
const BAND_HEADING: Record<EditionSlug, string> = {
  "editions-sociales": `${BAND_BG["editions-sociales"]} ${BAND_HEADING_BASE}`,
  "la-dispute": `${BAND_BG["la-dispute"]} ${BAND_HEADING_BASE}`,
};

export function generateStaticParams() {
  return [{ slug: "editions-sociales" }, { slug: "la-dispute" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isEditionSlug(slug)) return {};
  const edition = EDITIONS[slug];
  return {
    title: edition.name,
    description: edition.tagline,
    alternates: { canonical: `/editions/${slug}` },
  };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isEditionSlug(slug)) notFound();

  // Global `page-a-propos` (textes des maisons, surcharge admin) +
  // `pages-legales` (liens réseaux sociaux, les mêmes que la cellule
  // « Suivez-nous » du footer). Global vide = textes en dur.
  const [content, reglages] = await Promise.all([
    getPageAPropos(),
    getReglagesSite(),
  ]);
  const maison = content.maisons.find((m) => m.slug === slug);
  if (!maison) notFound();
  const reseaux = reglages.footer.reseauxSociaux;

  return (
    <>
      {/* 1. Bandeau-titre pleine largeur sur l'aplat maison — composition
          bespoke hors PageHero, comme l'ex-/a-propos : l'échelle fermée R6
          n'a pas de ton « aplat ». */}
      <section className={`border-b-2 border-ink ${BAND_BG[slug]}`}>
        <Container className="py-[clamp(36px,6vw,72px)]">
          <h1 className="font-sans text-[clamp(36px,6vw,72px)] font-black uppercase leading-[0.95] text-ink">
            {maison.name}
          </h1>
        </Container>
      </section>

      {/* 2. Encadré de texte principal — une seule boîte à filet noir, corps
          justifié (seul bloc justifié du gabarit) + sortie vers le catalogue
          de la maison. */}
      <section>
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="border-2 border-ink bg-paper p-7 sm:p-10">
              <p className="font-sans text-xl font-extrabold leading-snug text-ink sm:text-2xl">
                {maison.tagline}
              </p>
              <p className="mt-4 max-w-none text-justify text-[15px] leading-relaxed text-ink/80 sm:text-base">
                {maison.description}
              </p>
              <Button
                href={`/catalogue/${slug}`}
                className="mt-6 w-fit px-5 py-3 text-[13px] tracking-[.04em]"
              >
                Découvrir le catalogue
              </Button>
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

      {/* 4+5. Bandeau ÉQUIPE | DÉPÔT DE MANUSCRIT sur l'aplat maison + les
          deux colonnes encadrées. Une seule FramedGrid : le gap ink de 2px
          fait le filet vertical continu bandeau→colonnes du gabarit ; en
          mobile, chaque colonne empile son bandeau puis son texte. Seul le
          bureau éditorial de LA maison affichée est listé. */}
      <section className="border-t-2 border-ink">
        <Container className="py-12 sm:py-16">
          <FramedGrid className="md:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={BAND_HEADING[slug]}>Équipe</h2>
                <div className="flex flex-1 flex-col gap-5 border-t-2 border-ink p-6 text-[15px] leading-relaxed text-ink/80 sm:p-7">
                  <p>
                    Les Éditions sociales et La Dispute sont animées par une
                    équipe permanente&nbsp;: {EQUIPE_PERMANENTE}.
                  </p>
                  <div>
                    <p className="font-sans text-xs font-extrabold uppercase tracking-[.05em] text-ink">
                      Bureau éditorial — {maison.name}
                    </p>
                    <p className="mt-1.5">{BUREAUX[slug]}.</p>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={120} className="h-full">
              <div className="flex h-full flex-col bg-paper">
                <h2 className={BAND_HEADING[slug]}>Dépôt de manuscrit</h2>
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

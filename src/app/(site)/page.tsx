import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { Reveal } from "@/components/reveal";
import { NouveautesCarousel } from "@/components/nouveautes-carousel";
import { getActiveHighlight } from "@/lib/highlight";
import { getNewReleases } from "@/lib/catalogue";
import { toNouveauteBooks } from "@/lib/nouveaute-book";

export const metadata: Metadata = {
  // Titre absolu : la vitrine porte le nom du site seul — jamais
  // « Accueil — … » (onglet et snippet Google plus lisibles).
  title: { absolute: "Les Éditions sociales × La Dispute" },
  description:
    "Les Éditions sociales × La Dispute : dernières parutions, catalogue unifié des deux maisons et souscription de lancement.",
  alternates: { canonical: "/" },
};

// Fenêtre ISR 24 h — filet seulement, la fraîcheur réelle vient des purges à
// l'édition (hooks) et au paiement (audit coûts Vercel 2026-08-23).
export const revalidate = 86400;

/**
 * Couleur du bandeau de mise en avant (`Highlight.couleur`, PR #29) →
 * classes littérales (contrat Tailwind JIT). Depuis la refonte (chantier 4
 * §3, R2), la couleur éditée ne peint plus un aplat de fond : elle devient
 * le LISERÉ du bloc éditorial — la palette pop reste un langage de nav, le
 * bandeau reste lisible (texte ink sur paper-2).
 */
const HIGHLIGHT_EDGE: Record<string, string> = {
  "pop-pink": "border-l-pop-pink",
  "pop-teal": "border-l-pop-teal",
  "pop-orange": "border-l-pop-orange",
  "pop-yellow": "border-l-pop-yellow",
};

export default async function HomePage() {
  const [releases, highlight] = await Promise.all([
    getNewReleases(12),
    getActiveHighlight(),
  ]);
  const books = toNouveauteBooks(releases);

  return (
    <div className="bg-paper pb-[clamp(38px,6vw,76px)] pt-[clamp(20px,3vw,36px)]">
      {/* Vitrine réduite aux couvertures seules (retour client 2026-07-23,
          référence La fabrique) : ni flèches, ni sortie catalogue, ni légende
          titre/auteur — et plus aucune section sous le carrousel (les blocs
          maisons et la mosaïque de nav ont été retirés). Le h1 unique de la
          page reste invisible (a11y/SEO seuls). Seul le bandeau Highlight
          survit : contenu ponctuel piloté depuis /admin, rien n'est rendu
          sans entrée active. */}
      <h1 className="sr-only">Les Éditions sociales × La Dispute</h1>

      <NouveautesCarousel books={books} showArrows={false} showCatalogueLink={false} />

      {/* Mise en avant ponctuelle (E6bis / PR #29) : une seule entrée active à
          la fois (collection Highlight — l'ex-bandeau souscription codé en dur
          est devenu une entrée semée par la migration `highlight_couleur_cta`).
          Deux rendus (chantier 4 §3, R2) : la campagne souscription (lien vers
          /souscription) garde l'identité du héros de la page de dons (bg-ink,
          eyebrow pop-yellow) ; toute autre mise en avant est un highlight
          éditorial bg-paper-2 bordé, la couleur choisie dans /admin en liseré
          (HIGHLIGHT_EDGE) — jamais un aplat pop (R2). Rien n'est rendu sans
          entrée active : aucun wrapper laissé derrière. */}
      {highlight &&
        (highlight.lien?.startsWith("/souscription") ? (
          <Container className="mt-[clamp(30px,4.5vw,60px)]">
            <Reveal>
              <div className="flex flex-col gap-6 bg-ink px-6 py-8 text-paper sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-9">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="font-sans text-[clamp(22px,2.8vw,34px)] font-black italic leading-[1.05] text-paper">
                    {highlight.titre}
                  </p>
                  {highlight.texte && (
                    <p className="mt-0.5 max-w-[56ch] text-sm text-paper/75">
                      {highlight.texte}
                    </p>
                  )}
                </div>
                <Button
                  href={highlight.lien}
                  variant="outline"
                  className="flex-none gap-2 whitespace-nowrap px-8 py-6 text-sm tracking-[.06em]"
                >
                  {highlight.lienLibelle?.trim() || "Souscrire"}{" "}
                  <span aria-hidden="true">→</span>
                </Button>
              </div>
            </Reveal>
          </Container>
        ) : (
          <Container className="mt-[clamp(48px,7vw,88px)]">
            <Reveal>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div
                  className={`flex min-w-0 flex-1 flex-col justify-center gap-1.5 border-2 border-ink border-l-4 bg-paper-2 px-6 py-6 sm:px-7 ${HIGHLIGHT_EDGE[highlight.couleur ?? "pop-pink"] ?? HIGHLIGHT_EDGE["pop-pink"]}`}
                >
                  <p className="font-sans text-[clamp(19px,2.2vw,28px)] font-black italic leading-[1.05] text-ink">
                    {highlight.titre}
                  </p>
                  {highlight.texte && (
                    <p className="mt-0.5 max-w-[56ch] text-sm text-ink/70">{highlight.texte}</p>
                  )}
                </div>
                {highlight.lien && (
                  <Button
                    href={highlight.lien}
                    className="flex-none items-center gap-2 whitespace-nowrap px-8 py-6 text-sm tracking-[.06em] sm:self-stretch"
                  >
                    {highlight.lienLibelle?.trim() || "En savoir plus"}{" "}
                    <span aria-hidden="true">→</span>
                  </Button>
                )}
              </div>
            </Reveal>
          </Container>
        ))}
    </div>
  );
}

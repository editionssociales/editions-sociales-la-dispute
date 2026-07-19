import type { ReactNode } from "react";
import { Reveal } from "./reveal";
import { Eyebrow } from "./eyebrow";
import { LEGAL_BODY } from "./legal-section";

/**
 * En-tête de page — le motif « eyebrow + h1 + chapeau », copié à la main dans
 * une quinzaine de fichiers avant ce composant, réduit à une échelle fermée
 * de 3 tons (R6) :
 * - `content` (défaut) : pages de contenu (~14 pages — légal, à propos,
 *   catalogue, boutique, panier…), fond clair.
 * - `system` : pages de confirmation/erreur d'un tunnel (merci, souscription
 *   /merci, /erreur, newsletter/confirmation), palier en dessous.
 * - `cover` : héros plein cadre en aplat de couleur (`/editions/[slug]`),
 *   seule variante sombre — avec la 404 (bespoke, hors PageHero) la seule
 *   exception nommée à cette échelle.
 *
 * Rythme interne fixe (eyebrow → titre → chapeau) ; le rythme vertical de LA
 * SECTION qui l'englobe (padding du `Container`) suit le couple canonique
 * documenté dans `LegalSection` — `py-12 sm:py-16` pour les pages listing et
 * légales, `py-16 sm:py-20` pour les pages éditoriales.
 */

export type PageHeroTone = "content" | "system" | "cover";

const TITLE_CLASS: Record<PageHeroTone, string> = {
  content: "font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl",
  system: "font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl",
  cover:
    "font-sans text-4xl font-black italic uppercase leading-[0.94] text-paper sm:text-6xl",
};

export function PageHero({
  eyebrow,
  title,
  intro,
  tone = "content",
  className = "max-w-3xl",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Chapeau au format commun (`LEGAL_BODY`) ; un chapeau qui déroge à cette
   *  recette (largeur, taille) passe par `children` plutôt que par cette prop. */
  intro?: ReactNode;
  tone?: PageHeroTone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Reveal>
      <div className={className}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className={eyebrow ? `mt-3 ${TITLE_CLASS[tone]}` : TITLE_CLASS[tone]}>{title}</h1>
        {intro && <p className={LEGAL_BODY}>{intro}</p>}
        {children}
      </div>
    </Reveal>
  );
}

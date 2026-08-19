import type { ReactNode } from "react";
import { Container } from "./container";
import type { SafeHtml } from "@/lib/cms-html";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

/**
 * Section des pages légales (mentions, confidentialité, CGV) — l'échafaudage
 * `border-t-2 → Container → h2` et le trio typographique qu'elles
 * redéclaraient à l'identique. Le texte (juridiquement sensible) reste dans
 * chaque page ; seule la structure est possédée ici — la prochaine page
 * légale (CGU ?) naît profonde au lieu d'être copiée-collée.
 *
 * Rythme vertical (R6/0.6) — échelle fermée à trois couples de padding de
 * section pour tout le site : `py-12 sm:py-16` ici et sur les pages listing
 * (catalogue, boutique, editions…) ; `py-16 sm:py-20` sur les pages
 * éditoriales (a-propos, héros plein cadre `/editions/[slug]`…), cf.
 * `PageHero` ; `py-20 sm:py-28` sur les pages système/tunnel (souscription
 * merci·erreur, `/merci`, `/newsletter/confirmation` — cf. `PageHero`
 * tone=system). Toute nouvelle section choisit l'un des trois, jamais une
 * quatrième valeur.
 */

const H2_CLASS =
  "font-sans text-2xl font-black italic leading-[0.98] text-ink sm:text-3xl";

/** Paragraphe courant des pages légales (corps + chapeau du héro). */
export const LEGAL_BODY = "mt-4 text-[15px] leading-relaxed text-ink/70";

/**
 * Lien dans un corps de texte légal — MÊME recette que ses deux jumelles
 * (`LINK_CLASS` du pied de page, `INLINE_LINK` de /editions/[slug]), anneau de
 * focus COMPRIS : elle en était la seule dépourvue, et son fond passe en ink au
 * survol, ce qui effaçait aussi l'anneau par défaut du navigateur. Le défaut
 * mordait au clavier sur /contact et sur l'inscription newsletter, où ce lien
 * porte la mention légale sous le champ.
 */
export const LEGAL_LINK =
  "font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-ink">
      <Container className="py-12 sm:py-16">
        <h2 className={H2_CLASS}>{title}</h2>
        {/* Mesure de lecture (R6) : 70ch, même contrat que LegalCmsBody. */}
        <div className="max-w-[70ch]">{children}</div>
      </Container>
    </section>
  );
}

/**
 * Corps de page légale édité dans `/admin` (global `pages-legales`) : HTML
 * déjà sanitisé (`SafeHtml`, fabriqué dans `src/lib`), stylé par le même
 * wrapper de prose que la fiche livre (`prose-book`, globals.css). Rendu
 * seulement quand l'onglet est rempli — sinon la page garde ses
 * `LegalSection` en dur.
 */
export function LegalCmsBody({ html }: { html: SafeHtml }) {
  return (
    <section className="border-t-2 border-ink">
      <Container className="py-12 sm:py-16">
        <div className="prose-book max-w-[70ch]" dangerouslySetInnerHTML={{ __html: html }} />
      </Container>
    </section>
  );
}

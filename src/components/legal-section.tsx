import type { ReactNode } from "react";
import { Container } from "./container";

/**
 * Section des pages légales (mentions, confidentialité, CGV) — l'échafaudage
 * `border-t-2 → Container → h2` et le trio typographique qu'elles
 * redéclaraient à l'identique. Le texte (juridiquement sensible) reste dans
 * chaque page ; seule la structure est possédée ici — la prochaine page
 * légale (CGU ?) naît profonde au lieu d'être copiée-collée.
 */

const H2_CLASS =
  "font-sans text-2xl font-black italic leading-[0.98] text-black sm:text-3xl";

/** Paragraphe courant des pages légales (corps + chapeau du héro). */
export const LEGAL_BODY = "mt-4 text-[15px] leading-relaxed text-black/70";

/** Lien dans un corps de texte légal. */
export const LEGAL_LINK =
  "font-bold text-black underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-black hover:text-white";

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-black">
      <Container className="py-12 sm:py-16">
        <h2 className={H2_CLASS}>{title}</h2>
        {children}
      </Container>
    </section>
  );
}

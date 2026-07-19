import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";

/**
 * Skeleton streamé pendant le rendu dynamique des vues catalogue
 * (searchParams) — reproduit la trame RÉELLE de la grille (`FramedGrid`,
 * hairline ink 2px) plutôt qu'un placeholder improvisé : la transition vers
 * le contenu chargé ne doit produire aucun saut visuel.
 */
export function CatalogueFallback() {
  return (
    <Container className="bg-paper py-12 sm:py-16">
      <div aria-busy="true" aria-live="polite">
        <div className="h-3 w-40 bg-paper-2" />
        <div className="mt-6 h-10 max-w-md bg-paper-2" />
        <div className="mt-6 h-10 w-full bg-paper-2" />
        <FramedGrid className="mt-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[2/3] bg-paper-2" />
          ))}
        </FramedGrid>
        <span className="sr-only">Chargement du catalogue…</span>
      </div>
    </Container>
  );
}

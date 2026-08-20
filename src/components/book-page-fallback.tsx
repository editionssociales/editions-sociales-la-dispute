import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";

/**
 * Skeleton des fiches livre/boutique (`catalogue/[edition]/[slug]/loading.tsx`,
 * `boutique/[slug]/loading.tsx`) — le point de contact le plus fréquent du
 * site (chaque clic de couverture) était le seul SANS filet : ces routes ISR
 * à `generateStaticParams` VIDE se génèrent à leur première visite (lecture
 * Postgres, cf. `src/app/CLAUDE.md`), clic sans aucun retour pendant ce
 * temps. Même vocabulaire que `CatalogueFallback` : la trame RÉELLE du
 * gabarit fiche (colonne couverture + boîte d'achat encadrées, colonne
 * texte), blocs `bg-paper-2`, jamais un spinner — le swap vers le contenu ne
 * doit produire aucun saut visuel. Mêmes classes d'ordre que la vraie page :
 * sous `lg`, le titre précède la couverture.
 */
export function BookPageFallback() {
  return (
    <Container className="bg-paper py-12 sm:py-16">
      <div aria-busy="true" aria-live="polite">
        <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
          <div className="order-2 mx-auto w-full max-w-[300px] lg:order-1 lg:mx-0 lg:max-w-none lg:self-start">
            {/* Couverture : cadre ink 2px de la vraie fiche, ratio 2/3 par
                défaut (le vrai ratio n'est pas encore connu — même repli que
                `cover.tsx`). */}
            <div className="aspect-[2/3] w-full border-2 border-ink bg-paper-2" />
            {/* Boîte d'achat : prix + CTA. */}
            <div className="mt-6 border-2 border-ink bg-paper p-4">
              <div className="h-8 w-24 bg-paper-2" />
              <div className="mt-3 h-11 w-full bg-paper-2" />
              <div className="mt-2 h-3 w-2/3 bg-paper-2" />
            </div>
            {/* Grille d'infos (parution/pages…). */}
            <FramedGrid className="mt-6 grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-16 bg-paper-2" />
              ))}
            </FramedGrid>
          </div>
          <div className="order-1 lg:order-2">
            <div className="h-10 max-w-md bg-paper-2" />
            <div className="mt-3 h-10 max-w-xs bg-paper-2" />
            <div className="mt-4 h-1 w-16 bg-ink" />
            <div className="mt-8 flex flex-col gap-3">
              <div className="h-4 w-full bg-paper-2" />
              <div className="h-4 w-full bg-paper-2" />
              <div className="h-4 w-5/6 bg-paper-2" />
              <div className="h-4 w-2/3 bg-paper-2" />
            </div>
          </div>
        </div>
        <span className="sr-only">Chargement de la fiche…</span>
      </div>
    </Container>
  );
}

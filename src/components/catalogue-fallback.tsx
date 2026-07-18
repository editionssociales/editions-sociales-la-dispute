import { Container } from "@/components/container";

/** Skeleton streamé pendant le rendu dynamique des vues catalogue (searchParams). */
export function CatalogueFallback() {
  return (
    <Container className="bg-white py-12">
      <div aria-busy="true" aria-live="polite">
        <div className="h-3 w-40 bg-black/10" />
        <div className="mt-6 h-10 max-w-md bg-black/10" />
        <div className="mt-8 h-24 w-full border-2 border-black/10 bg-black/[0.03]" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[2/3] border-2 border-black/10 bg-black/[0.03]" />
          ))}
        </div>
        <span className="sr-only">Chargement du catalogue…</span>
      </div>
    </Container>
  );
}

"use client";

import { Container } from "@/components/container";
import { Button } from "@/components/button";

/**
 * Filet de sécurité générique pour tout le groupe `(site)` — s'ajoute à
 * `catalogue/error.tsx` (plus précis sur ce segment) sans le remplacer :
 * l'imbrication Next choisit la frontière la plus proche de l'erreur, donc
 * `catalogue/error.tsx` reste prioritaire pour `catalogue`/`catalogue/[edition]`.
 * Sans cette frontière-ci, toute exception non gérée d'une autre route du front (import
 * dynamique cassé, erreur de rendu inattendue) tomberait sur la page d'erreur
 * 500 générique de Next plutôt que sur un état dégradé cohérent avec le site.
 * L'erreur est déjà journalisée côté Sentry sans action ici (`onRequestError`,
 * `src/instrumentation.ts` — `OPERATIONS.md` §2).
 */
export default function SiteError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <Container className="bg-white py-24 text-center sm:py-32">
      <h1 className="font-sans text-3xl font-black italic text-black sm:text-4xl">
        Une erreur est survenue
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-black/70">
        La page n&apos;a pas pu s&apos;afficher. Réessayez, ou revenez à
        l&apos;accueil.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => unstable_retry()} className="px-7 py-3.5 text-sm tracking-[.04em]">
          Réessayer
        </Button>
        <Button href="/" variant="outline" className="px-7 py-3.5 text-sm tracking-[.04em]">
          Retour à l&apos;accueil
        </Button>
      </div>
    </Container>
  );
}

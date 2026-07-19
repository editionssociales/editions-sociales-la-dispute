"use client";

import { Container } from "@/components/container";
import { Button } from "@/components/button";

/**
 * Limite de dégât pour `/catalogue` et `/catalogue/[edition]` : ces deux
 * routes lisent `searchParams` et sont donc rendues **dynamiquement à chaque
 * requête** (`src/app/CLAUDE.md`) — sans cette frontière, une lecture
 * Payload/Postgres en échec remonterait jusqu'à la page d'erreur 500
 * générique de Next pour CHAQUE visiteur de la fenêtre. Avec cette
 * frontière : un message dégradé, un bouton « réessayer » (`unstable_retry` :
 * re-fetch + re-rendu du segment, pas seulement un effacement d'état côté
 * client) — jamais un crash public. La fiche livre
 * (`catalogue/[edition]/[slug]`, pré-rendue via `generateStaticParams`) n'a
 * pas ce problème : une régénération ISR en échec conserve le rendu déjà
 * servi.
 *
 * L'erreur elle-même est déjà journalisée côté Sentry sans action
 * supplémentaire ici : `onRequestError` (`src/instrumentation.ts`) capture
 * toute exception non gérée d'un Server Component (`OPERATIONS.md` §2).
 */
export default function CatalogueError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <Container className="bg-paper py-24 text-center sm:py-32">
      {/* Même signature que error.tsx et not-found.tsx (5.3) : carré brick +
          barre paper, point d'exclamation minimal. */}
      <div
        aria-hidden="true"
        className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-ink bg-brick"
      >
        <span className="h-7 w-2 bg-paper" />
      </div>

      <h1 className="mt-6 font-sans text-3xl font-black italic text-ink sm:text-4xl">
        <span className="sr-only">Erreur — </span>Le catalogue est momentanément indisponible
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink/70">
        La collecte du catalogue a échoué — probablement une source
        temporairement en défaut. Réessayez dans un instant.
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

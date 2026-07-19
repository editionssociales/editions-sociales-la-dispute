"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Bouton de soumission d'une server action (`<form action={...}>`) qui
 * redirige après un aller-retour réseau (Stripe Checkout ici) — l'unique
 * façon fiable de savoir qu'une soumission est « en cours » côté client
 * (`useFormStatus`, doit être un DESCENDANT du `<form>`, jamais le `<form>`
 * lui-même).
 *
 * Volontairement distinct de l'état `disabled` de `<Button>` (R7) : `pending`
 * doit se lire comme « ça travaille », `disabled` comme « indisponible » — le
 * même `opacity-40` sur les deux confondrait une redirection de 1-2s avec un
 * bouton mort. `pending` ne change donc jamais l'opacité : seul le libellé et
 * un petit carré pulsant l'indiquent, sur la palette déjà posée par l'appelant.
 *
 * `tone` choisit la couleur du carré pulsant selon le fond AU REPOS du bouton
 * (même logique que `FOCUS_RING_LIGHT`/`_DARK`, R5) : `"dark"` (bouton sur
 * fond ink) → pop-yellow, contraste net ; `"light"` (bouton sur fond
 * paper) → ink, sinon le jaune y est quasi invisible (≈1,1:1).
 */
const PULSE_DOT: Record<"light" | "dark", string> = {
  light: "bg-ink",
  dark: "bg-pop-yellow",
};

export function SubmitButton({
  tone,
  className,
  pendingLabel = "Redirection…",
  children,
}: {
  tone: "light" | "dark";
  /** Recette complète (fond/bordure/hover/anneau de focus) — pas de variante implicite ici. */
  className: string;
  pendingLabel?: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait`}
    >
      {pending ? pendingLabel : children}
      {pending && (
        <span
          aria-hidden="true"
          className={`ml-2 inline-block h-2 w-2 shrink-0 animate-pulse motion-reduce:animate-none ${PULSE_DOT[tone]}`}
        />
      )}
    </button>
  );
}

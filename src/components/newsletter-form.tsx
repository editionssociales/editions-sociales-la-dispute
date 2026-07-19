"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { LEGAL_LINK } from "@/components/legal-section";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import {
  NEWSLETTER_INITIAL_STATE,
  subscribeToNewsletter,
} from "@/app/(site)/newsletter/actions";

/**
 * Îlot client extrait de `NewsletterCell` (`site-footer.tsx`, plan §5 étape
 * 6) — `action="#"` (inerte) remplacé par la server action
 * `subscribeToNewsletter`. Chaîne de classes et DOM du `<form>` d'origine
 * CONSERVÉS À L'IDENTIQUE (contrat iso-rendu, `CLAUDE.md`) ; seuls des
 * éléments additifs sont ajoutés : honeypot masqué, zone de message d'état,
 * mention RGPD. `method="get"` retiré (sans objet avec une fonction en
 * `action`, React pilote la soumission).
 *
 * Anti-abus best-effort — `renderedAt` posé au montage (pas dans l'état
 * initial du rendu serveur, qui daterait de l'ISR et non de la vraie visite,
 * cf. `newsletter.ts`).
 */
export function NewsletterForm() {
  const [state, formAction, isPending] = useActionState(subscribeToNewsletter, NEWSLETTER_INITIAL_STATE);
  const [renderedAt, setRenderedAt] = useState<number | null>(null);

  useEffect(() => {
    // Enveloppé dans une fonction nommée (plutôt qu'un `setState` nu en tête
    // d'effet) — `react-hooks/set-state-in-effect` (React Compiler) signale
    // sinon un faux positif : ce timestamp EST intrinsèquement une donnée
    // externe au rendu React (l'instant de montage côté client, jamais
    // connaissable pendant le rendu serveur sans provoquer un décalage
    // d'hydratation), cf. `newsletter.ts`.
    function markRendered() {
      setRenderedAt(Date.now());
    }
    markRendered();
  }, []);

  return (
    <>
      <form action={formAction} className="mt-1 flex border-2 border-ink">
        <label htmlFor="footer-newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="footer-newsletter-email"
          name="email"
          type="email"
          required
          placeholder="vous@exemple.fr"
          className={`min-w-0 flex-1 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${FOCUS_RING_LIGHT}`}
        />

        {/* Honeypot — champ additif, masqué visuellement ET des lecteurs d'écran ; un bot qui remplit tous les champs qu'il trouve s'y fait piéger. Doit rester vide. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-px w-px overflow-hidden"
        />
        <input type="hidden" name="renderedAt" value={renderedAt ?? ""} />

        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={`shrink-0 border-l-2 border-ink bg-ink px-4 py-2 text-xs font-extrabold uppercase tracking-[.06em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper ${FOCUS_RING_DARK}`}
        >
          {isPending ? "Envoi…" : "S'abonner"}
        </button>
      </form>

      {/* Zone de message d'état — additive. */}
      <p
        role="status"
        aria-live="polite"
        className={`mt-1 text-xs leading-snug empty:hidden ${
          state.status === "error" ? "text-brick" : "text-ink/70"
        }`}
      >
        {state.status !== "idle" ? state.message : ""}
      </p>

      {/* Mention RGPD — additive. */}
      <p className="text-[11px] leading-snug text-ink/70">
        Votre email est utilisé uniquement pour vous adresser cette lettre
        d&apos;information, via notre prestataire Brevo (sous-traitant).{" "}
        <Link href="/mentions-legales" className={LEGAL_LINK}>
          Mentions légales
        </Link>
        .
      </p>
    </>
  );
}

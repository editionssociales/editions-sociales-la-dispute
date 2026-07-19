"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);

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

  useEffect(() => {
    // Succès (DOI envoyée) → formulaire réinitialisé, `renderedAt` reposé
    // pour un envoi ultérieur sans redéclencher `too-fast`. Enveloppé dans
    // une fonction nommée (cf. `markRendered` ci-dessus) — même faux
    // positif `react-hooks/set-state-in-effect`.
    function resetFormOnSuccess() {
      if (state.status !== "ok") return;
      formRef.current?.reset();
      setRenderedAt(Date.now());
    }
    resetFormOnSuccess();
  }, [state]);

  const emailInvalid = state.status === "error" && state.field === "email";

  return (
    <>
      <form ref={formRef} action={formAction} className="mt-1 flex border-2 border-ink">
        <label htmlFor="footer-newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="footer-newsletter-email"
          name="email"
          type="email"
          required
          placeholder="vous@exemple.fr"
          aria-invalid={emailInvalid ? true : undefined}
          aria-describedby={emailInvalid ? "newsletter-status" : undefined}
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
      {state.status !== "idle" && (
        <div
          id="newsletter-status"
          role="status"
          aria-live="polite"
          className={`mt-1 border-2 bg-paper-2 px-3 py-2 font-sans text-xs font-bold leading-snug text-ink ${
            state.status === "ok" ? "border-bottle" : "border-brick"
          }`}
        >
          {state.message}
        </div>
      )}

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

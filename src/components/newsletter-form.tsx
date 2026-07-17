"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { LEGAL_LINK } from "@/components/legal-section";
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
  const [state, formAction] = useActionState(subscribeToNewsletter, NEWSLETTER_INITIAL_STATE);
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
      <form action={formAction} className="mt-1 flex border-2 border-black">
        <label htmlFor="footer-newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="footer-newsletter-email"
          name="email"
          type="email"
          required
          placeholder="vous@exemple.fr"
          className="min-w-0 flex-1 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40 focus-visible:outline-none"
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
          className="shrink-0 border-l-2 border-black bg-black px-4 py-2 text-xs font-extrabold uppercase tracking-[.06em] text-white transition-colors motion-reduce:transition-none hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
        >
          S&apos;abonner
        </button>
      </form>

      {/* Zone de message d'état — additive. */}
      <p
        role="status"
        aria-live="polite"
        className={`mt-1 text-xs leading-snug empty:hidden ${
          state.status === "error" ? "text-brick" : "text-black/70"
        }`}
      >
        {state.status !== "idle" ? state.message : ""}
      </p>

      {/* Mention RGPD — additive. */}
      <p className="text-[11px] leading-snug text-black/50">
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

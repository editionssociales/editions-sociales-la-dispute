"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { LEGAL_LINK } from "@/components/legal-section";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  NAME_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
} from "@/lib/contact-form";
import { sendContactMessage } from "@/app/(site)/contact/actions";
import { CONTACT_INITIAL_STATE } from "@/app/(site)/contact/state";

/**
 * Formulaire de contact unique (plan §5 étape 7) — sujet libre, un seul
 * destinataire (forme minimale recommandée par le plan, §Calage calendrier).
 * Mêmes protections anti-abus que `newsletter-form.tsx` (honeypot + délai
 * best-effort côté client) et même mention RGPD.
 */

const FIELD_CLASS =
  "border-2 border-ink bg-paper px-3 py-2 font-sans text-sm text-ink placeholder:text-ink/40 outline-none " +
  FOCUS_RING_LIGHT;
const LABEL_CLASS = "font-sans text-xs font-bold uppercase tracking-[.06em] text-ink";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(sendContactMessage, CONTACT_INITIAL_STATE);
  const [renderedAt, setRenderedAt] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Cf. `newsletter-form.tsx` : enveloppé dans une fonction nommée pour
    // éviter le faux positif `react-hooks/set-state-in-effect` — ce
    // timestamp est l'instant de montage côté client, jamais connaissable
    // pendant le rendu serveur.
    function markRendered() {
      setRenderedAt(Date.now());
    }
    markRendered();
  }, []);

  useEffect(() => {
    // Succès → formulaire réinitialisé (les champs, non contrôlés, portent
    // encore la saisie précédente sinon) ; `renderedAt` reposé pour un envoi
    // ultérieur sans redéclencher `too-fast`. Enveloppé dans une fonction
    // nommée (cf. `markRendered` ci-dessus) — même faux positif
    // `react-hooks/set-state-in-effect`.
    function resetFormOnSuccess() {
      if (state.status !== "ok") return;
      formRef.current?.reset();
      setRenderedAt(Date.now());
    }
    resetFormOnSuccess();
  }, [state]);

  const erroredField = state.status === "error" ? state.field : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-name" className={LABEL_CLASS}>
          Nom
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          required
          maxLength={NAME_MAX_LENGTH}
          aria-invalid={erroredField === "name" ? true : undefined}
          aria-describedby={erroredField === "name" ? "contact-status" : undefined}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          placeholder="vous@exemple.fr"
          aria-invalid={erroredField === "email" ? true : undefined}
          aria-describedby={erroredField === "email" ? "contact-status" : undefined}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-subject" className={LABEL_CLASS}>
          Sujet
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          maxLength={SUBJECT_MAX_LENGTH}
          aria-invalid={erroredField === "subject" ? true : undefined}
          aria-describedby={erroredField === "subject" ? "contact-status" : undefined}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-message" className={LABEL_CLASS}>
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={7}
          minLength={MESSAGE_MIN_LENGTH}
          maxLength={MESSAGE_MAX_LENGTH}
          aria-invalid={erroredField === "message" ? true : undefined}
          aria-describedby={erroredField === "message" ? "contact-status" : undefined}
          className={`${FIELD_CLASS} resize-y`}
        />
      </div>

      {/* Honeypot — masqué visuellement ET des lecteurs d'écran, doit rester vide. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px overflow-hidden"
      />
      <input type="hidden" name="renderedAt" value={renderedAt ?? ""} />

      <Button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="w-fit px-6 py-3 text-sm tracking-[.03em]"
      >
        {isPending ? "Envoi…" : "Envoyer"}
      </Button>

      {state.status !== "idle" && (
        <div
          id="contact-status"
          role="status"
          aria-live="polite"
          className={`border-2 bg-paper-2 px-4 py-3 font-sans text-sm font-bold leading-snug text-ink ${
            state.status === "ok" ? "border-bottle" : "border-brick"
          }`}
        >
          {state.message}
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted">
        Votre message est transmis à notre boîte de contact via notre
        prestataire Brevo (sous-traitant), qui reçoit également votre adresse
        email pour permettre une réponse.{" "}
        <Link href="/mentions-legales" className={LEGAL_LINK}>
          Mentions légales
        </Link>
        .
      </p>
    </form>
  );
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBJECT,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  MIN_SUBMIT_DELAY_MS,
  NAME_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  validateContactSubmission,
} from "./contact-form";

const VALID = {
  name: "Simone",
  email: "simone@exemple.fr",
  subject: "Question sur une commande",
  message: "Bonjour, je souhaiterais savoir si ce livre est disponible en librairie.",
};

describe("validateContactSubmission — cas valide", () => {
  it("accepte un envoi complet et normalise trim/minuscule de l'email", () => {
    expect(
      validateContactSubmission({ ...VALID, email: "  Simone@Exemple.FR  " }),
    ).toEqual({
      ok: true,
      name: "Simone",
      email: "simone@exemple.fr",
      subject: "Question sur une commande",
      message: VALID.message,
    });
  });

  it("sujet absent ou vide → DEFAULT_SUBJECT (sujet libre, pas de routage par thème)", () => {
    const withoutSubject = { name: VALID.name, email: VALID.email, message: VALID.message };
    expect(validateContactSubmission(withoutSubject)).toMatchObject({
      ok: true,
      subject: DEFAULT_SUBJECT,
    });
    expect(validateContactSubmission({ ...VALID, subject: "   " })).toMatchObject({
      ok: true,
      subject: DEFAULT_SUBJECT,
    });
  });
});

describe("validateContactSubmission — honeypot et délai", () => {
  it("honeypot rempli → rejeté", () => {
    expect(validateContactSubmission({ ...VALID, honeypot: "bot" })).toEqual({
      ok: false,
      reason: "honeypot",
    });
  });

  it("soumission avant le délai minimal → too-fast", () => {
    const renderedAt = 1_000_000;
    expect(
      validateContactSubmission({
        ...VALID,
        renderedAt,
        submittedAt: renderedAt + MIN_SUBMIT_DELAY_MS - 1,
      }),
    ).toEqual({ ok: false, reason: "too-fast" });
  });

  it("renderedAt absent → délai non vérifiable, jamais rejeté pour ce motif", () => {
    expect(validateContactSubmission({ ...VALID, submittedAt: 1_000_000 })).toMatchObject({
      ok: true,
    });
  });
});

describe("validateContactSubmission — bornes email/nom/sujet/message", () => {
  it("email invalide → invalid-email", () => {
    expect(validateContactSubmission({ ...VALID, email: "pas-un-email" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
  });

  it("nom vide → name-missing", () => {
    expect(validateContactSubmission({ ...VALID, name: "   " })).toEqual({
      ok: false,
      reason: "name-missing",
    });
  });

  it(`nom > ${NAME_MAX_LENGTH} caractères → name-too-long`, () => {
    expect(
      validateContactSubmission({ ...VALID, name: "a".repeat(NAME_MAX_LENGTH + 1) }),
    ).toEqual({ ok: false, reason: "name-too-long" });
  });

  it(`sujet > ${SUBJECT_MAX_LENGTH} caractères → subject-too-long`, () => {
    expect(
      validateContactSubmission({ ...VALID, subject: "a".repeat(SUBJECT_MAX_LENGTH + 1) }),
    ).toEqual({ ok: false, reason: "subject-too-long" });
  });

  it(`message < ${MESSAGE_MIN_LENGTH} caractères → message-too-short`, () => {
    const short = "a".repeat(MESSAGE_MIN_LENGTH - 1);
    expect(short.length).toBeLessThan(MESSAGE_MIN_LENGTH);
    expect(validateContactSubmission({ ...VALID, message: short })).toEqual({
      ok: false,
      reason: "message-too-short",
    });
  });

  it(`message > ${MESSAGE_MAX_LENGTH} caractères → message-too-long`, () => {
    expect(
      validateContactSubmission({ ...VALID, message: "a".repeat(MESSAGE_MAX_LENGTH + 1) }),
    ).toEqual({ ok: false, reason: "message-too-long" });
  });

  it("message avec espaces superflus, borne respectée après trim → accepté", () => {
    const padded = `   ${"a".repeat(MESSAGE_MIN_LENGTH)}   `;
    expect(validateContactSubmission({ ...VALID, message: padded })).toMatchObject({
      ok: true,
      message: "a".repeat(MESSAGE_MIN_LENGTH),
    });
  });
});

import { describe, expect, it } from "vitest";
import { MIN_SUBMIT_DELAY_MS, validateNewsletterSubmission } from "./newsletter";

describe("validateNewsletterSubmission — email", () => {
  it("email valide, sans renderedAt → ok (délai non vérifiable, ni pénalisé)", () => {
    expect(validateNewsletterSubmission({ email: "test@exemple.fr" })).toEqual({
      ok: true,
      email: "test@exemple.fr",
    });
  });

  it("normalise trim + minuscule", () => {
    expect(validateNewsletterSubmission({ email: "  Test@Exemple.FR  " })).toEqual({
      ok: true,
      email: "test@exemple.fr",
    });
  });

  it("email vide → invalid-email", () => {
    expect(validateNewsletterSubmission({ email: "" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
  });

  it("email sans arobase → invalid-email", () => {
    expect(validateNewsletterSubmission({ email: "pas-un-email" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
  });

  it("email sans domaine → invalid-email", () => {
    expect(validateNewsletterSubmission({ email: "test@" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
  });

  it("email trop long (> 254) → invalid-email", () => {
    const long = "a".repeat(250) + "@a.fr";
    expect(long.length).toBeGreaterThan(254);
    expect(validateNewsletterSubmission({ email: long })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
  });
});

describe("validateNewsletterSubmission — honeypot", () => {
  it("honeypot rempli → rejeté (prime sur la validité de l'email)", () => {
    expect(
      validateNewsletterSubmission({ email: "test@exemple.fr", honeypot: "je suis un robot" }),
    ).toEqual({ ok: false, reason: "honeypot" });
  });

  it("honeypot vide → accepté", () => {
    expect(validateNewsletterSubmission({ email: "test@exemple.fr", honeypot: "" })).toEqual({
      ok: true,
      email: "test@exemple.fr",
    });
  });

  it("honeypot avec seulement des espaces → traité comme vide (trim)", () => {
    expect(validateNewsletterSubmission({ email: "test@exemple.fr", honeypot: "   " })).toEqual({
      ok: true,
      email: "test@exemple.fr",
    });
  });
});

describe("validateNewsletterSubmission — délai anti-bot best-effort", () => {
  it("soumission avant le délai minimal → too-fast", () => {
    const renderedAt = 1_000_000;
    const submittedAt = renderedAt + MIN_SUBMIT_DELAY_MS - 1;
    expect(
      validateNewsletterSubmission({ email: "test@exemple.fr", renderedAt, submittedAt }),
    ).toEqual({ ok: false, reason: "too-fast" });
  });

  it("soumission exactement au délai minimal → accepté", () => {
    const renderedAt = 1_000_000;
    const submittedAt = renderedAt + MIN_SUBMIT_DELAY_MS;
    expect(
      validateNewsletterSubmission({ email: "test@exemple.fr", renderedAt, submittedAt }),
    ).toEqual({ ok: true, email: "test@exemple.fr" });
  });

  it("soumission bien après le délai minimal → accepté", () => {
    const renderedAt = 1_000_000;
    const submittedAt = renderedAt + 10_000;
    expect(
      validateNewsletterSubmission({ email: "test@exemple.fr", renderedAt, submittedAt }),
    ).toEqual({ ok: true, email: "test@exemple.fr" });
  });

  it("renderedAt absent → délai non vérifiable, jamais rejeté pour ce motif", () => {
    expect(
      validateNewsletterSubmission({ email: "test@exemple.fr", submittedAt: 1_000_000 }),
    ).toEqual({ ok: true, email: "test@exemple.fr" });
  });
});

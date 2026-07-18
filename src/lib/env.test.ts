import { describe, expect, it } from "vitest";
import { assertEnv, checkEnv } from "./env";

/** Environnement minimal sain depuis la coupure OVH : la base Postgres et le secret Payload sont REQUIS. */
const BASE = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  PAYLOAD_SECRET: "0123456789abcdef0123456789abcdef",
};

const issueVars = (env: Record<string, string | undefined>) =>
  checkEnv(env).map((i) => i.variable).sort();

describe("checkEnv — deux variables requises (DATABASE_URL, PAYLOAD_SECRET), le reste optionnel mais bien formé", () => {
  it("environnement vide → seules les 2 requises sont signalées (sans Postgres, ni catalogue ni back-office)", () => {
    expect(issueVars({})).toEqual(["DATABASE_URL", "PAYLOAD_SECRET"]);
  });

  it("les 2 requises posées, tout le reste absent → aucun problème (provisioning progressif pour le reste)", () => {
    expect(checkEnv(BASE)).toEqual([]);
  });

  it("environnement complet et bien formé → aucun problème", () => {
    expect(
      checkEnv({
        ...BASE,
        DATABASE_URL_UNPOOLED: "postgresql://user:pass@host-direct/db",
        STRIPE_WEBHOOK_SECRET: "whsec_abc",
        NEXT_PUBLIC_SITE_URL: "https://www.exemple.test",
        NEXT_PUBLIC_SENTRY_DSN: "https://x.ingest.sentry.io/1",
        SITE_INDEXABLE: "1",
        REDIRECTS_PERMANENT: "0",
        BREVO_DOI_TEMPLATE_ID: "42",
        BREVO_LIST_ID_SITE: "7",
        CONTACT_TO_EMAIL: "contact@exemple.test",
      }),
    ).toEqual([]);
  });

  it("DATABASE_URL vide ou malformée (le piège pg) → signalée au boot", () => {
    expect(issueVars({ ...BASE, DATABASE_URL: "" })).toEqual(["DATABASE_URL"]);
    expect(issueVars({ ...BASE, DATABASE_URL: "mysql://nope" })).toEqual(["DATABASE_URL"]);
  });

  it("PAYLOAD_SECRET vide ou trop court (le piège jose) → signalé", () => {
    expect(issueVars({ ...BASE, PAYLOAD_SECRET: "" })).toEqual(["PAYLOAD_SECRET"]);
    expect(issueVars({ ...BASE, PAYLOAD_SECRET: "court" })).toEqual(["PAYLOAD_SECRET"]);
  });

  it("BREVO_DOI_TEMPLATE_ID / BREVO_LIST_ID_SITE non numériques → signalés", () => {
    expect(issueVars({ ...BASE, BREVO_DOI_TEMPLATE_ID: "abc", BREVO_LIST_ID_SITE: "" })).toEqual([
      "BREVO_DOI_TEMPLATE_ID",
      "BREVO_LIST_ID_SITE",
    ]);
  });

  it("CONTACT_TO_EMAIL malformée → signalée", () => {
    expect(issueVars({ ...BASE, CONTACT_TO_EMAIL: "pas-un-email" })).toEqual(["CONTACT_TO_EMAIL"]);
  });

  it("BREVO_API_KEY non reconnue → PAS un problème (interrupteur documenté, même traitement que STRIPE_SECRET_KEY)", () => {
    expect(checkEnv({ ...BASE, BREVO_API_KEY: "nimporte" })).toEqual([]);
  });

  it("gates en `true` au lieu de `1` → signalés (sinon désindexation silencieuse)", () => {
    expect(issueVars({ ...BASE, SITE_INDEXABLE: "true", REDIRECTS_PERMANENT: "true" })).toEqual([
      "REDIRECTS_PERMANENT",
      "SITE_INDEXABLE",
    ]);
  });

  it("clé Stripe LIVE hors production Vercel → signalé (règle DEVOPS.md)", () => {
    const issues = checkEnv({
      ...BASE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    });
    expect(issues.map((i) => i.variable)).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("clé Stripe non reconnue → PAS un problème (interrupteur documenté de la phase dons)", () => {
    expect(checkEnv({ ...BASE, STRIPE_SECRET_KEY: "nimporte" })).toEqual([]);
  });

  it("plusieurs variables fautives → toutes listées d'un coup", () => {
    expect(issueVars({ DATABASE_URL: "", PAYLOAD_SECRET: "court", SITE_INDEXABLE: "oui" })).toEqual(
      ["DATABASE_URL", "PAYLOAD_SECRET", "SITE_INDEXABLE"],
    );
  });
});

describe("assertEnv", () => {
  it("jette avec chaque variable fautive nommée", () => {
    expect(() => assertEnv({ ...BASE, SITE_INDEXABLE: "oui" })).toThrow(/SITE_INDEXABLE/);
  });

  it("ne jette pas sur un environnement sain", () => {
    expect(() => assertEnv(BASE)).not.toThrow();
  });

  it("jette si DATABASE_URL/PAYLOAD_SECRET sont absentes — fail-fast, jamais au fond d'une requête", () => {
    expect(() => assertEnv({})).toThrow(/DATABASE_URL/);
    expect(() => assertEnv({})).toThrow(/PAYLOAD_SECRET/);
  });
});

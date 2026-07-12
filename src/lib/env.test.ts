import { describe, expect, it } from "vitest";
import { assertEnv, checkEnv } from "./env";

describe("checkEnv — forme des variables posées, jamais leur présence", () => {
  it("environnement vide → aucun problème (provisioning progressif)", () => {
    expect(checkEnv({})).toEqual([]);
  });

  it("environnement complet et bien formé → aucun problème", () => {
    expect(
      checkEnv({
        WP_ES_URL: "https://editionssociales.fr",
        WP_LD_URL: "https://ladispute.fr",
        WC_STORE_URL: "https://boutique.editionssociales.fr",
        WP_REVALIDATE: "3600",
        DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require",
        DATABASE_URL_UNPOOLED: "postgres://u:p@ep-x.neon.tech/db",
        PAYLOAD_SECRET: "0123456789abcdef0123456789abcdef",
        STRIPE_WEBHOOK_SECRET: "whsec_abc",
        CATALOGUE_SOURCE: "pg",
        NEXT_PUBLIC_SITE_URL: "https://editionssociales.fr",
        SITE_INDEXABLE: "1",
        REDIRECTS_PERMANENT: "0",
      }),
    ).toEqual([]);
  });

  it("DATABASE_URL vide (le piège pg) → signalé au boot", () => {
    const issues = checkEnv({ DATABASE_URL: "" });
    expect(issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]);
  });

  it("PAYLOAD_SECRET vide ou trop court (le piège jose) → signalé", () => {
    expect(checkEnv({ PAYLOAD_SECRET: "" })).toHaveLength(1);
    expect(checkEnv({ PAYLOAD_SECRET: "court" })).toHaveLength(1);
  });

  it("gates en `true` au lieu de `1` → signalés (sinon désindexation silencieuse)", () => {
    expect(checkEnv({ SITE_INDEXABLE: "true" }).map((i) => i.variable)).toEqual([
      "SITE_INDEXABLE",
    ]);
    expect(checkEnv({ REDIRECTS_PERMANENT: "yes" })).toHaveLength(1);
  });

  it("CATALOGUE_SOURCE inconnu → signalé (retomberait en http sans le dire)", () => {
    expect(checkEnv({ CATALOGUE_SOURCE: "postgres" }).map((i) => i.variable)).toEqual([
      "CATALOGUE_SOURCE",
    ]);
  });

  it("clé Stripe LIVE hors production Vercel → signalé (règle DEVOPS.md)", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: "sk_live_x",
    };
    expect(checkEnv(preview).map((i) => i.variable)).toEqual(["STRIPE_SECRET_KEY"]);
    expect(checkEnv({ ...preview, VERCEL_ENV: "production" })).toEqual([]);
    // clé test partout : jamais un problème
    expect(checkEnv({ ...preview, STRIPE_SECRET_KEY: "sk_test_x" })).toEqual([]);
  });

  it("clé Stripe non reconnue → PAS un problème (interrupteur documenté de la phase dons)", () => {
    expect(checkEnv({ STRIPE_SECRET_KEY: "placeholder" })).toEqual([]);
  });

  it("plusieurs variables fautives → toutes listées d'un coup", () => {
    const issues = checkEnv({ DATABASE_URL: "", WP_ES_URL: "editionssociales.fr" });
    expect(issues).toHaveLength(2);
  });
});

describe("assertEnv", () => {
  it("jette avec chaque variable fautive nommée", () => {
    expect(() => assertEnv({ DATABASE_URL: "", SITE_INDEXABLE: "true" })).toThrow(
      /DATABASE_URL[\s\S]*SITE_INDEXABLE/,
    );
  });

  it("ne jette pas sur un environnement sain", () => {
    expect(() => assertEnv({})).not.toThrow();
  });
});

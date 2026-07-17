import { describe, expect, it } from "vitest";
import { assertEnv, checkEnv, isCommerceNative } from "./env";

/** Les 3 URL WP/Woo sont requises (DEVOPS.md §4.1) — posées ici pour isoler chaque test sur la variable qu'il vise. */
const SANE_WP_URLS = {
  WP_ES_URL: "https://editionssociales.fr",
  WP_LD_URL: "https://ladispute.fr",
  WC_STORE_URL: "https://boutique.editionssociales.fr",
};

describe("checkEnv — forme des variables posées, jamais leur présence (sauf les 3 URL WP/Woo)", () => {
  it("environnement vide → seules les 3 URL WP/Woo requises sont signalées (DEVOPS.md §4.1 : sinon repli silencieux sur la prod publique)", () => {
    expect(
      checkEnv({})
        .map((i) => i.variable)
        .sort(),
    ).toEqual(["WC_STORE_URL", "WP_ES_URL", "WP_LD_URL"]);
  });

  it("les 3 URL WP/Woo posées, tout le reste absent → aucun problème (provisioning progressif pour le reste)", () => {
    expect(checkEnv(SANE_WP_URLS)).toEqual([]);
  });

  it("WP_ES_URL/WP_LD_URL/WC_STORE_URL malformées (pas une URL http(s)) → signalées, message distinct de l'absence", () => {
    const issues = checkEnv({ ...SANE_WP_URLS, WP_ES_URL: "editionssociales.fr" });
    expect(issues.map((i) => i.variable)).toEqual(["WP_ES_URL"]);
    expect(issues[0]?.message).toBe("URL http(s) attendue");
  });

  it("environnement complet et bien formé → aucun problème", () => {
    expect(
      checkEnv({
        ...SANE_WP_URLS,
        WP_REVALIDATE: "3600",
        DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require",
        DATABASE_URL_UNPOOLED: "postgres://u:p@ep-x.neon.tech/db",
        PAYLOAD_SECRET: "0123456789abcdef0123456789abcdef",
        STRIPE_WEBHOOK_SECRET: "whsec_abc",
        CATALOGUE_SOURCE: "pg",
        NEXT_PUBLIC_SITE_URL: "https://editionssociales.fr",
        SITE_INDEXABLE: "1",
        REDIRECTS_PERMANENT: "0",
        COMMERCE_NATIVE: "1",
        BREVO_DOI_TEMPLATE_ID: "12",
        BREVO_LIST_ID_SITE: "34",
        CONTACT_TO_EMAIL: "toutes@editionssociales.fr",
      }),
    ).toEqual([]);
  });

  it("BREVO_DOI_TEMPLATE_ID / BREVO_LIST_ID_SITE non numériques → signalés (URL WP/Woo posées, hors sujet ici)", () => {
    expect(
      checkEnv({ ...SANE_WP_URLS, BREVO_DOI_TEMPLATE_ID: "abc" }).map((i) => i.variable),
    ).toEqual(["BREVO_DOI_TEMPLATE_ID"]);
    expect(
      checkEnv({ ...SANE_WP_URLS, BREVO_LIST_ID_SITE: "" }).map((i) => i.variable),
    ).toEqual(["BREVO_LIST_ID_SITE"]);
  });

  it("CONTACT_TO_EMAIL malformée → signalée (URL WP/Woo posées, hors sujet ici)", () => {
    expect(
      checkEnv({ ...SANE_WP_URLS, CONTACT_TO_EMAIL: "pas-un-email" }).map((i) => i.variable),
    ).toEqual(["CONTACT_TO_EMAIL"]);
  });

  it("BREVO_API_KEY non reconnue → PAS un problème (interrupteur documenté de la phase communication, même traitement que STRIPE_SECRET_KEY)", () => {
    expect(checkEnv({ ...SANE_WP_URLS, BREVO_API_KEY: "placeholder" })).toEqual([]);
  });

  it("DATABASE_URL vide (le piège pg) → signalé au boot", () => {
    const issues = checkEnv({ ...SANE_WP_URLS, DATABASE_URL: "" });
    expect(issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]);
  });

  it("PAYLOAD_SECRET vide ou trop court (le piège jose) → signalé", () => {
    expect(checkEnv({ ...SANE_WP_URLS, PAYLOAD_SECRET: "" })).toHaveLength(1);
    expect(checkEnv({ ...SANE_WP_URLS, PAYLOAD_SECRET: "court" })).toHaveLength(1);
  });

  it("gates en `true` au lieu de `1` → signalés (sinon désindexation silencieuse)", () => {
    expect(
      checkEnv({ ...SANE_WP_URLS, SITE_INDEXABLE: "true" }).map((i) => i.variable),
    ).toEqual(["SITE_INDEXABLE"]);
    expect(checkEnv({ ...SANE_WP_URLS, REDIRECTS_PERMANENT: "yes" })).toHaveLength(1);
  });

  it("CATALOGUE_SOURCE inconnu → signalé (retomberait en http sans le dire)", () => {
    expect(
      checkEnv({ ...SANE_WP_URLS, CATALOGUE_SOURCE: "postgres" }).map((i) => i.variable),
    ).toEqual(["CATALOGUE_SOURCE"]);
  });

  it("COMMERCE_NATIVE en `true` au lieu de `1` → signalé (désactiverait en silence)", () => {
    expect(
      checkEnv({ ...SANE_WP_URLS, COMMERCE_NATIVE: "true" }).map((i) => i.variable),
    ).toEqual(["COMMERCE_NATIVE"]);
  });

  it("clé Stripe LIVE hors production Vercel → signalé (règle DEVOPS.md)", () => {
    const preview = {
      ...SANE_WP_URLS,
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
    expect(checkEnv({ ...SANE_WP_URLS, STRIPE_SECRET_KEY: "placeholder" })).toEqual([]);
  });

  it("plusieurs variables fautives → toutes listées d'un coup", () => {
    const issues = checkEnv({
      ...SANE_WP_URLS,
      DATABASE_URL: "",
      WP_ES_URL: "editionssociales.fr", // malformée : pas de schéma http(s)
    });
    expect(issues.map((i) => i.variable).sort()).toEqual(["DATABASE_URL", "WP_ES_URL"]);
  });
});

describe("assertEnv", () => {
  it("jette avec chaque variable fautive nommée", () => {
    expect(() =>
      assertEnv({ ...SANE_WP_URLS, DATABASE_URL: "", SITE_INDEXABLE: "true" }),
    ).toThrow(/DATABASE_URL[\s\S]*SITE_INDEXABLE/);
  });

  it("ne jette pas sur un environnement sain", () => {
    expect(() => assertEnv(SANE_WP_URLS)).not.toThrow();
  });

  it("jette si les URL WP/Woo sont absentes — fail-fast DEVOPS.md §4.1 (plus de repli silencieux sur la prod publique)", () => {
    expect(() => assertEnv({})).toThrow(/WP_ES_URL[\s\S]*WP_LD_URL[\s\S]*WC_STORE_URL/);
  });
});

describe("isCommerceNative — interrupteur du lot 2, false par défaut", () => {
  it("absente → false (règle d'or : iso-rendu tant que non posée)", () => {
    expect(isCommerceNative({})).toBe(false);
  });

  it('"0" → false', () => {
    expect(isCommerceNative({ COMMERCE_NATIVE: "0" })).toBe(false);
  });

  it('"1" → true', () => {
    expect(isCommerceNative({ COMMERCE_NATIVE: "1" })).toBe(true);
  });

  it("valeur malformée (`true`, vide…) → false (jamais activé par accident)", () => {
    expect(isCommerceNative({ COMMERCE_NATIVE: "true" })).toBe(false);
    expect(isCommerceNative({ COMMERCE_NATIVE: "" })).toBe(false);
  });

  it("sans argument → lit process.env", () => {
    const previous = process.env.COMMERCE_NATIVE;
    process.env.COMMERCE_NATIVE = "1";
    try {
      expect(isCommerceNative()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.COMMERCE_NATIVE;
      else process.env.COMMERCE_NATIVE = previous;
    }
  });
});

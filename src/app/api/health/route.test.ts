import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/health` testé à travers son interface réelle (Request →
 * Response) — Sentry observé par mock, `@/lib/order-source` mocké en bloc
 * (seam nommé du cycle de vie Order — collection/where/options couverts par
 * `order-source.test.ts`, même traitement que `@/lib/checkout-source` dans
 * `api/stripe/webhook/route.test.ts`) : ce fichier ne revérifie que la
 * COMPOSITION de la route (dégradation `COMMERCE_NATIVE`, calcul de l'âge,
 * capture Sentry), pas le mock Payload sous-jacent.
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let latestUpdatedAt: string | null = null;
let findShouldThrow = false;

vi.mock("@/lib/order-source", () => ({
  findLatestOrderUpdatedAt: async () => {
    if (findShouldThrow) throw new Error("Postgres indisponible (test)");
    return latestUpdatedAt;
  },
}));

const { GET } = await import("./route");
const Sentry = await import("@sentry/nextjs");

beforeEach(() => {
  vi.clearAllMocks();
  latestUpdatedAt = null;
  findShouldThrow = false;
});

afterEach(() => {
  delete process.env.COMMERCE_NATIVE;
});

describe("GET /api/health — COMMERCE_NATIVE=0 (défaut)", () => {
  it("dégrade proprement : signal Stripe null, aucune lecture Payload", async () => {
    delete process.env.COMMERCE_NATIVE;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      commerceNative: false,
      stripe: { lastEventAt: null, lastEventAgeSeconds: null },
    });
  });

  it("valeur malformée (\"true\") désactive aussi — même garde que isCommerceNative()", async () => {
    process.env.COMMERCE_NATIVE = "true";
    const res = await GET();
    expect((await res.json()).commerceNative).toBe(false);
  });
});

describe("GET /api/health — COMMERCE_NATIVE=1", () => {
  beforeEach(() => {
    process.env.COMMERCE_NATIVE = "1";
  });

  it("aucune commande en base → signal Stripe null (état légitime juste après cutover)", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({
      status: "ok",
      commerceNative: true,
      stripe: { lastEventAt: null, lastEventAgeSeconds: null },
    });
  });

  it("expose l'âge de la commande la plus récemment touchée", async () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    vi.setSystemTime(now);
    latestUpdatedAt = "2026-07-17T11:30:00.000Z"; // 30 min
    const res = await GET();
    expect(await res.json()).toEqual({
      status: "ok",
      commerceNative: true,
      stripe: { lastEventAt: "2026-07-17T11:30:00.000Z", lastEventAgeSeconds: 30 * 60 },
    });
    vi.useRealTimers();
  });

  it("lecture Payload en échec → capturé par Sentry, signal null, jamais une 5xx", async () => {
    findShouldThrow = true;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      commerceNative: true,
      stripe: { lastEventAt: null, lastEventAgeSeconds: null },
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

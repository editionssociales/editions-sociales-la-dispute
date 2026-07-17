import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/health` testé à travers son interface réelle (Request →
 * Response) — même traitement que `api/stripe/webhook/route.test.ts` :
 * `payload`/`@payload-config` substitués par un magasin en mémoire, Sentry
 * observé par mock. `COMMERCE_NATIVE` basculé par test (jamais un état
 * partagé entre `describe`).
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));

interface FakeOrder {
  updatedAt: string;
  [key: string]: unknown;
}

let orders: FakeOrder[] = [];
let findShouldThrow = false;

vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: { collection: string; sort?: string }) => {
      if (findShouldThrow) throw new Error("Postgres indisponible (test)");
      if (args.collection !== "orders") {
        throw new Error(`collection inattendue dans le test : ${args.collection}`);
      }
      // Même tri que la route (`-updatedAt`) — le plus récent en tête.
      const sorted = [...orders].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      return { docs: sorted.slice(0, 1) };
    },
  }),
}));

const { GET } = await import("./route");
const Sentry = await import("@sentry/nextjs");

beforeEach(() => {
  vi.clearAllMocks();
  orders = [];
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
    orders = [
      { updatedAt: "2026-07-17T11:30:00.000Z" }, // 30 min
      { updatedAt: "2026-07-16T12:00:00.000Z" }, // 1 jour — pas le plus récent
    ];
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

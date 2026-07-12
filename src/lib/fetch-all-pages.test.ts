import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./fetch-all-pages";

const pageOf = (n: number, size: number) =>
  Array.from({ length: size }, (_, i) => `p${n}-${i}`);

describe("fetchAllPages — la politique de pagination résiliente, testée une fois", () => {
  it("concatène jusqu'à la première page courte (elle incluse)", async () => {
    const fetchPage = vi.fn(async (page: number) =>
      page < 3 ? pageOf(page, 2) : pageOf(page, 1),
    );
    const out = await fetchAllPages<string>({ fetchPage, perPage: 2, maxPages: 10 });
    expect(out).toHaveLength(5); // 2 + 2 + 1
    expect(fetchPage).toHaveBeenCalledTimes(3); // la page courte arrête la boucle
  });

  it("respecte le plafond de pages (garde-fou anti-boucle)", async () => {
    const fetchPage = vi.fn(async (page: number) => pageOf(page, 2));
    const out = await fetchAllPages<string>({ fetchPage, perPage: 2, maxPages: 4 });
    expect(out).toHaveLength(8);
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it("page en échec → liste partielle, jamais d'exception ; l'échec est signalé", async () => {
    const onPageError = vi.fn();
    const out = await fetchAllPages<string>({
      fetchPage: async (page) => {
        if (page === 2) throw new Error("HTTP 500");
        return pageOf(page, 2);
      },
      perPage: 2,
      maxPages: 10,
      onPageError,
    });
    expect(out).toEqual(["p1-0", "p1-1"]);
    expect(onPageError).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it("échec dès la page 1 → liste vide (source indisponible, dégradation documentée)", async () => {
    const onPageError = vi.fn();
    const out = await fetchAllPages<string>({
      fetchPage: async () => {
        throw new Error("ECONNREFUSED");
      },
      perPage: 100,
      maxPages: 10,
      onPageError,
    });
    expect(out).toEqual([]);
    expect(onPageError).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it("corps non-liste → arrêt silencieux avec l'acquis (erreur WP sérialisée en 200)", async () => {
    const out = await fetchAllPages<string>({
      fetchPage: async (page) => (page === 1 ? pageOf(1, 2) : { code: "internal_error" }),
      perPage: 2,
      maxPages: 10,
    });
    expect(out).toEqual(["p1-0", "p1-1"]);
  });

  it("page pleine puis page vide → l'ensemble exact, sans page supplémentaire", async () => {
    const fetchPage = vi.fn(async (page: number) => (page === 1 ? pageOf(1, 2) : []));
    const out = await fetchAllPages<string>({ fetchPage, perPage: 2, maxPages: 10 });
    expect(out).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

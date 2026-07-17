import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Contrat de dégradation de l'adaptateur http (documenté dans
 * `src/lib/CLAUDE.md` : « une page/réponse indisponible dégrade en liste
 * partielle ou vide plutôt que de faire planter la page appelante ») — enfin
 * une assertion, plus seulement une promesse de commentaire. msw joue les
 * WordPress au niveau réseau ; l'alias `server-only` (vitest.config.ts) rend
 * le module importable.
 */

process.env.WP_ES_URL = "https://wp-es.test";
process.env.WP_LD_URL = "https://wp-ld.test";

const { httpCatalogueSource } = await import("./catalogue-http");

const PER_PAGE = 100;

const wpBook = (i: number) => ({
  id: i,
  slug: `livre-${i}`,
  title: { rendered: `Livre ${i}` },
  book: {},
});

const page = (url: URL) => Number(url.searchParams.get("page") ?? "1");

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listBooks — pagination résiliente", () => {
  it("suit la pagination et s'arrête à la première page courte", async () => {
    const pagesServies: number[] = [];
    server.use(
      http.get("https://wp-es.test/wp-json/wp/v2/catalogue", ({ request }) => {
        const p = page(new URL(request.url));
        pagesServies.push(p);
        if (p === 1) return HttpResponse.json(Array.from({ length: PER_PAGE }, (_, i) => wpBook(i)));
        return HttpResponse.json([wpBook(200), wpBook(201)]);
      }),
    );
    const books = await httpCatalogueSource().listBooks("editions-sociales");
    expect(books).toHaveLength(PER_PAGE + 2);
    expect(pagesServies).toEqual([1, 2]); // la page courte arrête la boucle
  });

  it("page suivante en échec → liste partielle, jamais d'exception (contrat de dégradation)", async () => {
    server.use(
      http.get("https://wp-es.test/wp-json/wp/v2/catalogue", ({ request }) => {
        const p = page(new URL(request.url));
        if (p === 1) return HttpResponse.json(Array.from({ length: PER_PAGE }, (_, i) => wpBook(i)));
        return HttpResponse.json({ code: "rest_post_invalid_page_number" }, { status: 400 });
      }),
    );
    const books = await httpCatalogueSource().listBooks("editions-sociales");
    expect(books).toHaveLength(PER_PAGE);
  });

  it("fonds injoignable dès la page 1 → liste vide (catalogue partiel, pas de plantage)", async () => {
    server.use(
      http.get("https://wp-ld.test/wp-json/wp/v2/catalogue", () => HttpResponse.error()),
    );
    const books = await httpCatalogueSource().listBooks("la-dispute");
    expect(books).toEqual([]);
  });

  it("corps 200 non-liste (erreur WP sérialisée) → on garde ce qu'on a", async () => {
    server.use(
      http.get("https://wp-es.test/wp-json/wp/v2/catalogue", ({ request }) => {
        const p = page(new URL(request.url));
        if (p === 1) return HttpResponse.json(Array.from({ length: PER_PAGE }, (_, i) => wpBook(i)));
        return HttpResponse.json({ code: "internal_error" });
      }),
    );
    const books = await httpCatalogueSource().listBooks("editions-sociales");
    expect(books).toHaveLength(PER_PAGE);
  });
});

describe("getBook", () => {
  it("fiche trouvée → premier résultat du slug", async () => {
    server.use(
      http.get("https://wp-es.test/wp-json/wp/v2/catalogue", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("slug")).toBe("le-capital");
        return HttpResponse.json([{ ...wpBook(1), slug: "le-capital" }]);
      }),
    );
    const book = await httpCatalogueSource().getBook("editions-sociales", "le-capital");
    expect(book?.slug).toBe("le-capital");
  });

  it("REST en échec → null (la fiche dégrade en 404, pas en 500)", async () => {
    server.use(
      http.get("https://wp-es.test/wp-json/wp/v2/catalogue", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );
    const book = await httpCatalogueSource().getBook("editions-sociales", "le-capital");
    expect(book).toBeNull();
  });
});

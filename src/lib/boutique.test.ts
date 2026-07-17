import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Contrat de dégradation du transport Store API (même exigence que
 * `catalogue-http.test.ts` pour l'adaptateur WP : une page/réponse
 * indisponible dégrade en liste partielle ou vide, jamais d'exception qui
 * ferait planter la page appelante). Depuis que `listProducts` est sorti du
 * port `CatalogueSource` (S1), ce comportement s'exerce directement sur
 * `getAllStoreProducts` — la seule fonction qui l'implémente désormais,
 * appelée telle quelle par `catalogue.ts` (http et pg y délèguent à
 * l'identique). msw joue WooCommerce au niveau réseau ; l'alias `server-only`
 * (vitest.config.ts) rend le module importable.
 */

process.env.WC_STORE_URL = "https://wc.test";

const { getAllStoreProducts } = await import("./boutique");

const wcProduct = (i: number) => ({
  id: i,
  name: `Produit ${i}`,
  slug: `produit-${i}`,
  permalink: `https://wc.test/produit/produit-${i}/`,
  is_purchasable: true,
  is_in_stock: true,
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("getAllStoreProducts — Store API", () => {
  it("page courte → arrêt propre avec les produits reçus", async () => {
    server.use(
      http.get("https://wc.test/wp-json/wc/store/v1/products", () =>
        HttpResponse.json([wcProduct(1), wcProduct(2)]),
      ),
    );
    const products = await getAllStoreProducts();
    expect(products).toHaveLength(2);
  });

  it("boutique indisponible → catalogue sans produits, jamais d'exception", async () => {
    server.use(
      http.get("https://wc.test/wp-json/wc/store/v1/products", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    const products = await getAllStoreProducts();
    expect(products).toEqual([]);
  });
});

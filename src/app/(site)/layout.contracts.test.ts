import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

describe("Layout site — contrats a11y / perf (issues #111 #112 #115)", () => {
  const layout = read("src/app/(site)/layout.tsx");

  it("Typekit reste asynchrone (#84) et réécrit font-display:swap (#112)", () => {
    expect(layout).toContain('media="print"');
    expect(layout).toContain('id="adobe-fonts-css"');
    expect(layout).toContain("font-display:swap");
    expect(layout).toContain("l.media='all'");
    expect(layout).toContain("<noscript>");
  });

  it("preconnect Sentry seulement via l'origine du DSN (#111)", () => {
    expect(layout).toContain("sentryIngestOrigin");
    expect(layout).toContain("sentryOrigin &&");
  });

  it("main #contenu est focalisable ; RouteFocus est monté (#115)", () => {
    expect(layout).toContain("<RouteFocus");
    expect(layout).toMatch(/<main id="contenu" tabIndex=\{-1\}/);
  });
});

describe("En-têtes de sécurité (issue #113)", () => {
  const config = read("next.config.ts");

  it("pose COOP et HSTS production, sans CSP enforcement ni Trusted Types", () => {
    expect(config).toContain("Cross-Origin-Opener-Policy");
    expect(config).toContain("same-origin-allow-popups");
    expect(config).toContain("Strict-Transport-Security");
    expect(config).toContain('VERCEL_ENV === "production"');
    expect(config).not.toContain("Content-Security-Policy");
    expect(config).not.toContain("require-trusted-types-for");
    expect(config).not.toContain("Cross-Origin-Embedder-Policy");
  });
});

describe("Cover — fetchPriority sur preload (issue #109)", () => {
  it("transmet fetchPriority=high quand preload est posé", () => {
    const src = read("src/lib/cover.tsx");
    expect(src).toContain('fetchPriority={preload ? "high" : undefined}');
  });
});

describe("Panier — label promo (issue #116)", () => {
  it("associe le label au seul champ, bouton frère, autocomplete off", () => {
    const src = read("src/app/(site)/panier/cart-view.tsx");
    expect(src).toContain('htmlFor="cart-promo"');
    expect(src).toContain('id="cart-promo"');
    expect(src).toContain('autoComplete="off"');
    const labelStart = src.indexOf('htmlFor="cart-promo"');
    const labelEnd = src.indexOf("</label>", labelStart);
    const label = src.slice(labelStart, labelEnd);
    expect(label).toContain("Code promo");
    expect(label).not.toContain("<Button");
    expect(label).not.toContain("<input");
  });
});

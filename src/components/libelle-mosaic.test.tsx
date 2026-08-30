import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LibelleMosaic, type LibelleMosaicItem } from "./libelle-mosaic";

/**
 * Verrouille les deux exigences client de l'index-manifeste (2026-08-30) :
 * AUCUN compte de livres rendu (le `count` ne pilote que l'ordre de lecture),
 * et une GÉOMÉTRIE INVARIANTE entre l'état actif et l'état de repos d'un
 * lien — seule la peinture change, le paragraphe ne bouge pas d'un pixel au
 * survol/à la sélection. Composant serveur pur sans état : même patron
 * `renderToStaticMarkup` que `book-card.test.tsx`.
 */

// Ordre d'entrée VOLONTAIREMENT différent de l'ordre de lecture attendu
// (alphabétique-ish, comme les facettes réelles) : le test d'ordre ci-dessous
// prouve que la vue retrie bien par count décroissant.
const ITEMS: LibelleMosaicItem[] = [
  { name: "Écologie", slug: "ecologie", count: 4 },
  { name: "Marxismes", slug: "marxismes", count: 8 },
  { name: "Politique et lutte de classes en France", slug: "politique", count: 5 },
  { name: "Tous les livres", slug: null, count: 12 },
];

const hrefFor = (slug: string | null) =>
  slug ? `/catalogue?libelle=${slug}` : "/catalogue";

function render(over: { activeLibelle?: string; items?: LibelleMosaicItem[] } = {}) {
  return renderToStaticMarkup(
    <LibelleMosaic
      items={over.items ?? ITEMS}
      activeLibelle={over.activeLibelle}
      hrefFor={hrefFor}
      ariaLabel="Libellés du catalogue"
    />,
  );
}

/** Classes du lien qui rend `name` — le nom ouvre le contenu du lien (un
 *  `LinkPendingHint` peut suivre, d'où `>${name}<` et non `>${name}</a>`). */
function linkClasses(markup: string, name: string): string[] {
  const match = markup.match(new RegExp(`<a[^>]*class="([^"]*)"[^>]*>${name}<`));
  expect(match, `lien « ${name} » introuvable`).not.toBeNull();
  return match![1].split(/\s+/).filter(Boolean);
}

/**
 * Familles d'utilitaires qui DÉPLACENT la mise en page. Les diffs actif/repos
 * ne doivent contenir que de la peinture (bg-*, text-<couleur>, outline-*,
 * hover:*…) — un `px-*`/`text-[…px]`/`font-*` qui n'apparaît que d'un côté
 * ferait bouger le paragraphe au survol : c'est le bug que ce test interdit.
 * Le préfixe de variante (`hover:` etc.) est retiré avant comparaison.
 */
const GEOMETRY =
  /^(p[xytlrbse]?-|m[xytlrbse]?-|text-\[|leading-|tracking-|font-|border|size-|w-|h-|gap-|min-|max-|indent-|inline|block|flex|grid)/;

function expectPaintOnlyDiff(rest: string[], active: string[]) {
  const diff = [
    ...active.filter((c) => !rest.includes(c)),
    ...rest.filter((c) => !active.includes(c)),
  ];
  expect(diff.length).toBeGreaterThan(0); // la peinture, elle, change bien
  for (const cls of diff) {
    const utility = cls.split(":").pop()!;
    expect(utility, `« ${cls} » change la géométrie entre états`).not.toMatch(
      GEOMETRY,
    );
  }
}

describe("LibelleMosaic — index-manifeste", () => {
  it("rend tous les libellés en entier, dans un nav étiqueté", () => {
    const markup = render();
    expect(markup).toMatch(/<nav[^>]*aria-label="Libellés du catalogue"/);
    for (const item of ITEMS) expect(markup).toContain(item.name);
  });

  it("n'affiche AUCUN chiffre (le compte de livres ne réapparaît jamais)", () => {
    // Le texte seul : les classes (`text-[15px]`…) et les hrefs portent des
    // chiffres légitimes, l'exigence client ne concerne que le rendu visible.
    const text = render().replace(/<[^>]*>/g, "");
    expect(text).not.toMatch(/\d/);
  });

  it("hrefs : bannière vers hrefFor(null), libellé vers son slug", () => {
    const markup = render();
    expect(markup).toMatch(/<a[^>]*href="\/catalogue"[^>]*>Tous les livres/);
    expect(markup).toMatch(
      /<a[^>]*href="\/catalogue\?libelle=marxismes"[^>]*>Marxismes/,
    );
  });

  it("ordre de LECTURE : count décroissant, pas l'ordre d'entrée", () => {
    const markup = render();
    const at = (name: string) => {
      const i = markup.indexOf(name);
      expect(i, `« ${name} » introuvable`).toBeGreaterThan(-1);
      return i;
    };
    // Bannière (12) d'abord, puis Marxismes (8), Politique… (5), Écologie (4).
    expect(at("Tous les livres")).toBeLessThan(at("Marxismes"));
    expect(at("Marxismes")).toBeLessThan(
      at("Politique et lutte de classes en France"),
    );
    expect(at("Politique et lutte de classes en France")).toBeLessThan(
      at("Écologie"),
    );
  });

  it("bannière active (aria-current) quand aucun libellé n'est filtré", () => {
    const markup = render();
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>Tous les livres/);
    expect(markup).not.toMatch(/aria-current="page"[^>]*>Marxismes/);
  });

  it("aria-current posé sur le libellé actif, et sur lui seul", () => {
    const markup = render({ activeLibelle: "marxismes" });
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>Marxismes/);
    expect(markup).not.toMatch(/aria-current="page"[^>]*>Tous les livres/);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("géométrie invariante d'un mot : actif et repos ne diffèrent que par la peinture", () => {
    expectPaintOnlyDiff(
      linkClasses(render(), "Marxismes"),
      linkClasses(render({ activeLibelle: "marxismes" }), "Marxismes"),
    );
  });

  it("géométrie invariante de la bannière : active et repos, peinture seule", () => {
    // La bannière est active sans filtre, inactive dès qu'un libellé l'est.
    expectPaintOnlyDiff(
      linkClasses(render({ activeLibelle: "marxismes" }), "Tous les livres"),
      linkClasses(render(), "Tous les livres"),
    );
  });

  it("séparateurs décoratifs hors de l'arbre accessible", () => {
    const markup = render();
    // Ciblé par sa classe (`mx-1…`) : les liens portent aussi des spans
    // `aria-hidden` (le témoin `LinkPendingHint`), qui ne sont pas des
    // séparateurs. Un séparateur ENTRE chaque paire de libellés du paragraphe
    // (3 libellés hors bannière → 2), jamais avant le premier.
    const separators = markup.match(/<span aria-hidden="true" class="mx-1[^"]*"><\/span>/g);
    expect(separators).toHaveLength(2);
  });

  it("repli sans bannière : tout coule dans le paragraphe, sans erreur", () => {
    const sansBanniere = ITEMS.filter((item) => item.slug !== null);
    const markup = render({ items: sansBanniere });
    for (const item of sansBanniere) expect(markup).toContain(item.name);
    expect(markup).not.toContain("Tous les livres");
  });

  it("bannière seule : aucun paragraphe vide n'est rendu", () => {
    const markup = render({
      items: [{ name: "Tous les livres", slug: null, count: 5 }],
    });
    expect(markup).toContain("Tous les livres");
    expect(markup).not.toContain("<p");
  });
});

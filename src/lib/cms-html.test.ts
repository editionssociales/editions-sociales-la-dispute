import { describe, expect, it } from "vitest";
import { cmsExcerpt, sanitizeCms } from "./cms-html";

describe("sanitizeCms", () => {
  it("supprime les balises script et leur contenu", () => {
    const out = sanitizeCms("<p>ok</p><script>alert(1)</script>");
    expect(out).toContain("<p>ok</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  it("retire les gestionnaires d'événements en ligne", () => {
    const out = sanitizeCms('<img src="https://x/y.jpg" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
  });

  it("neutralise les URL javascript:", () => {
    const out = sanitizeCms('<a href="javascript:alert(1)">clic</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("clic");
  });

  it("force les images http en https et ajoute le lazy-loading", () => {
    const out = sanitizeCms('<img src="http://medias.ovh/couv.jpg" alt="c">');
    expect(out).toContain('src="https://medias.ovh/couv.jpg"');
    expect(out).toContain('loading="lazy"');
  });

  it("durcit les liens sortants (rel noopener)", () => {
    const out = sanitizeCms('<a href="https://ex.org">ext</a>');
    expect(out).toContain("noopener");
  });

  it("retire les shortcodes WordPress mais garde les crochets numériques", () => {
    const out = sanitizeCms('<p>[caption id="1"]Une légende[/caption] et une note [1]</p>');
    expect(out).not.toContain("[caption");
    expect(out).not.toContain("[/caption]");
    expect(out).toContain("Une légende");
    expect(out).toContain("[1]"); // note de bas de page préservée
  });

  it("conserve la prose autorisée (gras, listes, liens sûrs)", () => {
    const out = sanitizeCms("<p><strong>Titre</strong></p><ul><li>a</li></ul>");
    expect(out).toContain("<strong>Titre</strong>");
    expect(out).toContain("<li>a</li>");
  });

  it("préserve la structure des tableaux (colspan/rowspan)", () => {
    const out = sanitizeCms('<table><tr><td colspan="2">A</td></tr></table>');
    expect(out).toContain('colspan="2"');
  });
});

describe("cmsExcerpt", () => {
  it("retire balises et shortcodes, normalise les espaces", () => {
    expect(cmsExcerpt("<p>Bonjour <b>le</b> [gallery] monde</p>")).toBe("Bonjour le monde");
  });

  it("tronque avec une ellipse au-delà de la longueur max", () => {
    const out = cmsExcerpt("<p>abcdefghij</p>", 5);
    expect(out).toBe("abcde…");
  });
});

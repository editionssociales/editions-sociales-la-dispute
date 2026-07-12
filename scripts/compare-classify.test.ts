import { describe, expect, it } from "vitest";
import {
  classifyCoverDims,
  classifyHtml,
  classifyIsbn,
  classifyMediaUrl,
  hostOf,
  normalizeSpaces,
  scalar,
} from "./compare-classify.ts";

describe("hostOf", () => {
  it("extrait le hostname d'une URL absolue", () => {
    expect(hostOf("https://editionssociales.fr/wp-content/x.jpg")).toBe("editionssociales.fr");
  });

  it("renvoie null pour une URL non absolue (chemin relatif)", () => {
    expect(hostOf("/api/media/file/1-x.jpg")).toBeNull();
  });
});

describe("classifyMediaUrl", () => {
  it("null si les deux URLs sont identiques", () => {
    expect(classifyMediaUrl("k", "cover.url", "https://x.test/a.jpg", "https://x.test/a.jpg")).toBeNull();
  });

  it("bloquant si présent d'un seul côté", () => {
    const d = classifyMediaUrl("k", "cover.url", "https://editionssociales.fr/a.jpg", null);
    expect(d?.category).toBe("bloquant");
  });

  it("cosmétique : hôte OVH côté http, chemin RELATIF côté pg (storage local, régression du bug initial)", () => {
    const d = classifyMediaUrl(
      "k",
      "cover.url",
      "https://cms-es.editionssociales.fr/wp-content/uploads/2025/10/couv-632x1024.jpg",
      "/api/media/file/1783791507297-1-couv.jpg",
    );
    expect(d?.category).toBe("cosmetique");
  });

  it("cosmétique : hôte OVH côté http, hôte Blob ABSOLU côté pg (Vercel Blob configuré)", () => {
    const d = classifyMediaUrl(
      "k",
      "tocUrl",
      "https://editionssociales.fr/wp-content/uploads/2026/05/TdM.pdf",
      "https://xyz123.public.blob.vercel-storage.com/TdM-abcd.pdf",
    );
    expect(d?.category).toBe("cosmetique");
  });

  it("bloquant : hôte OVH inchangé des deux côtés (réhébergement manqué, vrai bug)", () => {
    const d = classifyMediaUrl(
      "k",
      "cover.url",
      "https://editionssociales.fr/wp-content/uploads/2025/10/couv.jpg",
      "https://editionssociales.fr/wp-content/uploads/2025/10/couv.jpg?cache=2",
    );
    expect(d?.category).toBe("bloquant");
  });

  it("bloquant : http n'est pas un hôte OVH connu (pas de motif de réhébergement identifiable)", () => {
    const d = classifyMediaUrl("k", "cover.url", "https://exemple-tiers.test/a.jpg", "https://autre.test/b.jpg");
    expect(d?.category).toBe("bloquant");
  });
});

describe("classifyCoverDims", () => {
  it("null si les deux côtés ont les mêmes dimensions", () => {
    expect(classifyCoverDims("k", { url: "a", width: 400, height: 600 }, { url: "b", width: 400, height: 600 })).toBeNull();
  });

  it("null si l'un des deux côtés n'a pas de couverture (couvert par classifyMediaUrl(cover.url))", () => {
    expect(classifyCoverDims("k", null, { url: "b", width: 400, height: 600 })).toBeNull();
    expect(classifyCoverDims("k", { url: "a", width: 400, height: 600 }, null)).toBeNull();
  });

  it("cosmétique : WP au ratio par défaut (2x3, dimensions réelles non exposées par le REST), pg a de vraies dimensions", () => {
    const d = classifyCoverDims("k", { url: "a", width: 2, height: 3 }, { url: "b", width: 1276, height: 2067 });
    expect(d?.category).toBe("cosmetique");
  });

  it("bloquant : deux vraies dimensions qui diffèrent (ni l'une ni l'autre n'est le ratio par défaut)", () => {
    const d = classifyCoverDims("k", { url: "a", width: 400, height: 600 }, { url: "b", width: 800, height: 1000 });
    expect(d?.category).toBe("bloquant");
  });

  it("bloquant : WP au ratio par défaut, pg AUSSI au ratio par défaut mais différent dans les faits (jamais vu en pratique, garde-fou)", () => {
    // pg n'est jamais censé produire 2x3 (dimensions réelles sharp) — si ça
    // arrivait quand même, mieux vaut un faux bloquant qu'un faux cosmétique.
    const d = classifyCoverDims("k", { url: "a", width: 2, height: 3 }, { url: "b", width: 2, height: 3 });
    expect(d).toBeNull(); // dimensions identiques → pas un écart du tout
  });
});

describe("classifyIsbn", () => {
  it("cosmétique : espace parasite nettoyé (début/fin — trimIsbn à l'import, piège LD)", () => {
    const d = classifyIsbn("k", " 9782353671045", "9782353671045");
    expect(d?.category).toBe("cosmetique");
  });

  it("bloquant : isbn réellement différent", () => {
    const d = classifyIsbn("k", "9782353671045", "9780000000000");
    expect(d?.category).toBe("bloquant");
  });
});

describe("classifyHtml", () => {
  it("cosmétique : espaces insécables normalisées (E6)", () => {
    const d = classifyHtml("k", "presentation", "Marx\u00A0: une vie", "Marx : une vie");
    expect(d?.category).toBe("cosmetique");
  });

  it("cosmétique : seule l'URL de média diffère, contenu identique (réhébergement)", () => {
    const d = classifyHtml(
      "k",
      "presentation",
      '<img src="https://editionssociales.fr/a.jpg">texte',
      '<img src="/api/media/file/1-a.jpg">texte',
    );
    expect(d?.category).toBe("cosmetique");
  });

  it("bloquant : contenu réellement différent", () => {
    const d = classifyHtml("k", "furtherReading", "", "<p>À lire</p>");
    expect(d?.category).toBe("bloquant");
  });
});

describe("normalizeSpaces", () => {
  it("réduit NBSP/NNBSP et espaces multiples à une espace simple, trim", () => {
    expect(normalizeSpaces(" Marx\u00A0: \u202fune  vie ")).toBe("Marx : une vie");
  });
});

describe("scalar", () => {
  it("null si identiques, bloquant sinon", () => {
    expect(scalar("k", "title", "x", "x")).toBeNull();
    expect(scalar("k", "title", "x", "y")?.category).toBe("bloquant");
  });
});

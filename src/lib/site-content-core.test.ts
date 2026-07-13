import { describe, expect, it } from "vitest";
import {
  mergePageAPropos,
  mergePagesLegales,
  mergeReglagesSite,
  richTextToSafeHtml,
} from "./site-content-core";
import { EDITIONS } from "./editions";

/* -------- fixtures lexical (même forme que catalogue-pg-map.test.ts) -------- */

function lexicalDoc(text: string) {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [
        {
          type: "paragraph",
          format: "" as const,
          indent: 0,
          version: 1,
          direction: "ltr" as const,
          children: [
            { type: "text", format: 0, style: "", mode: "normal", detail: 0, text, version: 1 },
          ],
        },
      ],
    },
  };
}

/** Éditeur ouvert puis laissé vide : un paragraphe sans texte (`<p></p>`). */
function lexicalVide() {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: null,
      children: [
        {
          type: "paragraph",
          format: "" as const,
          indent: 0,
          version: 1,
          direction: null,
          children: [],
        },
      ],
    },
  };
}

describe("richTextToSafeHtml — chaîne lexical → sanitizeCms, vide = null", () => {
  it("rend un paragraphe en HTML sûr", () => {
    const html = richTextToSafeHtml(lexicalDoc("Bonjour le monde"));
    expect(html).not.toBeNull();
    expect(html).toContain("Bonjour le monde");
    expect(html).toContain("<p");
  });

  it("absent, null ou non-lexical → null (champ vide = rendu par défaut)", () => {
    expect(richTextToSafeHtml(undefined)).toBeNull();
    expect(richTextToSafeHtml(null)).toBeNull();
    expect(richTextToSafeHtml({ pas: "lexical" })).toBeNull();
  });

  it("éditeur ouvert puis laissé vide (paragraphe sans texte) → null", () => {
    expect(richTextToSafeHtml(lexicalVide())).toBeNull();
  });

  it("le texte passe par sanitizeCms (jamais de balise script interprétée)", () => {
    const html = richTextToSafeHtml(
      lexicalDoc('Attention <script>alert("xss")</script> au texte'),
    );
    expect(html).not.toBeNull();
    expect(html).not.toContain("<script");
    expect(html).toContain("Attention");
  });
});

describe("mergePagesLegales — global vide ⇒ trois pages en rendu par défaut", () => {
  it("global absent (base indisponible) → tout null", () => {
    expect(mergePagesLegales(null)).toEqual({
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
    });
    expect(mergePagesLegales(undefined)).toEqual({
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
    });
  });

  it("document jamais rempli (champs null) → tout null", () => {
    const merged = mergePagesLegales({
      id: 1,
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
    });
    expect(merged).toEqual({ cgv: null, mentionsLegales: null, confidentialite: null });
  });

  it("un onglet rempli ne touche pas les deux autres", () => {
    const merged = mergePagesLegales({
      id: 1,
      cgv: null,
      mentionsLegales: lexicalDoc("SIRET 123 456 789"),
      confidentialite: lexicalVide(),
    });
    expect(merged.cgv).toBeNull();
    expect(merged.confidentialite).toBeNull();
    expect(merged.mentionsLegales).toContain("SIRET");
  });
});

describe("mergeReglagesSite — global vide ⇒ layout et footer actuels, verbatim", () => {
  it("global absent → textes par défaut exacts (contrat d'iso-rendu)", () => {
    const merged = mergeReglagesSite(null);
    expect(merged.footer.adresse).toBe(
      "La maison de la pensée critique, des sciences sociales et du mouvement ouvrier. Paris, France.",
    );
    expect(merged.footer.texteDiffusion).toBe(
      "Vente directe et distribution indépendante — sans mécène ni actionnaire.",
    );
    expect(merged.footer.reseauxSociaux).toEqual([]);
    expect(merged.seo.titre).toBe("Les Éditions sociales x La Dispute");
    expect(merged.seo.description).toBe(
      "Les Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
    );
  });

  it("document sauvegardé sans saisie (champs vides/espaces) → mêmes défauts", () => {
    const merged = mergeReglagesSite({
      id: 1,
      footer: { adresse: "  ", texteDiffusion: "" },
      reseauxSociaux: [],
      seo: { titreParDefaut: null, descriptionParDefaut: "   " },
    });
    expect(merged).toEqual(mergeReglagesSite(null));
  });

  it("chaque champ saisi surcharge son défaut, indépendamment des autres", () => {
    const merged = mergeReglagesSite({
      id: 1,
      footer: { adresse: "12 rue Exemple, 75000 Paris", texteDiffusion: null },
      seo: { titreParDefaut: "Nouveau titre", descriptionParDefaut: null },
    });
    expect(merged.footer.adresse).toBe("12 rue Exemple, 75000 Paris");
    expect(merged.footer.texteDiffusion).toBe(
      "Vente directe et distribution indépendante — sans mécène ni actionnaire.",
    );
    expect(merged.seo.titre).toBe("Nouveau titre");
    expect(merged.seo.description).toContain("essais critiques");
  });

  it("réseaux sociaux : liens gardés dans l'ordre, entrées incomplètes ignorées", () => {
    const merged = mergeReglagesSite({
      id: 1,
      reseauxSociaux: [
        { label: " Instagram ", url: " https://instagram.com/exemple " },
        { label: "", url: "https://mastodon.social/@exemple" },
        { label: "Facebook", url: "  " },
        { label: "Bluesky", url: "https://bsky.app/profile/exemple" },
      ],
    });
    expect(merged.footer.reseauxSociaux).toEqual([
      { label: "Instagram", url: "https://instagram.com/exemple" },
      { label: "Bluesky", url: "https://bsky.app/profile/exemple" },
    ]);
  });
});

describe("mergePageAPropos — global vide ⇒ page actuelle, verbatim", () => {
  it("global absent → textes par défaut exacts + maisons d'EDITION_LIST + sections null", () => {
    const merged = mergePageAPropos(null);
    expect(merged.herosTitre).toBe(
      "La maison de la pensée critique et des sciences sociales",
    );
    expect(merged.herosIntro).toBe(
      "Une maison d'édition de la pensée critique et des sciences sociales, portée par deux fonds historiques — sans rien perdre de ce qui fait leur singularité.",
    );
    expect(merged.citation).toBe(
      "« Renforcer la puissance de penser et d'agir de celles et ceux qui veulent transformer le monde et changer la vie. »",
    );
    expect(merged.citationAttribution).toBe(
      "Campagne 2024, « Sauvez les Éditions sociales et La Dispute »",
    );
    expect(merged.sections).toBeNull();
    expect(merged.maisons).toEqual([
      {
        slug: "editions-sociales",
        name: EDITIONS["editions-sociales"].name,
        shortName: EDITIONS["editions-sociales"].shortName,
        tagline: EDITIONS["editions-sociales"].tagline,
        description: EDITIONS["editions-sociales"].description,
        accent: EDITIONS["editions-sociales"].accent,
      },
      {
        slug: "la-dispute",
        name: EDITIONS["la-dispute"].name,
        shortName: EDITIONS["la-dispute"].shortName,
        tagline: EDITIONS["la-dispute"].tagline,
        description: EDITIONS["la-dispute"].description,
        accent: EDITIONS["la-dispute"].accent,
      },
    ]);
  });

  it("surcharge d'une maison par slug : champ vide = défaut, l'autre maison intacte", () => {
    const merged = mergePageAPropos({
      id: 1,
      maisons: [
        { maison: "la-dispute", nom: "La Dispute (nouveau)", tagline: "", description: "Nouvelle description." },
      ],
    });
    const [es, ld] = merged.maisons;
    expect(es.name).toBe(EDITIONS["editions-sociales"].name);
    expect(ld.name).toBe("La Dispute (nouveau)");
    expect(ld.tagline).toBe(EDITIONS["la-dispute"].tagline);
    expect(ld.description).toBe("Nouvelle description.");
    // L'ordre d'affichage reste celui d'EDITION_LIST, pas celui du tableau admin.
    expect(merged.maisons.map((m) => m.slug)).toEqual(["editions-sociales", "la-dispute"]);
  });

  it("sections : titre requis, richText vide toléré (section titre seul)", () => {
    const merged = mergePageAPropos({
      id: 1,
      sections: [
        { titre: "Nous rencontrer", contenu: lexicalDoc("Toutes nos dates.") },
        { titre: "  ", contenu: lexicalDoc("Perdue (sans titre).") },
        { titre: "Sans contenu", contenu: null },
      ],
    });
    expect(merged.sections).not.toBeNull();
    expect(merged.sections).toHaveLength(2);
    expect(merged.sections![0].titre).toBe("Nous rencontrer");
    expect(merged.sections![0].html).toContain("Toutes nos dates.");
    expect(merged.sections![1]).toEqual({ titre: "Sans contenu", html: null });
  });

  it("tableau de sections vide ou sans titre valide → null (section « Le catalogue » en dur)", () => {
    expect(mergePageAPropos({ id: 1, sections: [] }).sections).toBeNull();
    expect(
      mergePageAPropos({ id: 1, sections: [{ titre: " ", contenu: null }] }).sections,
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  mergePageAPropos,
  mergePageSouscription,
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

describe("mergeReglagesSite — pages-legales (pied/SEO) vide ⇒ layout et footer actuels", () => {
  it("global absent → textes par défaut exacts (contrat d'iso-rendu)", () => {
    const merged = mergeReglagesSite(null);
    expect(merged.footer.adresse).toBe(
      "La maison de la pensée critique, des sciences sociales et du mouvement ouvrier. Paris, France.",
    );
    expect(merged.footer.reseauxSociaux).toEqual([]);
    expect(merged.seo.titre).toBe("Les Éditions sociales × La Dispute");
    expect(merged.seo.description).toBe(
      "Les Éditions sociales × La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
    );
  });

  it("document sauvegardé sans saisie (champs vides/espaces) → mêmes défauts", () => {
    const merged = mergeReglagesSite({
      id: 1,
      footer: { adresse: "  " },
      reseauxSociaux: [],
      seo: { titreParDefaut: null, descriptionParDefaut: "   " },
    });
    expect(merged).toEqual(mergeReglagesSite(null));
  });

  it("chaque champ saisi surcharge son défaut, indépendamment des autres", () => {
    const merged = mergeReglagesSite({
      id: 1,
      footer: { adresse: "12 rue Exemple, 75000 Paris" },
      seo: { titreParDefaut: "Nouveau titre", descriptionParDefaut: null },
    });
    expect(merged.footer.adresse).toBe("12 rue Exemple, 75000 Paris");
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

describe("mergePageSouscription — global vide ⇒ 9 contreparties par défaut, verbatim", () => {
  it("global absent → 9 contreparties dérivées de DONATION_TIERS, dans l'ordre d'affichage", () => {
    const merged = mergePageSouscription(null);
    expect(merged.contreparties.map((c) => c.tier.id)).toEqual([
      "palier-15",
      "palier-35",
      "palier-50",
      "palier-75",
      "palier-100",
      "palier-200",
      "palier-300",
      "palier-500",
      "palier-1000",
    ]);
    expect(merged.contreparties.map((c) => c.tier.amount)).toEqual([
      15, 35, 50, 75, 100, 200, 300, 500, 1000,
    ]);
    // Un lot verrouillé au hasard (iso-rendu du PDF client « contreparties dans l'ordre »).
    expect(merged.contreparties[0].items).toEqual([
      { texte: "Une planche de stickers", alternative: false },
    ]);
    expect(merged.contreparties[1].items).toEqual([
      { texte: "Manifeste du parti communiste", alternative: false },
      { texte: "Une planche de stickers", alternative: false },
    ]);
    // Règle « ou » sur les défauts : la bande alternative du PDF (préfixe
    // retiré du texte, flag posé — le rendu repose le « ou »).
    expect(merged.contreparties[2].items).toEqual([
      { texte: "Découvrir l'antifascisme", alternative: false },
      { texte: "Contre l'écologie de guerre", alternative: true },
      { texte: "Un tote bag", alternative: false },
      { texte: "Une planche de stickers", alternative: false },
    ]);
  });

  it("global absent ou document jamais rempli (array vide) → mêmes 9 cartes par défaut", () => {
    expect(mergePageSouscription(undefined)).toEqual(mergePageSouscription(null));
    expect(mergePageSouscription({ id: 1, contreparties: [] })).toEqual(
      mergePageSouscription(null),
    );
  });

  it("le montant et l'intitulé d'une contrepartie saisie viennent TOUJOURS de la table", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [
        {
          tierId: "palier-35",
          items: [{ texte: " Un livre au choix " }, { texte: "  " }],
        },
      ],
    });
    expect(merged.contreparties).toHaveLength(1);
    const [carte] = merged.contreparties;
    expect(carte.tier.amount).toBe(35);
    expect(carte.tier.title).toBe("Coup de main");
    expect(carte.items).toEqual([{ texte: "Un livre au choix", alternative: false }]);
  });

  it("règle « ou » sur une saisie back-office : préfixe (insensible à la casse) retiré, flag posé — « Ouvrage » n'est pas un « ou »", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [
        {
          tierId: "palier-50",
          items: [
            { texte: "Un premier livre" },
            { texte: "ou un second livre" },
            { texte: "Ou un troisième" },
            { texte: "Ouvrage sans alternative" },
          ],
        },
      ],
    });
    expect(merged.contreparties[0].items).toEqual([
      { texte: "Un premier livre", alternative: false },
      { texte: "un second livre", alternative: true },
      { texte: "un troisième", alternative: true },
      { texte: "Ouvrage sans alternative", alternative: false },
    ]);
  });

  it("entrée dont le palier a disparu de la table → ignorée ; toutes invalides → défauts", () => {
    const merged = mergePageSouscription({
      id: 1,
      // Palier retiré de DONATION_TIERS après saisie (dérive de table) :
      // présentation seulement, l'entrée est ignorée sans casser la page.
      contreparties: [{ tierId: "palier-disparu" as never, items: [] }],
    });
    expect(merged.contreparties.map((c) => c.tier.amount)).toEqual([
      15, 35, 50, 75, 100, 200, 300, 500, 1000,
    ]);
  });

  it("un array rempli remplace entièrement le défaut (pas de fusion partielle)", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [{ tierId: "palier-15", items: [{ texte: "Un seul lot" }] }],
    });
    expect(merged.contreparties).toHaveLength(1);
    expect(merged.contreparties[0].items).toEqual([
      { texte: "Un seul lot", alternative: false },
    ]);
  });
});

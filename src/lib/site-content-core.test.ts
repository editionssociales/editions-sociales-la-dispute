import { describe, expect, it } from "vitest";
import {
  mergePageAPropos,
  mergePageContact,
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

describe("mergePageAPropos — global vide ⇒ pages maisons actuelles, verbatim", () => {
  it("global absent → équipe/dépôt manuscrit par défaut + maisons d'EDITION_LIST + bureau par défaut", () => {
    const merged = mergePageAPropos(null);
    expect(merged.equipePermanente).toBe(
      "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes",
    );
    expect(merged.depotManuscrit).toEqual({
      email: "manuscritsldes@gmail.com",
      html: null,
    });
    expect(merged.maisons).toEqual([
      {
        slug: "editions-sociales",
        name: EDITIONS["editions-sociales"].name,
        shortName: EDITIONS["editions-sociales"].shortName,
        tagline: EDITIONS["editions-sociales"].tagline,
        description: EDITIONS["editions-sociales"].description,
        accent: EDITIONS["editions-sociales"].accent,
        bureau: merged.maisons[0].bureau,
      },
      {
        slug: "la-dispute",
        name: EDITIONS["la-dispute"].name,
        shortName: EDITIONS["la-dispute"].shortName,
        tagline: EDITIONS["la-dispute"].tagline,
        description: EDITIONS["la-dispute"].description,
        accent: EDITIONS["la-dispute"].accent,
        bureau: merged.maisons[1].bureau,
      },
    ]);
    // Bureaux par défaut verrouillés (extraits verbatim de l'ex-constante
    // `BUREAUX` du JSX) — un seul membre au hasard par maison suffit à
    // détecter une régression de source, la longueur verrouille le compte.
    expect(merged.maisons[0].bureau).toHaveLength(13);
    expect(merged.maisons[0].bureau).toContain("Alexia Blin");
    expect(merged.maisons[1].bureau).toHaveLength(13);
    expect(merged.maisons[1].bureau).toContain("Hélène Stevens");
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

  it("équipe permanente : partagée, indépendante des maisons", () => {
    const merged = mergePageAPropos({ id: 1, equipe: { permanente: "A et B" } });
    expect(merged.equipePermanente).toBe("A et B");
  });

  it("bureau éditorial : une ligne vide est ignorée, tableau vide ⇒ bureau par défaut de CETTE maison", () => {
    const merged = mergePageAPropos({
      id: 1,
      maisons: [
        {
          maison: "editions-sociales",
          bureau: [{ nom: " Nouvelle personne " }, { nom: "  " }],
        },
        { maison: "la-dispute", bureau: [] },
      ],
    });
    const [es, ld] = merged.maisons;
    expect(es.bureau).toEqual(["Nouvelle personne"]);
    // La Dispute n'a rien saisi : son propre défaut, pas celui d'ES.
    expect(ld.bureau).toHaveLength(13);
    expect(ld.bureau).toContain("Noémie Brun");
  });

  it("dépôt de manuscrit : email seul surchargé, texte par défaut (html null) inchangé", () => {
    const merged = mergePageAPropos({ id: 1, depotManuscrit: { email: "nouveau@exemple.fr" } });
    expect(merged.depotManuscrit).toEqual({ email: "nouveau@exemple.fr", html: null });
  });

  it("dépôt de manuscrit : texte saisi ⇒ html non nul, remplace tout le bloc par défaut", () => {
    const merged = mergePageAPropos({
      id: 1,
      depotManuscrit: { texte: lexicalDoc("Nouveau texte de dépôt.") },
    });
    expect(merged.depotManuscrit.html).toContain("Nouveau texte de dépôt.");
  });
});

describe("mergePageContact — global vide ⇒ page /contact actuelle, verbatim", () => {
  it("global absent → titre/intro par défaut exacts", () => {
    const merged = mergePageContact(null);
    expect(merged.titre).toBe("Contact");
    expect(merged.intro).toBe(
      "Une question sur un livre, une commande, une proposition éditoriale ? Écrivez-nous, nous vous répondrons dès que possible.",
    );
  });

  it("document sauvegardé sans saisie (champs vides/espaces) → mêmes défauts", () => {
    expect(mergePageContact({ id: 1, titre: "  ", intro: null })).toEqual(
      mergePageContact(null),
    );
  });

  it("chaque champ saisi surcharge son défaut indépendamment", () => {
    const merged = mergePageContact({ id: 1, titre: "Écrivez-nous" });
    expect(merged.titre).toBe("Écrivez-nous");
    expect(merged.intro).toBe(mergePageContact(null).intro);
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

describe("mergePageSouscription — titre/récit/objectifs (refonte sobre 2026-08-21)", () => {
  it("global absent → titre, quatre sections et objectifs en textes par défaut, verbatim", () => {
    const merged = mergePageSouscription(null);
    expect(merged.titre).toEqual({
      titre: "100 ans",
      sousTitre: "d’édition marxiste :",
      demande: "aidez-nous à poursuivre l’histoire.",
    });
    expect(merged.recit.danger).toEqual({
      titre: "Édition indépendante et critique :",
      titreItalique: "Danger maximal",
      corps: null,
    });
    expect(merged.recit.guerre).toEqual({
      titre: "La guerre culturelle est aussi",
      titreItalique: "une guerre matérielle",
      corps: null,
    });
    // Sections sans 2ᵉ ligne (une seule ligne dans le bandeau) : `titreItalique` reste `null`.
    expect(merged.recit.maisons).toEqual({
      titre: "Les éditions sociales et La Dispute",
      titreItalique: null,
      corps: null,
    });
    expect(merged.recit.appel).toEqual({
      titre: "Nous avons besoin de vous",
      titreItalique: null,
      corps: null,
    });
    expect(merged.objectifs).toEqual({
      descriptif50:
        "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
      descriptif80:
        "Nous pouvons absorber l’essentiel de la perte, mener à bien les projets déjà engagés et confirmer l’arrivée de Nicolas Vieillescazes dans l’équipe.",
      descriptif100:
        "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    });
  });

  it("global absent ou jamais rempli → même rendu (titre/récit/objectifs)", () => {
    expect(mergePageSouscription(undefined).titre).toEqual(mergePageSouscription(null).titre);
    expect(mergePageSouscription({ id: 1 }).recit).toEqual(mergePageSouscription(null).recit);
    expect(mergePageSouscription({ id: 1 }).objectifs).toEqual(
      mergePageSouscription(null).objectifs,
    );
  });

  it("surcharge du titre : champ par champ, les deux autres restent au défaut", () => {
    const merged = mergePageSouscription({ id: 1, titre: "80 ans" });
    expect(merged.titre.titre).toBe("80 ans");
    expect(merged.titre.sousTitre).toBe("d’édition marxiste :");
    expect(merged.titre.demande).toBe("aidez-nous à poursuivre l’histoire.");
  });

  it("surcharge d'une section : titre/2ᵉ ligne/corps indépendants, les trois autres sections intactes", () => {
    const merged = mergePageSouscription({
      id: 1,
      danger: {
        titre: "Nouveau titre",
        titreItalique: "Nouvelle 2ᵉ ligne",
        corps: lexicalDoc("Nouveau corps."),
      },
    });
    expect(merged.recit.danger.titre).toBe("Nouveau titre");
    expect(merged.recit.danger.titreItalique).toBe("Nouvelle 2ᵉ ligne");
    expect(merged.recit.danger.corps).not.toBeNull();
    expect(merged.recit.danger.corps).toContain("Nouveau corps.");
    // Les trois autres sections n'ont pas bougé.
    expect(merged.recit.guerre).toEqual({
      titre: "La guerre culturelle est aussi",
      titreItalique: "une guerre matérielle",
      corps: null,
    });
  });

  it("une section sans 2ᵉ ligne par défaut (maisons/appel) peut en recevoir une par saisie", () => {
    const merged = mergePageSouscription({
      id: 1,
      maisons: { titreItalique: "Ajoutée en admin" },
    });
    expect(merged.recit.maisons.titre).toBe("Les éditions sociales et La Dispute");
    expect(merged.recit.maisons.titreItalique).toBe("Ajoutée en admin");
  });

  it("corps vide (éditeur ouvert puis laissé vide) → null, comme un corps jamais saisi", () => {
    const merged = mergePageSouscription({ id: 1, appel: { corps: lexicalVide() } });
    expect(merged.recit.appel.corps).toBeNull();
  });

  it("surcharge d'une seule description d'objectif : les deux autres restent au défaut", () => {
    const merged = mergePageSouscription({
      id: 1,
      objectifs: { descriptif80: "Nouveau texte pour 80 000 €." },
    });
    expect(merged.objectifs.descriptif50).toBe(
      "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
    );
    expect(merged.objectifs.descriptif80).toBe("Nouveau texte pour 80 000 €.");
    expect(merged.objectifs.descriptif100).toBe(
      "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    );
  });
});

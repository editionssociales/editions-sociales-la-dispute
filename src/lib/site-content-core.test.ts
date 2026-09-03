import { describe, expect, it } from "vitest";
import {
  mergePageAPropos,
  mergePageContact,
  mergePageSouscription,
  mergePagesLegales,
  mergeReglagesSite,
  richTextToSafeHtml,
} from "./site-content-core";
import { DELIVERY_DELAY_RANGE } from "./delivery-copy";
import { CAMPAIGN_2026_PALIERS } from "./donation-tiers";
import { EDITIONS } from "./editions";
import type { Media } from "../payload-types";

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
  it("global absent (base indisponible) → tout null, délai de livraison par défaut", () => {
    expect(mergePagesLegales(null)).toEqual({
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
      livraisonDelai: DELIVERY_DELAY_RANGE,
    });
    expect(mergePagesLegales(undefined)).toEqual({
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
      livraisonDelai: DELIVERY_DELAY_RANGE,
    });
  });

  it("document jamais rempli (champs null) → tout null, délai de livraison par défaut", () => {
    const merged = mergePagesLegales({
      id: 1,
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
      livraisonDelai: null,
    });
    expect(merged).toEqual({
      cgv: null,
      mentionsLegales: null,
      confidentialite: null,
      livraisonDelai: DELIVERY_DELAY_RANGE,
    });
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

  it("délai de livraison : saisi → surcharge, vide/espaces → défaut dur, indépendant des trois onglets", () => {
    expect(mergePagesLegales({ id: 1, livraisonDelai: "sous 5 jours ouvrés" }).livraisonDelai).toBe(
      "sous 5 jours ouvrés",
    );
    expect(mergePagesLegales({ id: 1, livraisonDelai: "   " }).livraisonDelai).toBe(
      DELIVERY_DELAY_RANGE,
    );
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
  it("global absent → 9 contreparties, ordre Clara 2026-08-30 (50, 35, 15, 100, puis la suite)", () => {
    const merged = mergePageSouscription(null);
    expect(merged.contreparties.map((c) => c.tier.id)).toEqual([
      "palier-50",
      "palier-35",
      "palier-15",
      "palier-100",
      "palier-75",
      "palier-200",
      "palier-300",
      "palier-500",
      "palier-1000",
    ]);
    expect(merged.contreparties.map((c) => c.tier.amount)).toEqual([
      50, 35, 15, 100, 75, 200, 300, 500, 1000,
    ]);
    // Règle « ou » sur les défauts : la bande alternative du PDF (préfixe
    // retiré du texte, flag posé — le rendu repose le « ou »).
    expect(merged.contreparties[0].items).toEqual([
      { texte: "Découvrir l'antifascisme", alternative: false },
      { texte: "Contre l'écologie de guerre", alternative: true },
      { texte: "Un tote bag", alternative: false },
      { texte: "Une planche de stickers", alternative: false },
    ]);
    // Deux lots verrouillés au hasard (iso-rendu du PDF client « contreparties dans l'ordre »).
    expect(merged.contreparties[1].items).toEqual([
      { texte: "Manifeste du parti communiste", alternative: false },
      { texte: "Une planche de stickers", alternative: false },
    ]);
    expect(merged.contreparties[2].items).toEqual([
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
    const carte = merged.contreparties.find((c) => c.tier.id === "palier-35")!;
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
      50, 35, 15, 100, 75, 200, 300, 500, 1000,
    ]);
  });

  it("fusion PAR PALIER (demande client 2026-08-29) : une carte surchargée, les 8 autres restent au défaut — plus le tout-ou-rien d'avant", () => {
    const defaut = mergePageSouscription(null);
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [{ tierId: "palier-15", items: [{ texte: "Un seul lot" }] }],
    });
    // Toujours les 9 cartes, dans l'ordre du défaut — jamais réduit à la
    // seule carte saisie.
    expect(merged.contreparties).toHaveLength(9);
    expect(merged.contreparties.map((c) => c.tier.id)).toEqual(
      defaut.contreparties.map((c) => c.tier.id),
    );
    const palier15 = merged.contreparties.find((c) => c.tier.id === "palier-15")!;
    expect(palier15.items).toEqual([{ texte: "Un seul lot", alternative: false }]);
    // Les 8 autres cartes n'ont pas bougé par rapport au défaut.
    for (const carte of merged.contreparties) {
      if (carte.tier.id === "palier-15") continue;
      const carteDefaut = defaut.contreparties.find((c) => c.tier.id === carte.tier.id)!;
      expect(carte.items).toEqual(carteDefaut.items);
    }
  });

  it("entrée sans item valide (tous vides) : IGNORÉE, la carte garde son défaut (impossible de la vider par accident)", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [{ tierId: "palier-75", items: [{ texte: "   " }] }],
    });
    const palier75 = merged.contreparties.find((c) => c.tier.id === "palier-75")!;
    const defautPalier75 = mergePageSouscription(null).contreparties.find(
      (c) => c.tier.id === "palier-75",
    )!;
    expect(palier75.items).toEqual(defautPalier75.items);
  });

  it("tierId dupliqué dans le tableau CMS : la DERNIÈRE entrée gagne (saisie la plus récente en bas du tableau)", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [
        { tierId: "palier-100", items: [{ texte: "Première saisie, remplacée" }] },
        { tierId: "palier-100", items: [{ texte: "Saisie la plus récente" }] },
      ],
    });
    const palier100 = merged.contreparties.find((c) => c.tier.id === "palier-100")!;
    expect(palier100.items).toEqual([{ texte: "Saisie la plus récente", alternative: false }]);
  });

  it("ordre d'affichage toujours celui du défaut, quel que soit l'ordre de saisie ou le nombre de cartes surchargées au CMS", () => {
    const merged = mergePageSouscription({
      id: 1,
      contreparties: [
        { tierId: "palier-1000", items: [{ texte: "Nouveau lot 1000" }] },
        { tierId: "palier-50", items: [{ texte: "Nouveau lot 50" }] },
      ],
    });
    expect(merged.contreparties.map((c) => c.tier.id)).toEqual([
      "palier-50",
      "palier-35",
      "palier-15",
      "palier-100",
      "palier-75",
      "palier-200",
      "palier-300",
      "palier-500",
      "palier-1000",
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
        "Nous pouvons faire face à l’urgence, poursuivre notre activité éditoriale sans mettre en danger notre équipe.",
      descriptif80:
        "Nous arrivons à absorber l’essentiel des dettes de notre ancien distributeur. Nous pouvons ainsi mener à bien certains projets déjà engagés et confirmer l’embauche de Nicolas Vieillescazes.",
      descriptif100:
        "Nous poursuivons notre lancée éditoriale et nous pouvons lancer une nouvelle collection dont on espère pouvoir vous parler bientôt",
      // Titres courts (2026-08-30) : défaut = les intitulés ACTUELS du code
      // (`CAMPAIGN_2026_PALIERS`), jamais lus en dur ici — la table fait foi.
      titre50: CAMPAIGN_2026_PALIERS[0].label,
      titre80: CAMPAIGN_2026_PALIERS[1].label,
      titre100: CAMPAIGN_2026_PALIERS[2].label,
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
      "Nous pouvons faire face à l’urgence, poursuivre notre activité éditoriale sans mettre en danger notre équipe.",
    );
    expect(merged.objectifs.descriptif80).toBe("Nouveau texte pour 80 000 €.");
    expect(merged.objectifs.descriptif100).toBe(
      "Nous poursuivons notre lancée éditoriale et nous pouvons lancer une nouvelle collection dont on espère pouvoir vous parler bientôt",
    );
  });

  it("titre court d'un palier de jauge éditable (2026-08-30) : surcharge indépendante des deux autres et de la description", () => {
    const merged = mergePageSouscription({
      id: 1,
      objectifs: { titre80: "On tient bon" },
    });
    expect(merged.objectifs.titre50).toBe(CAMPAIGN_2026_PALIERS[0].label);
    expect(merged.objectifs.titre80).toBe("On tient bon");
    expect(merged.objectifs.titre100).toBe(CAMPAIGN_2026_PALIERS[2].label);
    // La description voisine n'a pas bougé.
    expect(merged.objectifs.descriptif80).toBe(
      "Nous arrivons à absorber l’essentiel des dettes de notre ancien distributeur. Nous pouvons ainsi mener à bien certains projets déjà engagés et confirmer l’embauche de Nicolas Vieillescazes.",
    );
  });
});

describe("mergePageSouscription — soutiens (lot D3, 2026-08-30) : contrat de vide DIFFÉRENT des autres champs", () => {
  const media = (overrides: Partial<Media> = {}): Media => ({
    id: 1,
    url: "https://blob.example/soutien.jpg",
    width: 400,
    height: 300,
    updatedAt: "",
    createdAt: "",
    ...overrides,
  });

  it("global absent ou tableau vide → AUCUN visuel, pas de défaut (contrat « Highlight »)", () => {
    expect(mergePageSouscription(null).soutiens).toEqual([]);
    expect(mergePageSouscription({ id: 1, soutiens: [] }).soutiens).toEqual([]);
  });

  it("entrée complète → image/légende/lien résolus, légende reprise comme alt", () => {
    const merged = mergePageSouscription({
      id: 1,
      soutiens: [
        { image: media(), legende: "Un·e libraire soutien", lien: "https://exemple.org" },
      ],
    });
    expect(merged.soutiens).toEqual([
      {
        image: {
          url: "https://blob.example/soutien.jpg",
          width: 400,
          height: 300,
          alt: "Un·e libraire soutien",
        },
        legende: "Un·e libraire soutien",
        lien: "https://exemple.org",
      },
    ]);
  });

  it("légende et lien facultatifs : absents → null, alt vide (décoratif)", () => {
    const merged = mergePageSouscription({ id: 1, soutiens: [{ image: media() }] });
    expect(merged.soutiens[0].legende).toBeNull();
    expect(merged.soutiens[0].lien).toBeNull();
    expect(merged.soutiens[0].image.alt).toBe("");
  });

  it("sans légende, l'alt du média prend le relais (affiches de campagne : le texte est DANS l'image)", () => {
    const merged = mergePageSouscription({
      id: 1,
      soutiens: [{ image: media({ alt: "Untel soutient La Dispute et Les éditions sociales." }) }],
    });
    expect(merged.soutiens[0].legende).toBeNull();
    expect(merged.soutiens[0].image.alt).toBe(
      "Untel soutient La Dispute et Les éditions sociales.",
    );
  });

  it("la légende saisie PRIME sur l'alt du média", () => {
    const merged = mergePageSouscription({
      id: 1,
      soutiens: [{ image: media({ alt: "Alt du média" }), legende: "Légende saisie" }],
    });
    expect(merged.soutiens[0].image.alt).toBe("Légende saisie");
  });

  it("relation image non peuplée (simple id, profondeur insuffisante) → entrée filtrée", () => {
    const merged = mergePageSouscription({
      id: 1,
      // Forme brute possible d'une relation Payload non peuplée.
      soutiens: [{ image: 1 as unknown as Media }],
    });
    expect(merged.soutiens).toEqual([]);
  });

  it("image peuplée mais incomplète (dimensions manquantes) → entrée filtrée, les autres restent", () => {
    const merged = mergePageSouscription({
      id: 1,
      soutiens: [
        { image: media({ width: null, height: null }) },
        { image: media({ id: 2, url: "https://blob.example/second.jpg" }) },
      ],
    });
    expect(merged.soutiens).toHaveLength(1);
    expect(merged.soutiens[0].image.url).toBe("https://blob.example/second.jpg");
  });

  it("ordre de saisie du tableau CMS PRÉSERVÉ (contrat inverse de `contreparties`, dont l'ordre CMS ne pilote rien)", () => {
    const merged = mergePageSouscription({
      id: 1,
      soutiens: [
        { image: media({ id: 10, url: "https://blob.example/dix.jpg" }) },
        { image: media({ id: 20, url: "https://blob.example/vingt.jpg" }) },
      ],
    });
    expect(merged.soutiens.map((s) => s.image.url)).toEqual([
      "https://blob.example/dix.jpg",
      "https://blob.example/vingt.jpg",
    ]);
  });
});

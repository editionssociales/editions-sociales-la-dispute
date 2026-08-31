import { describe, expect, it } from "vitest";
import {
  CONTREPARTIES_2026,
  allContrepartieSlugs,
  contrepartieForTier,
  mergeContrepartieItems,
  resolveContrepartieItems,
  tierHasChoices,
  type ContrepartieItemRef,
} from "./contreparties-core";
import { DONATION_TIERS, type DonationTierId } from "./donation-tiers";

/** Ids des paliers à section `choix` — arbitrages actés (PDF client), verrouillés par ce test. */
const CHOICE_TIER_IDS: DonationTierId[] = ["palier-50", "palier-100", "palier-200", "palier-1000"];

describe("CONTREPARTIES_2026 — structure", () => {
  it("une composition par palier, dans le même ordre que DONATION_TIERS", () => {
    expect(CONTREPARTIES_2026.map((c) => c.tierId)).toEqual(DONATION_TIERS.map((t) => t.id));
  });

  it("paliers à choix = exactement 50/100/200/1000", () => {
    const withChoices = DONATION_TIERS.map((t) => t.id).filter((id) => tierHasChoices(id));
    expect(withChoices).toEqual(CHOICE_TIER_IDS);
  });

  it("chaque section `choix` propose exactement 2 options, chacune non vide", () => {
    for (const composition of CONTREPARTIES_2026) {
      for (const section of composition.sections) {
        if (section.kind !== "choix") continue;
        expect(section.options).toHaveLength(2);
        for (const option of section.options) {
          expect(option.items.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("contrepartieForTier", () => {
  it("retourne la composition du palier demandé", () => {
    expect(contrepartieForTier("palier-15").tierId).toBe("palier-15");
  });

  it("jette pour un palier absent de la table (garde runtime)", () => {
    expect(() => contrepartieForTier("palier-999" as DonationTierId)).toThrow();
  });
});

describe("tierHasChoices", () => {
  it("true pour les 4 paliers à choix, false pour les autres", () => {
    for (const t of DONATION_TIERS) {
      expect(tierHasChoices(t.id)).toBe(CHOICE_TIER_IDS.includes(t.id));
    }
  });
});

describe("resolveContrepartieItems — paliers fixes (sans sélection)", () => {
  it("palier-15", () => {
    expect(resolveContrepartieItems("palier-15", {})).toEqual({
      ok: true,
      items: [{ slug: "planche-de-stickers", qty: 1 }],
    });
  });

  it("palier-35", () => {
    expect(resolveContrepartieItems("palier-35", {})).toEqual({
      ok: true,
      items: [
        { slug: "manifeste-du-parti-communiste", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-75", () => {
    expect(resolveContrepartieItems("palier-75", {})).toEqual({
      ok: true,
      items: [
        { slug: "les-luttes-des-classes-en-france", qty: 1 },
        { slug: "le-communisme-qui-vient", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-300", () => {
    expect(resolveContrepartieItems("palier-300", {})).toEqual({
      ok: true,
      items: [
        { slug: "decoloniser-le-marxisme", qty: 1 },
        { slug: "les-luttes-des-classes-en-france", qty: 1 },
        { slug: "de-metoo-a-noustoutes", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-500", () => {
    expect(resolveContrepartieItems("palier-500", {})).toEqual({
      ok: true,
      items: [
        { slug: "decouvrir-foucault", qty: 1 },
        { slug: "decouvrir-althusser", qty: 1 },
        { slug: "l-etat-et-la-revolution-citoyenne", qty: 1 },
        { slug: "les-guerres-de-lempire-americain-au-moyen-orient", qty: 1 },
        { slug: "clara-zetkin-feministe-sans-frontieres", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("un palier fixe ignore silencieusement une sélection superflue (aucune section `choix` à lire)", () => {
    expect(resolveContrepartieItems("palier-15", { titre: "antifascisme" })).toEqual({
      ok: true,
      items: [{ slug: "planche-de-stickers", qty: 1 }],
    });
  });
});

describe("resolveContrepartieItems — paliers à choix, chaque option", () => {
  it("palier-50 — option « antifascisme »", () => {
    expect(resolveContrepartieItems("palier-50", { titre: "antifascisme" })).toEqual({
      ok: true,
      items: [
        { slug: "decouvrir-lantifascisme", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-50 — option « ecologie-de-guerre »", () => {
    expect(resolveContrepartieItems("palier-50", { titre: "ecologie-de-guerre" })).toEqual({
      ok: true,
      items: [
        { slug: "contre-lecologie-de-guerre", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-100 — option « gaza »", () => {
    expect(resolveContrepartieItems("palier-100", { titre: "gaza" })).toEqual({
      ok: true,
      items: [
        { slug: "gaza-un-genocide-annonce-un-tournant-dans-lhistoire-mondiale", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-100 — option « fascisme-et-dictature »", () => {
    expect(resolveContrepartieItems("palier-100", { titre: "fascisme-et-dictature" })).toEqual({
      ok: true,
      items: [
        { slug: "fascisme-et-dictature", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-200 — option « nouveautes »", () => {
    expect(resolveContrepartieItems("palier-200", { duo: "nouveautes" })).toEqual({
      ok: true,
      items: [
        { slug: "decoloniser-le-marxisme", qty: 1 },
        { slug: "l-etat-et-la-revolution-citoyenne", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-200 — option « decouvrir »", () => {
    expect(resolveContrepartieItems("palier-200", { duo: "decouvrir" })).toEqual({
      ok: true,
      items: [
        { slug: "decouvrir-luxemburg", qty: 1 },
        { slug: "clara-zetkin-feministe-sans-frontieres", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-1000 — option « decouvrir » (pack)", () => {
    expect(resolveContrepartieItems("palier-1000", { pack: "decouvrir" })).toEqual({
      ok: true,
      items: [
        { slug: "selection-15-decouvrir", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });

  it("palier-1000 — option « geme »", () => {
    expect(resolveContrepartieItems("palier-1000", { pack: "geme" })).toEqual({
      ok: true,
      items: [
        { slug: "pack-5-geme", qty: 1 },
        { slug: "totebag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ],
    });
  });
});

describe("resolveContrepartieItems — erreurs", () => {
  it("section `choix` sans sélection → choix-manquant, sectionId de la section", () => {
    expect(resolveContrepartieItems("palier-50", {})).toEqual({
      ok: false,
      reason: "choix-manquant",
      sectionId: "titre",
    });
  });

  it("sectionId reflète l'id réel de la section (« duo » pour palier-200)", () => {
    expect(resolveContrepartieItems("palier-200", {})).toEqual({
      ok: false,
      reason: "choix-manquant",
      sectionId: "duo",
    });
  });

  it("option id inconnue → option-inconnue", () => {
    expect(resolveContrepartieItems("palier-50", { titre: "n-importe-quoi" })).toEqual({
      ok: false,
      reason: "option-inconnue",
      sectionId: "titre",
    });
  });

  it("une sélection d'un autre palier n'aide pas — la section du palier demandé reste sans option", () => {
    expect(resolveContrepartieItems("palier-100", { duo: "nouveautes" })).toEqual({
      ok: false,
      reason: "choix-manquant",
      sectionId: "titre",
    });
  });
});

describe("mergeContrepartieItems — dédup & ordre", () => {
  it("dédup entre listes : qty sommées, ordre d'apparition stable", () => {
    const result = mergeContrepartieItems([
      [
        { slug: "a", qty: 1 },
        { slug: "b", qty: 2 },
      ],
      [{ slug: "a", qty: 3 }],
      [{ slug: "c", qty: 1 }],
    ]);
    expect(result).toEqual([
      { slug: "a", qty: 4 },
      { slug: "b", qty: 2 },
      { slug: "c", qty: 1 },
    ]);
  });

  it("dédup au sein d'une même liste", () => {
    const result = mergeContrepartieItems([
      [
        { slug: "a", qty: 1 },
        { slug: "a", qty: 1 },
      ],
    ]);
    expect(result).toEqual([{ slug: "a", qty: 2 }]);
  });

  it("aucune liste / listes vides → tableau vide", () => {
    expect(mergeContrepartieItems([])).toEqual([]);
    expect(mergeContrepartieItems([[], []])).toEqual([]);
  });

  it("un slug qui réapparaît tard ne déplace pas sa position (ordre = première apparition)", () => {
    const result: ContrepartieItemRef[] = mergeContrepartieItems([
      [{ slug: "premier", qty: 1 }],
      [
        { slug: "second", qty: 1 },
        { slug: "premier", qty: 5 },
      ],
    ]);
    expect(result.map((i) => i.slug)).toEqual(["premier", "second"]);
    expect(result[0]).toEqual({ slug: "premier", qty: 6 });
  });
});

describe("allContrepartieSlugs", () => {
  it("sans doublon", () => {
    const slugs = allContrepartieSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contient les slugs attendus (échantillon), y compris le pivot commun `tote-bag`/`planche-de-stickers`", () => {
    const slugs = allContrepartieSlugs();
    expect(slugs).toEqual(
      expect.arrayContaining([
        "planche-de-stickers",
        "totebag",
        "clara-zetkin-feministe-sans-frontieres",
        "clara-zetkin-feministe-sans-frontieres",
        "selection-15-decouvrir",
        "pack-5-geme",
      ]),
    );
  });

  it("19 slugs distincts au total sur la table 2026 (« Clara Zetkin, féministe sans frontières » sert les paliers 200 ET 500)", () => {
    expect(allContrepartieSlugs()).toHaveLength(19);
  });
});

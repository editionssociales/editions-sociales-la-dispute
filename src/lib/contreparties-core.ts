/**
 * Cœur pur du moteur de contreparties de dons — sélection du CONTENU d'une
 * contrepartie par palier (`donation-tiers.ts`), zéro I/O, seul import
 * autorisé : les types/constantes de `./donation-tiers`. Distinct de
 * `site-content-core.ts:ContrepartieSouscription` (texte éditorial affiché
 * sur `/souscription`, règle « ou » de présentation) : ICI la composition
 * est STRUCTURÉE et RÉSOLUBLE — sections ordonnées, items référencés par
 * SLUG de produit (collection Payload `books`) — consommée par la
 * résolution DB/panier et l'expédition, jamais par le rendu du récit.
 *
 * Un palier compose ses sections dans l'ordre d'affichage : soit `inclus`
 * (items fixes, toujours livrés), soit `choix` (le donateur sélectionne UNE
 * option parmi des options nommées, chacune une liste d'items). Volontaire :
 * AUCUN pool « N parmi X », uniquement inclus et choix-entre-options
 * (arbitrages actés, PDF client « contreparties dans l'ordre »).
 *
 * Slugs validés contre la base prod le 2026-08-21 (audit lecture seule) :
 * fiches existantes reprises telles quelles (dont `totebag`, déjà en vente) ;
 * `planche-de-stickers` et les deux packs du palier 1000 sont créés par la
 * migration `20260821_160000_produits_contreparties`.
 */
import type { DonationTierId } from "./donation-tiers";

/* ------------------------------ types ------------------------------ */

/** Un item de contrepartie : slug du produit (collection Payload `books`) + quantité. */
export interface ContrepartieItemRef {
  slug: string;
  qty: number;
}

/** Une option nommée d'une section `choix` — le donateur en sélectionne UNE. */
export interface ContrepartieChoiceOption {
  id: string;
  label: string;
  items: ContrepartieItemRef[];
}

/**
 * Une section de la composition d'un palier, dans l'ordre d'affichage.
 * `choix` porte son propre `id` (distinct de celui des options) — c'est la
 * clé lue dans `ContrepartieSelection` pour retrouver l'option choisie.
 */
export type ContrepartieSection =
  | { kind: "inclus"; label: string; items: ContrepartieItemRef[] }
  | { kind: "choix"; id: string; label: string; options: ContrepartieChoiceOption[] };

/** Composition complète d'un palier : sections ordonnées (ordre d'affichage ET d'agrégation). */
export interface ContrepartieComposition {
  tierId: DonationTierId;
  sections: readonly ContrepartieSection[];
}

/** Sélection du donateur : id de section `choix` → id d'option choisie. */
export type ContrepartieSelection = Record<string, string>;

/* ------------------------------ données ------------------------------ */

/**
 * Composition 2026 des 9 paliers — source : PDF client « contreparties dans
 * l'ordre », arbitrages actés (même livraison que `site-content-core.ts`
 * §Page Souscription, dont ce module est le pendant STRUCTURÉ). Annotation
 * de type explicite plutôt que `as const satisfies` (style `DONATION_TIERS`) :
 * `items`/`options` sont volontairement des tableaux MUTABLES dans les types
 * ci-dessus (seul `sections` est `readonly`) — un `as const` profond les
 * figerait en tuples `readonly`, incompatibles avec ces types à l'usage.
 * L'annotation donne la même sûreté (discrimination `kind`, `tierId` étroit
 * à `DonationTierId`) sans ce conflit ; même pattern que `CAMPAIGN_2026_PALIERS`
 * juste à côté dans `donation-tiers.ts`.
 */
export const CONTREPARTIES_2026: readonly ContrepartieComposition[] = [
  {
    tierId: "palier-15",
    sections: [{ kind: "inclus", label: "Cadeau", items: [{ slug: "planche-de-stickers", qty: 1 }] }],
  },
  {
    tierId: "palier-35",
    sections: [
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "manifeste-du-parti-communiste", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-50",
    sections: [
      {
        kind: "choix",
        id: "titre",
        label: "Votre titre",
        options: [
          {
            id: "antifascisme",
            label: "Découvrir l'antifascisme",
            items: [{ slug: "decouvrir-lantifascisme", qty: 1 }],
          },
          {
            id: "ecologie-de-guerre",
            label: "Contre l'écologie de guerre",
            items: [{ slug: "contre-lecologie-de-guerre", qty: 1 }],
          },
        ],
      },
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-75",
    sections: [
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "les-luttes-des-classes-en-france", qty: 1 },
          { slug: "le-communisme-qui-vient", qty: 1 },
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-100",
    sections: [
      {
        kind: "choix",
        id: "titre",
        label: "Votre titre",
        options: [
          {
            id: "gaza",
            label: "Gaza, génocide annoncé",
            items: [{ slug: "gaza-un-genocide-annonce-un-tournant-dans-lhistoire-mondiale", qty: 1 }],
          },
          {
            id: "fascisme-et-dictature",
            label: "Fascisme et dictature",
            items: [{ slug: "fascisme-et-dictature", qty: 1 }],
          },
        ],
      },
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-200",
    sections: [
      {
        kind: "choix",
        id: "duo",
        label: "Votre duo de titres",
        options: [
          {
            id: "nouveautes",
            label: "Décoloniser le marxisme + L'État et la révolution citoyenne",
            items: [
              { slug: "decoloniser-le-marxisme", qty: 1 },
              { slug: "l-etat-et-la-revolution-citoyenne", qty: 1 },
            ],
          },
          {
            id: "decouvrir",
            // « Badia » des sources client = Gilbert Badia, auteur de « Clara
            // Zetkin, féministe sans frontières » (pas un « Découvrir ») —
            // résolu à l'audit prod du 2026-08-21.
            label: "Découvrir Luxemburg + Clara Zetkin, féministe sans frontières",
            items: [
              { slug: "decouvrir-luxemburg", qty: 1 },
              { slug: "clara-zetkin-feministe-sans-frontieres", qty: 1 },
            ],
          },
        ],
      },
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-300",
    sections: [
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "decoloniser-le-marxisme", qty: 1 },
          { slug: "les-luttes-des-classes-en-france", qty: 1 },
          { slug: "de-metoo-a-noustoutes", qty: 1 },
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-500",
    sections: [
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "decouvrir-foucault", qty: 1 },
          { slug: "decouvrir-althusser", qty: 1 },
          { slug: "l-etat-et-la-revolution-citoyenne", qty: 1 },
          { slug: "les-guerres-de-lempire-americain-au-moyen-orient", qty: 1 },
          // « Badia » / « Clara Zetkin » des sources client = ce titre de Gilbert Badia (audit 2026-08-21).
          { slug: "clara-zetkin-feministe-sans-frontieres", qty: 1 },
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
  {
    tierId: "palier-1000",
    sections: [
      {
        kind: "choix",
        id: "pack",
        label: "Votre pack",
        options: [
          {
            // Packs composés par la maison, produits dédiés (pas une agrégation d'items unitaires).
            id: "decouvrir",
            label: "La sélection de 15 Découvrir",
            items: [{ slug: "selection-15-decouvrir", qty: 1 }],
          },
          {
            id: "geme",
            label: "Le pack de 5 livres de la GEME",
            items: [{ slug: "pack-5-geme", qty: 1 }],
          },
        ],
      },
      {
        kind: "inclus",
        label: "Cadeaux",
        items: [
          { slug: "totebag", qty: 1 },
          { slug: "planche-de-stickers", qty: 1 },
        ],
      },
    ],
  },
];

/* ------------------------------ lecture ------------------------------ */

/**
 * Composition d'un palier. Jette si le palier est absent de la table —
 * impossible par typage (`DonationTierId` est l'union exacte des ids
 * `DONATION_TIERS`) tant que les deux tables restent synchronisées ; garde
 * runtime uniquement (jamais censée se déclencher).
 */
export function contrepartieForTier(tierId: DonationTierId): ContrepartieComposition {
  const composition = CONTREPARTIES_2026.find((c) => c.tierId === tierId);
  if (!composition) {
    throw new Error(`contreparties-core : palier absent de CONTREPARTIES_2026 : ${tierId}`);
  }
  return composition;
}

/** `true` ssi le palier comporte au moins une section `choix` (donateur à interroger avant résolution). */
export function tierHasChoices(tierId: DonationTierId): boolean {
  return contrepartieForTier(tierId).sections.some((section) => section.kind === "choix");
}

/* ------------------------------ résolution ------------------------------ */

/**
 * Agrège plusieurs listes d'items en un tableau dédupliqué par slug (qty
 * sommées), ordre d'apparition stable (premier slug rencontré fixe sa
 * position — un `Map` préserve l'ordre d'insertion). Extrait de
 * `resolveContrepartieItems` en fonction à part entière pour rester
 * testable indépendamment de `CONTREPARTIES_2026` : aucune composition 2026
 * réelle ne fait aujourd'hui se recouper deux slugs (chaque palier reste
 * volontairement composé d'items distincts), le cas de recouvrement n'est
 * donc exercé qu'ici, avec des fixtures locales.
 */
export function mergeContrepartieItems(
  itemLists: readonly (readonly ContrepartieItemRef[])[],
): ContrepartieItemRef[] {
  const merged = new Map<string, ContrepartieItemRef>();
  for (const items of itemLists) {
    for (const item of items) {
      const existing = merged.get(item.slug);
      if (existing) existing.qty += item.qty;
      else merged.set(item.slug, { slug: item.slug, qty: item.qty });
    }
  }
  return [...merged.values()];
}

export type ResolveContrepartieResult =
  | { ok: true; items: ContrepartieItemRef[] }
  | { ok: false; reason: "choix-manquant" | "option-inconnue"; sectionId: string };

/**
 * Résout la composition d'un palier contre la sélection du donateur : chaque
 * section `choix` DOIT avoir une option sélectionnée et cette option DOIT
 * exister (les clés en trop dans `selection` — d'un autre palier, d'une
 * section disparue — sont silencieusement ignorées, jamais un refus). Échoue
 * sur la PREMIÈRE section `choix` en défaut (ordre de `sections`), jamais de
 * commande partiellement résolue. Agrège ensuite `inclus` + options choisies
 * via `mergeContrepartieItems` (dédup par slug, ordre stable).
 */
export function resolveContrepartieItems(
  tierId: DonationTierId,
  selection: ContrepartieSelection,
): ResolveContrepartieResult {
  const composition = contrepartieForTier(tierId);
  const itemLists: ContrepartieItemRef[][] = [];

  for (const section of composition.sections) {
    if (section.kind === "inclus") {
      itemLists.push(section.items);
      continue;
    }
    const chosenOptionId = selection[section.id];
    if (chosenOptionId === undefined) {
      return { ok: false, reason: "choix-manquant", sectionId: section.id };
    }
    const option = section.options.find((o) => o.id === chosenOptionId);
    if (!option) {
      return { ok: false, reason: "option-inconnue", sectionId: section.id };
    }
    itemLists.push(option.items);
  }

  return { ok: true, items: mergeContrepartieItems(itemLists) };
}

/**
 * Tous les slugs référencés par `CONTREPARTIES_2026`, dédupliqués — sert de
 * base à la résolution DB (relecture Payload des fiches en une passe) et aux
 * vérifs (chaque slug doit exister dans la collection `books`).
 */
export function allContrepartieSlugs(): string[] {
  const slugs = new Set<string>();
  for (const composition of CONTREPARTIES_2026) {
    for (const section of composition.sections) {
      if (section.kind === "inclus") {
        for (const item of section.items) slugs.add(item.slug);
      } else {
        for (const option of section.options) {
          for (const item of option.items) slugs.add(item.slug);
        }
      }
    }
  }
  return [...slugs];
}

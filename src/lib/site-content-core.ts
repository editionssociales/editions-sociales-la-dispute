import { lexicalToHtml } from "./catalogue-pg-map";
import { cmsExcerpt, sanitizeCms, type SafeHtml } from "./cms-html";
import { DONATION_TIERS, type DonationTier } from "./donation-tiers";
import { EDITION_LIST } from "./editions";
import type { Accent } from "./format";
import type { EditionSlug } from "./types";
import type {
  PageAPropos,
  PageSouscription,
  PagesLegales,
} from "@/payload-types";

/**
 * Cœur pur de l'« éditeur de contenus » (spec du 13/07) : fusion des globals
 * Payload « Contenus du site » avec les textes actuels codés en dur, extraits
 * ici en constantes par défaut. Contrat (pattern Highlight généralisé) :
 * global absent, document jamais sauvegardé ou champ vide ⇒ la valeur par
 * défaut — la page rend alors **exactement** son JSX actuel (iso-rendu
 * strict). Aucun seed des défauts dans Payload : ils ne vivent qu'ici.
 *
 * Module pur, sans I/O — testé par `site-content-core.test.ts` ; la lecture
 * Local API vit dans `site-content.ts` (server-only), même découpage que
 * `donations.ts`/`donations-core.ts`.
 */

/**
 * Rend un champ richText lexical en `SafeHtml`, ou `null` si le champ est
 * vide. Même chaîne que la fiche livre : lexical → HTML brut
 * (`lexicalToHtml`) → `sanitizeCms` (unique fabricant de `SafeHtml`).
 * Un éditeur ouvert puis laissé vide produit `<p></p>` : sans texte ni
 * image, le champ compte comme vide — la page garde son rendu par défaut.
 */
export function richTextToSafeHtml(data: unknown): SafeHtml | null {
  const html = lexicalToHtml(data);
  if (!html) return null;
  const safe = sanitizeCms(html);
  if (!cmsExcerpt(safe) && !/<img\b/i.test(safe)) return null;
  return safe;
}

/* ------------------------------------------------------------------ */
/* Pages légales (lot 1)                                               */
/* ------------------------------------------------------------------ */

/**
 * Corps éditables des trois pages légales — `null` = onglet vide, la page
 * rend son JSX en dur (chapeau et sections actuels, placeholders compris).
 */
export interface PagesLegalesContent {
  cgv: SafeHtml | null;
  mentionsLegales: SafeHtml | null;
  confidentialite: SafeHtml | null;
}

/** Fusion du global `pages-legales` — champ par champ, `null` = défaut dur. */
export function mergePagesLegales(
  global: PagesLegales | null | undefined,
): PagesLegalesContent {
  return {
    cgv: richTextToSafeHtml(global?.cgv),
    mentionsLegales: richTextToSafeHtml(global?.mentionsLegales),
    confidentialite: richTextToSafeHtml(global?.confidentialite),
  };
}

/* ------------------------------------------------------------------ */
/* Pied de page + SEO (onglets du global `pages-legales`)               */
/* ------------------------------------------------------------------ */

/** Lien réseau social du pied de page — n'existe que si le client en saisit. */
export interface ReseauSocial {
  label: string;
  url: string;
}

export interface ReglagesSiteContent {
  footer: {
    adresse: string;
    texteDiffusion: string;
    reseauxSociaux: ReseauSocial[];
  };
  seo: {
    titre: string;
    description: string;
  };
}

/**
 * Textes actuels du layout et du pied de page, extraits **verbatim** de
 * `(site)/layout.tsx` et `site-footer.tsx` — le test verrouille ces chaînes
 * pour garantir l'iso-rendu à global vide. Aucun réseau social par défaut :
 * la fonctionnalité n'existait pas (cellule centrale du footer vide).
 */
const REGLAGES_SITE_DEFAUT: ReglagesSiteContent = {
  footer: {
    adresse:
      "La maison de la pensée critique, des sciences sociales et du mouvement ouvrier. Paris, France.",
    texteDiffusion:
      "Vente directe et distribution indépendante — sans mécène ni actionnaire.",
    reseauxSociaux: [],
  },
  seo: {
    titre: "Les Éditions sociales × La Dispute",
    description:
      "Les Éditions sociales × La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
  },
};

/** Chaîne saisie si non vide (espaces exclus), sinon le texte par défaut. */
function texteOuDefaut(saisi: string | null | undefined, defaut: string): string {
  const propre = saisi?.trim();
  return propre ? propre : defaut;
}

/**
 * Fusion pied de page + SEO depuis le global `pages-legales` — champ par
 * champ, vide = défaut dur (ex-`reglages-site`).
 */
export function mergeReglagesSite(
  global: PagesLegales | null | undefined,
): ReglagesSiteContent {
  return {
    footer: {
      adresse: texteOuDefaut(global?.footer?.adresse, REGLAGES_SITE_DEFAUT.footer.adresse),
      texteDiffusion: texteOuDefaut(
        global?.footer?.texteDiffusion,
        REGLAGES_SITE_DEFAUT.footer.texteDiffusion,
      ),
      // Entrée sans libellé ou sans URL (ne devrait pas arriver, champs
      // requis côté admin) : ignorée plutôt que de rendre un lien cassé.
      reseauxSociaux: (global?.reseauxSociaux ?? []).flatMap((lien) => {
        const label = lien.label?.trim();
        const url = lien.url?.trim();
        return label && url ? [{ label, url }] : [];
      }),
    },
    seo: {
      titre: texteOuDefaut(global?.seo?.titreParDefaut, REGLAGES_SITE_DEFAUT.seo.titre),
      description: texteOuDefaut(
        global?.seo?.descriptionParDefaut,
        REGLAGES_SITE_DEFAUT.seo.description,
      ),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Page À propos (lot 3)                                               */
/* ------------------------------------------------------------------ */

/**
 * Une maison de la section « Deux maisons » : textes surchargés champ par
 * champ depuis le global, tout le reste (slug, lien « Découvrir »,
 * couleur d'accent) vient d'`EDITION_LIST` — jamais éditable.
 */
export interface MaisonAPropos {
  slug: EditionSlug;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  accent: Accent;
}

/** Section libre {titre, richText} — `html` null = section titre seul. */
export interface SectionAPropos {
  titre: string;
  html: SafeHtml | null;
}

export interface PageAProposContent {
  herosTitre: string;
  herosIntro: string;
  citation: string;
  citationAttribution: string;
  maisons: MaisonAPropos[];
  /** `null` = aucune section saisie : la page rend sa section « Le catalogue » en dur. */
  sections: SectionAPropos[] | null;
}

/** Textes actuels de `a-propos/page.tsx`, extraits verbatim (iso-rendu). */
const A_PROPOS_DEFAUT = {
  herosTitre: "La maison de la pensée critique et des sciences sociales",
  herosIntro:
    "Une maison d'édition de la pensée critique et des sciences sociales, portée par deux fonds historiques — sans rien perdre de ce qui fait leur singularité.",
  citation:
    "« Renforcer la puissance de penser et d'agir de celles et ceux qui veulent transformer le monde et changer la vie. »",
  citationAttribution: "Campagne 2024, « Sauvez les Éditions sociales et La Dispute »",
};

/** Fusion du global `page-a-propos` — champ par champ, vide = défaut dur. */
export function mergePageAPropos(
  global: PageAPropos | null | undefined,
): PageAProposContent {
  const maisons = EDITION_LIST.map((edition) => {
    // Ancrage par slug (select « Maison » côté admin), pas par ordre des
    // entrées : réordonner le tableau dans /admin ne peut pas intervertir
    // les textes des deux maisons.
    const surcharge = global?.maisons?.find((m) => m.maison === edition.slug);
    return {
      slug: edition.slug,
      shortName: edition.shortName,
      accent: edition.accent,
      name: texteOuDefaut(surcharge?.nom, edition.name),
      tagline: texteOuDefaut(surcharge?.tagline, edition.tagline),
      description: texteOuDefaut(surcharge?.description, edition.description),
    };
  });

  const sections = (global?.sections ?? []).flatMap((section) => {
    const titre = section.titre?.trim();
    if (!titre) return [];
    return [{ titre, html: richTextToSafeHtml(section.contenu) }];
  });

  return {
    herosTitre: texteOuDefaut(global?.heros?.titre, A_PROPOS_DEFAUT.herosTitre),
    herosIntro: texteOuDefaut(global?.heros?.intro, A_PROPOS_DEFAUT.herosIntro),
    citation: texteOuDefaut(global?.citation?.texte, A_PROPOS_DEFAUT.citation),
    citationAttribution: texteOuDefaut(
      global?.citation?.attribution,
      A_PROPOS_DEFAUT.citationAttribution,
    ),
    maisons,
    sections: sections.length > 0 ? sections : null,
  };
}

/* ------------------------------------------------------------------ */
/* Page Souscription (lot 4 — livraison définitive 2026-07-24)          */
/* ------------------------------------------------------------------ */

/**
 * Une ligne du lot d'une contrepartie. `alternative` = ligne « ou … » : un
 * choix avec la ligne précédente (rendue préfixée « ou », sans séparateur).
 */
export interface ContrepartieItem {
  texte: string;
  alternative: boolean;
}

/**
 * Règle « ou » (maquette PDF client) — énoncée ICI une seule fois, pour les
 * défauts ci-dessous comme pour les saisies back-office : une ligne qui
 * commence par le mot « ou » est une alternative à la précédente. Le préfixe
 * est retiré du texte, le rendu le repose (`souscription/page.tsx`).
 */
function parseContrepartieItem(texte: string): ContrepartieItem {
  const alternative = /^ou\s+(.+)$/i.exec(texte);
  return alternative
    ? { texte: alternative[1], alternative: true }
    : { texte, alternative: false };
}

/**
 * Carte de contrepartie : `tier` est TOUJOURS résolu depuis `DONATION_TIERS`
 * (la table qui pilote Stripe via `parseDonation`) — le back-office ne
 * choisit qu'un `tierId`, jamais un montant. Une entrée dont le palier a
 * disparu de la table est ignorée (présentation seulement, le paiement n'est
 * pas concerné).
 */
export interface ContrepartieSouscription {
  tier: DonationTier;
  items: ContrepartieItem[];
}

/**
 * Contenu éditable de `/souscription` : uniquement les 9 cartes de
 * contreparties. Le récit (ask, sections, objectifs, CTA final) est
 * éditorial figé dans `souscription/page.tsx` — livraison client 2026-07-24,
 * pas de CMS pour ces textes-là (consigne : rien qui ne soit un extrait des
 * documents fournis).
 */
export interface PageSouscriptionContent {
  contreparties: ContrepartieSouscription[];
}

/** Palier obligatoire des contenus par défaut — jette au chargement du module si l'id sort de la table. */
function tierObligatoire(id: string): DonationTier {
  const tier = DONATION_TIERS.find((t) => t.id === id);
  if (!tier) {
    throw new Error(`site-content-core : palier DONATION_TIERS inconnu : ${id}`);
  }
  return tier;
}

/**
 * Contreparties définitives de la campagne 2026 (PDF client « contreparties
 * dans l'ordre », livraison Clara du 2026-07-24), extraites **verbatim** —
 * une ligne par bande du PDF, les alternatives portées par la règle « ou ».
 * Les tests verrouillent ces valeurs (iso-rendu).
 */
const SOUSCRIPTION_DEFAUT: PageSouscriptionContent = {
  contreparties: [
    {
      tier: tierObligatoire("palier-15"),
      items: ["Une planche de stickers"],
    },
    {
      tier: tierObligatoire("palier-35"),
      items: ["Manifeste du parti communiste", "Une planche de stickers"],
    },
    {
      tier: tierObligatoire("palier-50"),
      items: [
        "Découvrir l'antifascisme",
        "ou Contre l'écologie de guerre",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      tier: tierObligatoire("palier-75"),
      items: [
        "Les luttes de classes en France",
        "Le communisme qui vient",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      tier: tierObligatoire("palier-100"),
      items: [
        "Gaza, génocide annoncé",
        "ou Fascisme et dictature",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      // TODO(contenu) : le xlsx client dit « 2 nouveautés 2026 — une par
      // maison, sans choix » alors que le PDF propose un choix entre deux
      // paires ; on suit le PDF (plus récent), à confirmer avec Clara. Le
      // PDF écrit « L'État et révolution citoyenne » (titre tronqué) —
      // harmonisé ici avec le titre réel du livre.
      tier: tierObligatoire("palier-200"),
      items: [
        "Décoloniser le marxisme et L'État et la révolution citoyenne",
        "ou Découvrir Luxemburg et Clara Zetkin",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      tier: tierObligatoire("palier-300"),
      items: [
        "Décoloniser le marxisme",
        "Les luttes de classes en France",
        "De #MeToo à #NousToutes",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      tier: tierObligatoire("palier-500"),
      items: [
        "Découvrir Foucault",
        "Découvrir Althusser",
        "L'État et la révolution citoyenne",
        "Les guerres de l'empire américain au Moyen-Orient",
        "Clara Zetkin",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
    {
      tier: tierObligatoire("palier-1000"),
      items: [
        "Une sélection de 15 Découvrir",
        "ou 5 livres de la GEME",
        "Un tote bag",
        "Une planche de stickers",
      ],
    },
  ].map((carte) => ({ ...carte, items: carte.items.map(parseContrepartieItem) })),
};

/**
 * Fusion du global `page-souscription` — bloc unique (contreparties) : un
 * array vide (ou dont toutes les entrées sont invalides) retombe sur les 9
 * cartes par défaut, un array rempli les remplace entièrement.
 */
export function mergePageSouscription(
  global: PageSouscription | null | undefined,
): PageSouscriptionContent {
  const contreparties = (global?.contreparties ?? []).flatMap((entry) => {
    const tier = DONATION_TIERS.find((t) => t.id === entry.tierId);
    if (!tier) return [];
    const items = (entry.items ?? []).flatMap((item) => {
      const texte = item.texte?.trim();
      return texte ? [parseContrepartieItem(texte)] : [];
    });
    return [{ tier, items }];
  });

  return {
    contreparties:
      contreparties.length > 0 ? contreparties : SOUSCRIPTION_DEFAUT.contreparties,
  };
}

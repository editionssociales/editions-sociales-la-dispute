import { lexicalToHtml } from "./catalogue-pg-map";
import { cmsExcerpt, sanitizeCms, type SafeHtml } from "./cms-html";
import { EDITION_LIST } from "./editions";
import type { Accent } from "./format";
import type { EditionSlug } from "./types";
import type { PageAPropos, PagesLegales, ReglagesSite } from "@/payload-types";

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
/* Réglages du site (lot 2)                                            */
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
    titre: "Les Éditions sociales x La Dispute",
    description:
      "Les Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
  },
};

/** Chaîne saisie si non vide (espaces exclus), sinon le texte par défaut. */
function texteOuDefaut(saisi: string | null | undefined, defaut: string): string {
  const propre = saisi?.trim();
  return propre ? propre : defaut;
}

/** Fusion du global `reglages-site` — champ par champ, vide = défaut dur. */
export function mergeReglagesSite(
  global: ReglagesSite | null | undefined,
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

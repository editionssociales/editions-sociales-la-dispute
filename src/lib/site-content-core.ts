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
  ReglagesSite,
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

/* ------------------------------------------------------------------ */
/* Page Souscription (lot 4)                                           */
/* ------------------------------------------------------------------ */

export interface ChantierSouscription {
  titre: string;
  desc: string;
  accent: Accent;
}

/**
 * Carte de contrepartie/mécène : `tier` est TOUJOURS résolu depuis
 * `DONATION_TIERS` (la table qui pilote Stripe via `parseDonation`) — le
 * back-office ne choisit qu'un `tierId`, jamais un montant. Une entrée dont
 * le palier a disparu de la table est ignorée (présentation seulement, le
 * paiement n'est pas concerné).
 */
export interface ContrepartieSouscription {
  tier: DonationTier;
  items: string[];
  soutiens2024: number;
  populaire: boolean;
}

export interface MeceneSouscription {
  tier: DonationTier;
  desc: string;
  soutiens2024: number;
}

export interface FaqSouscription {
  q: string;
  a: string;
}

export interface PageSouscriptionContent {
  herosTitre: string;
  herosIntro: string;
  chantiers: ChantierSouscription[];
  contreparties: ContrepartieSouscription[];
  mecenes: MeceneSouscription[];
  faq: FaqSouscription[];
}

/**
 * Rotation de couleurs des cartes chantiers — reproduit la séquence en dur
 * de la page actuelle (navy, brick, bottle, ocher, navy) : la couleur suit
 * l'ordre des cartes, jamais le contenu (contrat : les accents restent en
 * code, classes Tailwind littérales via `ACCENT_TEXT`).
 */
const CHANTIER_ACCENTS: Accent[] = ["navy", "brick", "bottle", "ocher"];

function chantierAccent(index: number): Accent {
  return CHANTIER_ACCENTS[index % CHANTIER_ACCENTS.length];
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
 * Contenus actuels de `souscription/page.tsx` (repris de la campagne Ulule
 * 2024), extraits **verbatim** — les `\u00a0` reproduisent les `&nbsp;` du
 * JSX d'origine. Les tests verrouillent ces valeurs (iso-rendu).
 */
const SOUSCRIPTION_DEFAUT: PageSouscriptionContent = {
  herosTitre: "En 2024, vous avez sauvé nos maisons",
  herosIntro:
    "En deux semaines, la campagne « Sauvez les Éditions sociales et La Dispute » atteignait les 50\u00a0000\u00a0€ nécessaires pour sortir la tête de l'eau. À l'arrivée, l'objectif était dépassé de loin. Cette solidarité a tout changé — et cette nouvelle souscription en écrit la suite.",
  chantiers: [
    {
      titre: "Consolider l'équipe",
      desc: "Trois éditrices permanentes pour tenir notre rythme de publication et renforcer le travail en direction des libraires et de la presse — indispensable pour défendre nos livres.",
    },
    {
      titre: "Réimprimer les épuisés",
      desc: "Pensée et langage de Vygotski, l'Histoire de la Révolution française de Jaurès, la tétralogie de Lucien Sève, Le travail bénévole de Maud Simonet, les « Découvrir »… Plus de 400 titres aux catalogues, et trop d'épuisés.",
    },
    {
      titre: "Passer au numérique",
      desc: "Doubler le nombre de titres disponibles sur Cairn et proposer enfin nos livres au format numérique.",
    },
    {
      titre: "Sillonner les librairies",
      desc: "Une tournée des librairies indépendantes — elles jouent un rôle décisif pour défendre nos livres — et des initiatives multipliées, dans et hors les murs.",
    },
    {
      titre: "Achever ce site",
      desc: "Un catalogue unifié, une boutique en ligne sans intermédiaire, l'impression des ouvrages à paraître : l'outil que vous avez sous les yeux, à finir de construire.",
    },
  ].map((chantier, i) => ({ ...chantier, accent: chantierAccent(i) })),
  contreparties: [
    {
      tier: tierObligatoire("palier-15"),
      items: ["Une planche de stickers ou un lot de marque-pages au choix"],
      soutiens2024: 108,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-35"),
      items: [
        "Un livre « petit mais irremplaçable » au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 69,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-50"),
      items: [
        "Un livre « essentiel » au choix",
        "Un sac « Make marxism great again » ou un carnet « Pour des savoirs populaires »",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 257,
      populaire: true,
    },
    {
      tier: tierObligatoire("palier-75"),
      items: [
        "Un livre « indispensable » au choix",
        "Sac ou carnet au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 27,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-100"),
      items: [
        "Un « incontournable » au choix",
        "Sac ou carnet au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 63,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-150"),
      items: [
        "Un très grand format au choix — ou une affiche de Dugudus",
        "Sac ou carnet au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 24,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-200"),
      items: [
        "Deux nouveautés de notre programmation au choix",
        "Sac ou carnet au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 15,
      populaire: false,
    },
    {
      tier: tierObligatoire("palier-300"),
      items: [
        "Un lot de grands livres au choix",
        "Sac ou carnet au choix",
        "Stickers ou marque-pages",
      ],
      soutiens2024: 9,
      populaire: false,
    },
  ],
  mecenes: [
    {
      tier: tierObligatoire("mecene-500"),
      desc: "Une rencontre exceptionnelle avec vos éditrices, les membres des bureaux éditoriaux et certain·es de nos auteur·ices — sac ou carnet, stickers et marque-pages compris.",
      soutiens2024: 4,
    },
    {
      tier: tierObligatoire("mecene-1000"),
      desc: "On prend directement contact avec vous pour vous offrir les livres que vous voulez dans nos catalogues — ou l'intégrale de la GEME, la Grande édition Marx-Engels.",
      soutiens2024: 5,
    },
  ],
  faq: [
    {
      q: "À quoi va servir ma contribution ?",
      a: "À consolider l'équipe des maisons, réimprimer les titres épuisés, développer le numérique, aller à la rencontre des libraires — et financer ce nouveau site, son catalogue unifié et sa boutique en ligne, ainsi que l'impression des ouvrages à paraître.",
    },
    {
      q: "Que devient la campagne Ulule de 2024 ?",
      a: "Elle s'est achevée en juillet 2024 à 170 % de son objectif : 85 305 € collectés auprès de 958 contributeur·rices. Elle a permis aux deux maisons de passer le cap. Cette nouvelle souscription est hébergée directement sur notre site : pas de commission de plateforme, 100 % pour la maison.",
    },
    {
      q: "Quand le nouveau site sera-t-il en ligne ?",
      a: "Le catalogue et la page de souscription ouvrent dès maintenant ; la boutique intégrée suit dans un second temps.",
    },
    {
      q: "Puis-je choisir mes livres dans les contreparties ?",
      a: "Oui, une sélection vous sera proposée après votre contribution, pour chaque palier comprenant des livres.",
    },
  ],
};

/**
 * Fusion du global `page-souscription` — bloc par bloc : un array vide (ou
 * dont toutes les entrées sont invalides) retombe sur le contenu par défaut
 * entier, un array rempli remplace entièrement le bloc correspondant.
 */
export function mergePageSouscription(
  global: PageSouscription | null | undefined,
): PageSouscriptionContent {
  const chantiers = (global?.chantiers ?? [])
    .flatMap((chantier) => {
      const titre = chantier.titre?.trim();
      const desc = chantier.desc?.trim();
      return titre && desc ? [{ titre, desc }] : [];
    })
    .map((chantier, i) => ({ ...chantier, accent: chantierAccent(i) }));

  const contreparties = (global?.contreparties ?? []).flatMap((entry) => {
    const tier = DONATION_TIERS.find((t) => t.id === entry.tierId);
    if (!tier) return [];
    const items = (entry.items ?? []).flatMap((item) => {
      const texte = item.texte?.trim();
      return texte ? [texte] : [];
    });
    return [
      {
        tier,
        items,
        soutiens2024: entry.soutiens2024 ?? 0,
        populaire: Boolean(entry.populaire),
      },
    ];
  });

  const mecenes = (global?.mecenes ?? []).flatMap((entry) => {
    const tier = DONATION_TIERS.find((t) => t.id === entry.tierId);
    const desc = entry.desc?.trim();
    if (!tier || !desc) return [];
    return [{ tier, desc, soutiens2024: entry.soutiens2024 ?? 0 }];
  });

  const faq = (global?.faq ?? []).flatMap((entry) => {
    const q = entry.question?.trim();
    const a = entry.reponse?.trim();
    return q && a ? [{ q, a }] : [];
  });

  return {
    herosTitre: texteOuDefaut(global?.heros?.titre, SOUSCRIPTION_DEFAUT.herosTitre),
    herosIntro: texteOuDefaut(global?.heros?.intro, SOUSCRIPTION_DEFAUT.herosIntro),
    chantiers: chantiers.length > 0 ? chantiers : SOUSCRIPTION_DEFAUT.chantiers,
    contreparties:
      contreparties.length > 0 ? contreparties : SOUSCRIPTION_DEFAUT.contreparties,
    mecenes: mecenes.length > 0 ? mecenes : SOUSCRIPTION_DEFAUT.mecenes,
    faq: faq.length > 0 ? faq : SOUSCRIPTION_DEFAUT.faq,
  };
}

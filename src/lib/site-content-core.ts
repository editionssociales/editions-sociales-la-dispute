import { lexicalToHtml } from "./catalogue-pg-map";
import { cmsExcerpt, sanitizeCms, type SafeHtml } from "./cms-html";
import { DONATION_TIERS, type DonationTier } from "./donation-tiers";
import { EDITION_LIST } from "./editions";
import type { Accent } from "./format";
import type { EditionSlug } from "./types";
import type {
  PageAPropos,
  PageContact,
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
/* Pages des maisons (ex-lot 3 « Page À propos »)                       */
/* ------------------------------------------------------------------ */

/**
 * Une maison de la section « Deux maisons » : textes surchargés champ par
 * champ depuis le global, tout le reste (slug, lien « Découvrir »,
 * couleur d'accent) vient d'`EDITION_LIST` — jamais éditable. `bureau` :
 * liste des membres du bureau éditorial DE CETTE MAISON, dans l'ordre —
 * jamais vide (retombe sur `BUREAU_DEFAUT[slug]`, jamais un tableau vide).
 */
export interface MaisonAPropos {
  slug: EditionSlug;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  accent: Accent;
  bureau: string[];
}

/**
 * Bloc « Dépôt de manuscrit » — identique sur les deux pages maisons (le
 * JSX de `editions/[slug]/page.tsx` ne l'indexe par aucun slug). `html` non
 * nul REMPLACE tout le texte par défaut, `email` y compris ; `html` nul =
 * les deux paragraphes par défaut, avec `email` inséré dans la phrase
 * d'accroche (mailto inline).
 */
export interface DepotManuscritContent {
  email: string;
  html: SafeHtml | null;
}

export interface PageAProposContent {
  /** Noms de l'équipe permanente — identique sur les deux pages maisons. */
  equipePermanente: string;
  maisons: MaisonAPropos[];
  depotManuscrit: DepotManuscritContent;
}

/**
 * Textes actuels d'`editions/[slug]/page.tsx`, extraits verbatim (iso-rendu).
 * ⚠️ Attribution des bureaux éditoriaux : les 2 variantes du PDF maquette
 * répètent la même phrase d'intro avec des listes différentes — source non
 * fiable pour trancher qui est qui. La répartition ci-dessous (antérieure à
 * la maquette) est conservée telle quelle ; à confirmer avec le client avant
 * tout changement (même réserve que l'ex-constante `BUREAUX` du JSX).
 */
const EQUIPE_PERMANENTE_DEFAUT =
  "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes";

const BUREAU_DEFAUT: Record<EditionSlug, string[]> = {
  "la-dispute": [
    "Noémie Brun",
    "Alexis Cukier",
    "Jérôme Deauvieau",
    "Pauline Delage",
    "Étienne Douat",
    "Amélie Jeammet",
    "Danièle Kergoat",
    "Aurore Koechlin",
    "Richard Lagache",
    "Clara Laspalas",
    "Jacqueline Martinez",
    "Marina Simonin",
    "Hélène Stevens",
  ],
  "editions-sociales": [
    "Alexia Blin",
    "Yohann Douet",
    "Isabelle Garo",
    "Marion Leclair",
    "Alix Bouffard",
    "Alexandre Feron",
    "Vincent Heimendinger",
    "Antony Burlaud",
    "Guillaume Fondu",
    "Richard Lagache",
    "Jean Quétier",
    "Alexis Cukier",
    "Quentin Fondu",
  ],
};

const MANUSCRITS_EMAIL_DEFAUT = "manuscritsldes@gmail.com";

/** Fusion du global `page-a-propos` — champ par champ, vide = défaut dur. */
export function mergePageAPropos(
  global: PageAPropos | null | undefined,
): PageAProposContent {
  const maisons = EDITION_LIST.map((edition) => {
    // Ancrage par slug (select « Maison » côté admin), pas par ordre des
    // entrées : réordonner le tableau dans /admin ne peut pas intervertir
    // les textes des deux maisons.
    const surcharge = global?.maisons?.find((m) => m.maison === edition.slug);
    const bureauSaisi = (surcharge?.bureau ?? []).flatMap((ligne) => {
      const nom = ligne.nom?.trim();
      return nom ? [nom] : [];
    });
    return {
      slug: edition.slug,
      shortName: edition.shortName,
      accent: edition.accent,
      name: texteOuDefaut(surcharge?.nom, edition.name),
      tagline: texteOuDefaut(surcharge?.tagline, edition.tagline),
      description: texteOuDefaut(surcharge?.description, edition.description),
      bureau: bureauSaisi.length > 0 ? bureauSaisi : BUREAU_DEFAUT[edition.slug],
    };
  });

  return {
    equipePermanente: texteOuDefaut(global?.equipe?.permanente, EQUIPE_PERMANENTE_DEFAUT),
    maisons,
    depotManuscrit: {
      email: texteOuDefaut(global?.depotManuscrit?.email, MANUSCRITS_EMAIL_DEFAUT),
      html: richTextToSafeHtml(global?.depotManuscrit?.texte),
    },
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
 * Une section du récit (refonte sobre, maquette client 2026-08-21) :
 * `titreItalique` est la 2ᵉ ligne optionnelle du bandeau (`null` = une seule
 * ligne) ; `corps` est `null` quand le champ CMS est vide — la page rend
 * alors SES PROPRES paragraphes JSX verbatim (même contrat que
 * `PagesLegales`/`LegalCmsBody`, pas celui de `PageAPropos.sections` où
 * `null` signifierait « rien à afficher » : ici il y a TOUJOURS un corps par
 * défaut, chaque section a une identité fixe).
 *
 * Soulignement Lexical → surlignage couleur : ÉTUDIÉ et ABANDONNÉ.
 * `convertLexicalToHTML` (`catalogue-pg-map.ts:lexicalToHtml`) rend le
 * soulignement en `<span style="text-decoration: underline;">…</span>`, or
 * `sanitizeCms` n'admet AUCUN attribut sur `<span>` (`ALLOWED_ATTRIBUTES`,
 * `cms-html.ts`) : le style est repris NU (constat empirique, `sanitize-html`
 * direct) — le signal « souligné » est perdu avant même d'atteindre le
 * rendu, aucun marqueur ne survit sur lequel accrocher une classe de
 * surlignage. Le remapper proprement demanderait de modifier `sanitizeCms`
 * (fabricant PARTAGÉ de `SafeHtml`, utilisé par les fiches livre et les
 * pages légales) pour une sortie de bibliothèque tierce non contractuelle —
 * hors budget et hors périmètre de cette page. Seul le gras (`<strong>`,
 * préservé tel quel) reste disponible côté CMS ; documenté pour l'équipe
 * dans `docs/BACK-OFFICE.md`.
 */
export interface RecitSectionContent {
  titre: string;
  titreItalique: string | null;
  corps: SafeHtml | null;
}

/** Les trois descriptions des paliers de jauge — montants/intitulés dérivés de `CAMPAIGN_2026_PALIERS`, jamais du CMS. */
export interface ObjectifsSouscriptionContent {
  descriptif50: string;
  descriptif80: string;
  descriptif100: string;
}

/**
 * Contenu éditable de `/souscription` (refonte sobre, 2026-08-21) : titre de
 * l'ask, quatre sections du récit (`danger`/`guerre`/`maisons`/`appel` —
 * couleurs et ordre figés par le design, PAS un tableau), descriptions des
 * paliers de jauge, et les neuf cartes de contreparties (inchangées).
 */
export interface PageSouscriptionContent {
  titre: {
    titre: string;
    sousTitre: string;
    demande: string;
  };
  recit: {
    danger: RecitSectionContent;
    guerre: RecitSectionContent;
    maisons: RecitSectionContent;
    appel: RecitSectionContent;
  };
  objectifs: ObjectifsSouscriptionContent;
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
 * Les tests verrouillent ces valeurs (iso-rendu). Type réduit au SEUL champ
 * qu'elle couvre (`Pick`) : le récit (titre/sections/objectifs) a son propre
 * bloc de défauts ci-dessous, concerns distincts.
 *
 * EXCEPTION à l'ordre du PDF : le palier 50 € ouvre la liste (demande client
 * 2026-08-27) — juste après la carte « Montant libre », codée en dur en tête
 * de rail dans `tiers-rail.tsx`, et AVANT la proposition à 15 €. Cet ordre
 * est purement ÉDITORIAL : `DONATION_TIERS`/`CONTREPARTIES_2026` (paiement,
 * résolution de commande) gardent leur ordre croissant verrouillé par leurs
 * propres tests.
 */
const SOUSCRIPTION_DEFAUT: Pick<PageSouscriptionContent, "contreparties"> = {
  contreparties: [
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
      tier: tierObligatoire("palier-15"),
      items: ["Une planche de stickers"],
    },
    {
      tier: tierObligatoire("palier-35"),
      items: ["Manifeste du parti communiste", "Une planche de stickers"],
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
 * Titre de l'ask — texte actuel de `souscription/page.tsx` (refonte sobre,
 * maquette client 2026-08-21), extrait verbatim.
 */
const TITRE_DEFAUT = {
  titre: "100 ans",
  sousTitre: "d’édition marxiste :",
  demande: "aidez-nous à poursuivre l’histoire.",
};

/**
 * Titre (+ 2ᵉ ligne italique optionnelle) des quatre sections du récit —
 * texte actuel, verbatim. Le CORPS par défaut (paragraphes, gras, surlignage)
 * reste en JSX dans `souscription/page.tsx` (pas de JSX dans ce module `.ts`
 * pur) : `corps: null` y déclenche le rendu de CE JSX, exactement comme
 * `PagesLegales`/`LegalCmsBody` retombe sur ses `<LegalSection>` en dur.
 */
const RECIT_DEFAUT: Record<
  keyof PageSouscriptionContent["recit"],
  { titre: string; titreItalique: string | null }
> = {
  danger: {
    titre: "Édition indépendante et critique :",
    titreItalique: "Danger maximal",
  },
  guerre: {
    titre: "La guerre culturelle est aussi",
    titreItalique: "une guerre matérielle",
  },
  maisons: {
    titre: "Les éditions sociales et La Dispute",
    titreItalique: null,
  },
  appel: {
    titre: "Nous avons besoin de vous",
    titreItalique: null,
  },
};

/** Descriptions des trois paliers de jauge — texte de campagne client (livraison 2026-08-29), verbatim. */
const OBJECTIFS_DEFAUT: ObjectifsSouscriptionContent = {
  descriptif50:
    "Nous pouvons faire face à l’urgence, poursuivre notre activité éditoriale sans mettre en danger notre équipe.",
  descriptif80:
    "Nous arrivons à absorber l’essentiel des dettes de notre ancien distributeur. Nous pouvons ainsi mener à bien certains projets déjà engagés et confirmer l’embauche de Nicolas Vieillescazes.",
  // Le point final manque aussi dans cette livraison du texte client —
  // conservé verbatim, comme la version précédente.
  descriptif100:
    "Nous poursuivons notre lancée éditoriale et nous pouvons lancer une nouvelle collection dont on espère pouvoir vous parler bientôt",
};

/** Chaîne saisie si non vide (espaces exclus), sinon `null` (pas de 2ᵉ ligne / pas de section). */
function texteOuDefautNullable(
  saisi: string | null | undefined,
  defaut: string | null,
): string | null {
  const propre = saisi?.trim();
  return propre ? propre : defaut;
}

/** Fusion d'une section du récit — champ par champ, vide = défaut dur (titre/2ᵉ ligne) ou `null` (corps, cf. `RecitSectionContent`). */
function mergeRecitSection(
  groupe:
    | { titre?: string | null; titreItalique?: string | null; corps?: unknown }
    | null
    | undefined,
  defaut: { titre: string; titreItalique: string | null },
): RecitSectionContent {
  return {
    titre: texteOuDefaut(groupe?.titre, defaut.titre),
    titreItalique: texteOuDefautNullable(groupe?.titreItalique, defaut.titreItalique),
    corps: richTextToSafeHtml(groupe?.corps),
  };
}

/**
 * Fusion du global `page-souscription` (refonte sobre, 2026-08-21) — champ
 * par champ pour le titre/récit/objectifs (vide = défaut dur ci-dessus) ;
 * `contreparties` garde sa règle propre : un array vide (ou dont toutes les
 * entrées sont invalides) retombe sur les 9 cartes par défaut, un array
 * rempli les remplace entièrement (inchangé).
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
    titre: {
      titre: texteOuDefaut(global?.titre, TITRE_DEFAUT.titre),
      sousTitre: texteOuDefaut(global?.sousTitre, TITRE_DEFAUT.sousTitre),
      demande: texteOuDefaut(global?.demande, TITRE_DEFAUT.demande),
    },
    recit: {
      danger: mergeRecitSection(global?.danger, RECIT_DEFAUT.danger),
      guerre: mergeRecitSection(global?.guerre, RECIT_DEFAUT.guerre),
      maisons: mergeRecitSection(global?.maisons, RECIT_DEFAUT.maisons),
      appel: mergeRecitSection(global?.appel, RECIT_DEFAUT.appel),
    },
    objectifs: {
      descriptif50: texteOuDefaut(global?.objectifs?.descriptif50, OBJECTIFS_DEFAUT.descriptif50),
      descriptif80: texteOuDefaut(global?.objectifs?.descriptif80, OBJECTIFS_DEFAUT.descriptif80),
      descriptif100: texteOuDefaut(
        global?.objectifs?.descriptif100,
        OBJECTIFS_DEFAUT.descriptif100,
      ),
    },
    contreparties:
      contreparties.length > 0 ? contreparties : SOUSCRIPTION_DEFAUT.contreparties,
  };
}

/* ------------------------------------------------------------------ */
/* Page Contact                                                        */
/* ------------------------------------------------------------------ */

export interface PageContactContent {
  titre: string;
  intro: string;
}

/** Textes actuels de `contact/page.tsx` (`PageHero`), extraits verbatim. */
const CONTACT_DEFAUT: PageContactContent = {
  titre: "Contact",
  intro:
    "Une question sur un livre, une commande, une proposition éditoriale ? Écrivez-nous, nous vous répondrons dès que possible.",
};

/** Fusion du global `page-contact` — champ par champ, vide = défaut dur. */
export function mergePageContact(
  global: PageContact | null | undefined,
): PageContactContent {
  return {
    titre: texteOuDefaut(global?.titre, CONTACT_DEFAUT.titre),
    intro: texteOuDefaut(global?.intro, CONTACT_DEFAUT.intro),
  };
}

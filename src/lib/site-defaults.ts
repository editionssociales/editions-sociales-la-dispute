/**
 * Textes PAR DÉFAUT des contenus éditables du back-office — énoncés ICI une
 * seule fois, lus par DEUX consommateurs : la fusion du front
 * (`site-content-core.ts` : champ vide = ce texte) ET les champs d'édition
 * eux-mêmes (`src/payload/globals/*` : ce texte s'y affiche en transparence,
 * `admin.placeholder`, tant que le champ est vide — retour client 2026-11,
 * « savoir ce qu'on édite »). Sans cette source commune, le texte affiché
 * dans l'admin dériverait du texte réellement servi.
 *
 * Module PUR et sans dépendance lourde (importable par la config Payload,
 * imports `.ts` explicites sous le CLI) : aucune I/O, aucun `server-only`.
 * Les corps riches (CGV, mentions, confidentialité, récits de /souscription,
 * texte du dépôt de manuscrit) restent du JSX dans les pages — pas de texte
 * brut à afficher ici ; leurs champs portent un placeholder explicatif.
 */
import { DELIVERY_DELAY_RANGE } from "./delivery-copy.ts";
import { CAMPAIGN_2026_PALIERS } from "./donation-tiers.ts";

/* Pied de page + SEO */
export const FOOTER_ADRESSE_DEFAUT =
  "La maison de la pensée critique, des sciences sociales et du mouvement ouvrier. Paris, France.";
export const SEO_TITRE_DEFAUT = "Les Éditions sociales × La Dispute";
export const SEO_DESCRIPTION_DEFAUT =
  "Les Éditions sociales × La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.";

/* CGV : section « Livraison » (paragraphe) — le délai y est inséré. */
export function livraisonInfosDefaut(delai: string = DELIVERY_DELAY_RANGE): string {
  return (
    "Les commandes sont expédiées en France métropolitaine, en Belgique et en Suisse ; les frais de port sont calculés " +
    `selon le montant du panier et affichés avant paiement. La livraison intervient en règle générale ${delai} ` +
    "à compter de la confirmation de paiement ; les précommandes sont expédiées à parution de l’ouvrage."
  );
}
export { DELIVERY_DELAY_RANGE };

/* Page Contact */
export const CONTACT_TITRE_DEFAUT = "Contact";
export const CONTACT_INTRO_DEFAUT =
  "Une question sur un livre, une commande, une proposition éditoriale ? Écrivez-nous, nous vous répondrons dès que possible.";

/* Page Nos maisons */
export const NOS_MAISONS_TITRE_DEFAUT = "Nos maisons";

/* Mail « commande par lot » */
export const MAIL_LOT_OBJET_EXEMPLE = "Confirmation de votre commande CMD-000123";
export const MAIL_LOT_MESSAGE_DEFAUT =
  "Merci pour votre commande et pour votre soutien ! Vos exemplaires seront expédiés dans les meilleurs délais. " +
  "Vous trouverez ci-dessous le récapitulatif de votre commande.";
export const MAIL_LOT_RECOMMANDATIONS_TITRE_DEFAUT = "Nos recommandations de lecture";

/* Pages maisons (À propos) */
export const EQUIPE_PERMANENTE_DEFAUT =
  "Noémie Brun, Clara Laspalas, Marina Simonin et Nicolas Vieillescazes";
export const MANUSCRITS_EMAIL_DEFAUT = "manuscritsldes@gmail.com";

/* Page Souscription */
export const SOUSCRIPTION_TITRE_DEFAUT = {
  titre: "100 ans",
  sousTitre: "d’édition marxiste :",
  demande: "aidez-nous à poursuivre l’histoire.",
};

/** Titre (+ 2ᵉ ligne italique) des quatre sections du récit — le CORPS par défaut reste en JSX dans la page. */
export const RECIT_TITRES_DEFAUT = {
  danger: { titre: "Édition indépendante et critique :", titreItalique: "Danger maximal" },
  guerre: { titre: "La guerre culturelle est aussi", titreItalique: "une guerre matérielle" },
  maisons: { titre: "Les éditions sociales et La Dispute", titreItalique: null },
  appel: { titre: "Nous avons besoin de vous", titreItalique: null },
} as const;

export const OBJECTIFS_DEFAUT = {
  descriptif50:
    "Nous pouvons faire face à l’urgence, poursuivre notre activité éditoriale sans mettre en danger notre équipe.",
  descriptif80:
    "Nous arrivons à absorber l’essentiel des dettes de notre ancien distributeur. Nous pouvons ainsi mener à bien certains projets déjà engagés et confirmer l’embauche de Nicolas Vieillescazes.",
  // Le point final manque aussi dans cette livraison du texte client —
  // conservé verbatim, comme la version précédente.
  descriptif100:
    "Nous poursuivons notre lancée éditoriale et nous pouvons lancer une nouvelle collection dont on espère pouvoir vous parler bientôt",
  titre50: CAMPAIGN_2026_PALIERS[0].label,
  titre80: CAMPAIGN_2026_PALIERS[1].label,
  titre100: CAMPAIGN_2026_PALIERS[2].label,
};

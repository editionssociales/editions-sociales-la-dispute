/**
 * Formatage pur des deux profils d'export CSV commandes (plan/04-commerce.md
 * §étape 10). Colonnes du profil « préparation » ARBITRÉES par le client le
 * 2026-08-24 (fil Clara, verbatim repris dans `PREPARATION_HEADER`) ; celles
 * du profil « compta » restent celles validées le 2026-07-13. Zéro I/O, zéro Payload : les shapes
 * ci-dessous sont des interfaces locales décorrélées de `payload-types.ts`
 * (même découplage que `order-mail.ts`) — l'orchestration (`src/payload/lib/
 * order-export-handler.ts`) fait le mapping depuis les docs Payload.
 *
 * Séparateur `;` et décimale `,` : convention CSV française — Excel/
 * LibreOffice en locale fr_FR ouvrent ce fichier directement (double-clic,
 * sans assistant d'import) sans ambiguïté avec le séparateur décimal.
 *
 * Scission précommande (client 2026-08-20, `Orders.ts`) : un panier mixte
 * produit DEUX `Orders` pour un même paiement Stripe (une par `orderType`,
 * même `stripeSessionId`) — `orderType` distingue les deux dans les deux
 * profils, `stripeSessionId` (compta seule) permet de rapprocher la paire.
 *
 * Dons avec contrepartie (client 2026-08-21) : troisième `orderType` `don`,
 * étanche des deux autres au niveau comptable — `formatComptaCsv` laisse sa
 * colonne de TVA vide pour ces lignes (un don n'est pas une vente) ;
 * `formatPreparationCsv` ne change pas, un don y apparaît normalement.
 *
 * Refonte des colonnes « préparation » (client 2026-08-24) : la feuille de
 * l'équipe porte désormais date, adresse éclatée, nom/prénom séparés et
 * téléphone. Deux points durs, tous deux nommés là où ils se jouent —
 * `splitFullName` (Stripe ne collecte qu'un nom complet, la séparation est
 * une heuristique et la colonne « Nom complet (tel que saisi) » reste la
 * vérité) et le téléphone (collecté depuis cette même date seulement, donc
 * vide sur tout l'historique et sur les dons).
 */

import { isoDayParis } from "./format";

/** Même six statuts que `Orders.ts:status` — dupliqué ici en type large (string) pour ne pas coupler ce module pur aux types générés Payload. */
export type OrderExportStatus = "paid" | "prepared" | "shipped" | "cancelled" | "refunded" | "failed";

/** Libellés FR affichés au back-office (`Orders.ts`, options du champ `status`) — tenus manuellement en phase, comme `order-mail.ts` le fait pour son propre gabarit. */
const STATUS_LABELS: Record<OrderExportStatus, string> = {
  paid: "Payée",
  prepared: "Préparée",
  shipped: "Expédiée",
  cancelled: "Annulée",
  refunded: "Remboursée",
  failed: "Échec du paiement",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderExportStatus] ?? status;
}

/** Mêmes trois valeurs que `Orders.ts:orderType` — dupliqué ici en type large (string) pour ne pas coupler ce module pur aux types générés Payload. */
export type OrderExportOrderType = "commande" | "precommande" | "don";

/** Libellés FR affichés au back-office (`Orders.ts`, options du champ `orderType`) — tenus manuellement en phase, comme `STATUS_LABELS`. */
const ORDER_TYPE_LABELS: Record<OrderExportOrderType, string> = {
  commande: "Commande",
  precommande: "Précommande",
  don: "Don",
};

function orderTypeLabel(orderType: string): string {
  return ORDER_TYPE_LABELS[orderType as OrderExportOrderType] ?? orderType;
}

/**
 * Statuts couverts par l'export « préparation » — décalque de `processing/
 * on-hold` côté Woo (commandes encaissées, pas encore expédiées : à préparer
 * ou en cours de préparation). `shipped/cancelled/refunded/failed` n'ont plus
 * rien à préparer. Exporté pour que l'orchestration filtre sa requête Payload
 * sur exactement cet ensemble (une seule source de vérité).
 */
export const PREPARATION_ORDER_STATUSES: readonly OrderExportStatus[] = ["paid", "prepared"];

export interface OrderExportAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string | null;
  postalCode: string;
  city: string;
  country: string;
}

export interface OrderExportLine {
  /** Identifiant du livre/produit — analogue du `_product_id` Woo (colonne « Article # »). */
  bookId: number;
  isbn: string | null;
  title: string;
  quantity: number;
  /** Euros TTC. */
  unitPriceTTC: number;
}

export interface OrderExportRow {
  number: string;
  /** `commande` | `precommande` | `don` (`Orders.ts:orderType`) — un panier mixte scinde un même paiement Stripe en deux `Orders`, une par type (client 2026-08-20). */
  orderType: string;
  /** ISO 8601 — date de création (= date de paiement, la commande n'existe qu'une fois payée). */
  createdAt: string;
  status: string;
  email: string;
  /** Collecté par Stripe au paiement depuis le 2026-08-24 (`Orders.phone`) — vide sur tout l'historique et sur les dons. */
  phone: string | null;
  lines: OrderExportLine[];
  shippingAddress: OrderExportAddress;
  billingAddress: OrderExportAddress;
  /** Euros TTC. */
  totalTTC: number;
  /** Euros TTC. */
  shippingCostTTC: number;
  /** Euros TTC. */
  discountTTC: number;
  couponCode: string | null;
  /** Rapproche les deux commandes d'un même paiement scindé (panier mixte, client 2026-08-20) — module pur, donc nullable indépendamment de ce que garantit le schéma Payload actuel (`required: true`, `Orders.ts`). */
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
}

const VAT_RATE = 0.055;

/** Arrondi au centime — même garde-fou flottant que `shipping-core.ts`/`order-webhook-core.ts` (jamais de somme d'argent non arrondie). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Part de TVA à 5,5 % incluse dans un montant TTC — prix TTC non recalculé au
 * checkout (pratique Woo actuelle, recon R2 §2.8), la ventilation ne vit
 * QUE dans cet export. `HT = TTC / 1,055` ; la part TVA est la différence,
 * arrondie au centime (jamais le HT arrondi puis soustrait — l'arrondi se
 * fait une seule fois, sur le résultat final).
 */
export function computeVatPart(totalTTC: number): number {
  const ht = totalTTC / (1 + VAT_RATE);
  return roundCents(totalTTC - ht);
}

/** Nombre → texte décimale française à 2 décimales (`12,50`), sans symbole monétaire ni séparateur de milliers — cellule numérique propre pour un tableur compta. */
function formatAmount(value: number): string {
  return roundCents(value).toFixed(2).replace(".", ",");
}

const DELIMITER = ";";
const LINE_BREAK = "\r\n";

/** Échappe une cellule CSV (RFC 4180) — guillemets doublés, cellule entourée de guillemets si elle contient le séparateur, un guillemet ou un saut de ligne. */
function escapeCsvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(DELIMITER));
  return lines.join(LINE_BREAK) + LINE_BREAK;
}

/**
 * Particules d'un nom de famille — reprises avec le nom qu'elles précèdent
 * (« de Beauvoir », « van Gogh »). Liste courte et volontairement close :
 * elle sert à ne pas couper un nom en deux, pas à couvrir l'onomastique
 * mondiale.
 */
const PARTICULES = new Set([
  "de", "du", "des", "le", "la", "les", "da", "das", "dos", "del", "della", "di",
  "van", "von", "der", "den", "ter", "ten", "el", "al", "ben", "bin", "mac", "mc", "o",
]);

export interface SplitName {
  prenom: string;
  nom: string;
}

/**
 * Sépare un nom complet en prénom / nom (client 2026-08-24 : « nom ; prénom »
 * en colonnes distinctes de l'export).
 *
 * C'est une HEURISTIQUE, et elle est assumée comme telle : Stripe Checkout ne
 * collecte qu'UN champ « nom complet » — la donnée séparée n'existe nulle
 * part, il n'y a donc rien à « lire » correctement. Deux règles, dans cet
 * ordre :
 *
 * 1. Premier mot en CAPITALES alors qu'un autre ne l'est pas (« DUPONT
 *    Marie ») → c'est le nom de famille : usage administratif français
 *    courant, et le seul cas où l'ordre saisi est explicite.
 * 2. Sinon, ordre « Prénom Nom » : le dernier mot est le nom, précédé de ses
 *    particules éventuelles (« Marie de La Fontaine » → nom « de La
 *    Fontaine »).
 *
 * Un seul mot → tout en nom (jamais un prénom inventé). La colonne « Nom
 * complet (tel que saisi) » de l'export reste la donnée de vérité : en cas de
 * doute sur une étiquette, c'est elle qui fait foi.
 */
export function splitFullName(fullName: string): SplitName {
  const mots = fullName.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { prenom: "", nom: "" };
  if (mots.length === 1) return { prenom: "", nom: mots[0] };

  const enCapitales = (mot: string) => mot === mot.toLocaleUpperCase("fr") && /\p{L}/u.test(mot);
  if (enCapitales(mots[0]) && mots.slice(1).some((mot) => !enCapitales(mot))) {
    return { prenom: mots.slice(1).join(" "), nom: mots[0] };
  }

  let debutNom = mots.length - 1;
  while (debutNom > 1 && PARTICULES.has(mots[debutNom - 1].toLocaleLowerCase("fr").replace(/[.'’]/g, ""))) {
    debutNom--;
  }
  return { prenom: mots.slice(0, debutNom).join(" "), nom: mots.slice(debutNom).join(" ") };
}

/**
 * Colonnes de l'export « préparation », dans l'ordre demandé par le client le
 * 2026-08-24 (verbatim : « date de commandes ; titre ; quantité ; nom ;
 * prénom ; adresse complète de livraison (adresse, cp et ville dans des
 * colonnes différentes) ; adresse mail ; numéro de téléphone »).
 *
 * Les colonnes 1 à 12 SONT cette demande — complément d'adresse et pays
 * inclus dans « l'adresse complète », sans quoi un envoi en Belgique ou un
 * « bâtiment C » se perdrait. Les suivantes sont l'ancien profil, conservé
 * derrière : rien de ce que l'équipe avait n'est retiré (n° de commande,
 * type, ISBN, référence produit, prix, coupon, remise), et le nom complet
 * brut ferme la marche comme filet de la séparation nom/prénom.
 */
const PREPARATION_HEADER = [
  "Date de commande",
  "Titre",
  "Quantité",
  "Nom",
  "Prénom",
  "Adresse",
  "Complément d'adresse",
  "Code postal",
  "Ville",
  "Pays",
  "E-mail",
  "Téléphone",
  "N° de commande",
  "Type",
  "UGS(ISBN)",
  "Article #",
  "Prix du produit",
  "Code de coupon",
  "Réduction",
  "Nom complet (tel que saisi)",
] as const;

/**
 * Jour de la commande à l'heure de PARIS, au format français `JJ/MM/AAAA` —
 * c'est une feuille de travail humaine, ouverte dans un tableur français.
 * `isoDayParis` (et non un `slice` de l'ISO UTC) : une commande passée à 1 h
 * du matin à Paris est datée de la VEILLE en UTC — l'équipe préparation
 * chercherait sa commande le mauvais jour. Le profil compta, lui, garde sa
 * date ISO UTC brute : c'est un export machine, aligné sur ce que la compta
 * a déjà reçu depuis un an, et le changer en cours d'exercice serait une
 * décision comptable, pas une amélioration de lisibilité.
 */
function formatDateFr(createdAt: string): string {
  const jour = isoDayParis(createdAt);
  if (!jour) return "";
  const [annee, mois, jourDuMois] = jour.split("-");
  return `${jourDuMois}/${mois}/${annee}`;
}

/**
 * Profil « préparation » — la feuille de l'équipe pour préparer et expédier.
 * Colonnes refondues le 2026-08-24 à la demande du client (cf.
 * `PREPARATION_HEADER`) : elles portent désormais l'adresse de livraison
 * éclatée, le téléphone et la date, là où le profil d'origine (décalque
 * Advanced Order Export de WooCommerce) n'avait ni adresse ni date.
 *
 * Une ligne par ligne de commande, comme avant : les faits de la commande
 * (client, adresse, coupon, remise, type) sont répétés sur chacune de ses
 * lignes — même aplatissement qu'AOE, c'est ce qui rend la feuille triable
 * par titre pour la préparation. L'appelant filtre en amont sur
 * `PREPARATION_ORDER_STATUSES` : ce module ne re-filtre pas.
 */
export function formatPreparationCsv(orders: readonly OrderExportRow[]): string {
  const rows = orders.flatMap((order) => {
    const { prenom, nom } = splitFullName(order.shippingAddress.fullName);
    return order.lines.map((line) => [
      formatDateFr(order.createdAt),
      line.title,
      String(line.quantity),
      nom,
      prenom,
      order.shippingAddress.addressLine1,
      order.shippingAddress.addressLine2 ?? "",
      order.shippingAddress.postalCode,
      order.shippingAddress.city,
      order.shippingAddress.country,
      order.email,
      order.phone ?? "",
      order.number,
      orderTypeLabel(order.orderType),
      line.isbn ?? "",
      String(line.bookId),
      formatAmount(line.unitPriceTTC),
      order.couponCode ?? "",
      formatAmount(order.discountTTC),
      order.shippingAddress.fullName,
    ]);
  });
  return toCsv(PREPARATION_HEADER, rows);
}

const COMPTA_HEADER = [
  "N° commande",
  "Type",
  "Date",
  "Statut",
  "Email",
  "Nom (livraison)",
  "Adresse (livraison)",
  "Complément (livraison)",
  "Code postal (livraison)",
  "Ville (livraison)",
  "Pays (livraison)",
  "Nom (facturation)",
  "Adresse (facturation)",
  "Complément (facturation)",
  "Code postal (facturation)",
  "Ville (facturation)",
  "Pays (facturation)",
  "Total TTC",
  "Port TTC",
  "Remise TTC",
  "Part TVA 5,5 % (calculée)",
  "Moyen de paiement",
  "Session Stripe",
  "Référence Stripe (PaymentIntent)",
] as const;

function addressCells(address: OrderExportAddress): string[] {
  return [address.fullName, address.addressLine1, address.addressLine2 ?? "", address.postalCode, address.city, address.country];
}

/**
 * Profil « compta » — une ligne par commande (pas par ligne d'article),
 * bornes de dates appliquées en amont par l'appelant (`from`/`to`). Le moyen
 * de paiement est toujours « Stripe » : le checkout unifié (lot 2, étape 8)
 * n'a pas d'autre passerelle — pas un champ stocké, une constante du module.
 * `Session Stripe` (colonne compta seule, absente en préparation) : un panier
 * mixte scinde UN paiement en DEUX commandes de même `stripeSessionId`
 * (client 2026-08-20) — permet à la compta de rapprocher la paire.
 *
 * Étanchéité comptable dons (client 2026-08-21, exigence dure) : un don n'est
 * pas une vente — la colonne « Part TVA 5,5 % (calculée) » reste VIDE pour
 * `orderType: "don"` (rien à ventiler, aucune TVA sur un don), le total TTC
 * restant affiché tel quel. Cette colonne est la SEULE différence de
 * traitement ici ; l'export préparation, lui, ne change pas — un don y
 * apparaît normalement (il s'expédie comme une commande).
 */
export function formatComptaCsv(orders: readonly OrderExportRow[]): string {
  const rows = orders.map((order) => [
    order.number,
    orderTypeLabel(order.orderType),
    order.createdAt.slice(0, 10),
    statusLabel(order.status),
    order.email,
    ...addressCells(order.shippingAddress),
    ...addressCells(order.billingAddress),
    formatAmount(order.totalTTC),
    formatAmount(order.shippingCostTTC),
    formatAmount(order.discountTTC),
    order.orderType === "don" ? "" : formatAmount(computeVatPart(order.totalTTC)),
    "Stripe",
    order.stripeSessionId ?? "",
    order.stripePaymentIntentId ?? "",
  ]);
  return toCsv(COMPTA_HEADER, rows);
}

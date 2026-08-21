import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import type { Order } from "@/payload-types";
import { decodeCheckoutLines, type CheckoutBookLookup, type DecodedCheckoutLine } from "@/lib/checkout-core";
import { getCommerceBookRecords } from "@/lib/commerce-source";
import { getContrepartieBooksByIds, type ContrepartieBook } from "@/lib/contreparties";
import { selectDonationMailer, type DonationMailRecap } from "@/lib/donation-mail";
import { DONATION_TIERS } from "@/lib/donation-tiers";
import {
  createOrder,
  decrementBookStock,
  findOrderBySessionId,
  findOrdersByPaymentIntent,
  updateOrder,
} from "@/lib/order-source";
import {
  buildOrderCreateData,
  computePartTotalCents,
  type OrderAddressFacts,
  type OrderCountry,
  type OrderKind,
  type OrderLineFacts,
  type OrderSessionFacts,
  type OrderShippingMethod,
} from "@/lib/order-webhook-core";
import { selectOrderMailer } from "@/lib/order-mail";

/**
 * Orchestration I/O du webhook côté `kind: "order"` (plan §4 étape 9, scission
 * précommande client 2026-08-20) — cœur pur de l'assemblage dans
 * `order-webhook-core.ts`, décodage des lignes dans `checkout-core.ts` (déjà
 * testés séparément) ; ce module ne fait que la composition Payload/Stripe,
 * même découpage que `stock-import.ts` vis-à-vis de `stock-import-core.ts`.
 *
 * `handleOrderWebhookEvent` (le point d'entrée `kind: "order"`) étend le
 * webhook de la phase 1 SANS changer son comportement `kind: "donation"`
 * (`route.ts` ne route à `handleOrderWebhookEvent` que si `metadata.kind ===
 * "order"`). Depuis 2026-08-21 (contreparties), ce module héberge AUSSI
 * `handleDonationSessionCompleted` — un point d'entrée SÉPARÉ, appelé par
 * `route.ts` côté `kind: "donation"` quand `metadata.donLines` est posée
 * (don avec contrepartie) : même moteur d'assemblage (`order-webhook-core.ts`,
 * `orderType: "don"`) et mêmes seams I/O (`order-source.ts`), mais son propre
 * chemin d'idempotence (`stripeSessionId` + `"don"`) et son propre mailer
 * (`donation-mail.ts`, jamais `order-mail.ts`). `markOrderRefunded` est
 * exportée pour la même raison : `route.ts` la réutilise côté dons pour
 * `charge.refunded`, la fonction étant déjà agnostique du type de commande.
 *
 * SCISSION : le checkout (`/api/checkout`) pose DEUX groupes de metadata
 * (`lines` pour la commande normale, `preorderLines` pour la précommande) —
 * ce module ne fait QU'UNE lecture fidèle de ces deux groupes pour
 * reconstruire la scission, JAMAIS un nouveau tri par date de parution/flag
 * précommande (qui pourrait diverger de la décision prise au paiement si une
 * fiche change entre-temps — contrat explicite du client : « pas de
 * re-calcul divergent possible entre checkout et webhook »). Chaque partie
 * non vide devient une commande indépendante, avec sa PROPRE idempotence
 * (`stripeSessionId` + `orderType`, cf. `Orders.ts`/`order-source.ts`).
 */

const ORDER_COUNTRIES: readonly OrderCountry[] = ["FR", "BE", "CH"];

/** Restreint un code pays Stripe à l'ensemble vendu — `shipping_address_collection` ne devrait jamais renvoyer autre chose, repli défensif sur FR sinon. */
function toOrderCountry(country: string | null): OrderCountry {
  return (ORDER_COUNTRIES as readonly string[]).includes(country ?? "")
    ? (country as OrderCountry)
    : "FR";
}

/** Parse un montant en centimes posé en `metadata` Stripe — `0` si absent/non fini (metadata corrompue), jamais `NaN` stocké. */
function metadataCents(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Parse l'id de code promo posé en `metadata` — `null` si absent/non fini. */
function metadataPromoCodeId(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Adresse Stripe (`collected_information.shipping_details`) → faits `Orders` — `null` si absente (anomalie sur une session complétée). */
function addressFromStripe(
  shipping: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null | undefined,
): OrderAddressFacts | null {
  if (!shipping?.address) return null;
  return {
    fullName: shipping.name,
    addressLine1: shipping.address.line1 ?? "",
    addressLine2: shipping.address.line2 ?? undefined,
    postalCode: shipping.address.postal_code ?? "",
    city: shipping.address.city ?? "",
    country: toOrderCountry(shipping.address.country),
  };
}

function paymentIntentId(session: Stripe.Checkout.Session | Stripe.Charge): string | null {
  const pi = "payment_intent" in session ? session.payment_intent : null;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/** Une des deux parties de la scission — lignes brutes décodées + jointes au titre/ISBN relus fraîchement. */
interface ResolvedPart {
  decoded: DecodedCheckoutLine[];
  lines: OrderLineFacts[];
}

/**
 * Décode les DEUX groupes de metadata (`lines`/`preorderLines`) et les joint
 * au titre/ISBN/stock relus fraîchement (`commerce-source.ts`, le même seam
 * que le checkout — le stock y est nécessaire pour le décrément, pas
 * seulement pour le snapshot). Une seule lecture Payload pour les ids des
 * DEUX parties combinées. Un id introuvable (livre supprimé entre le
 * checkout et le webhook) est omis de `lines` — snapshot honnête plutôt qu'un
 * titre inventé ; `decoded` (non filtré) reste la source de vérité de
 * « cette partie avait-elle des lignes au checkout ? » (cf. `createPaidOrderPart`).
 */
async function resolveOrderParts(
  session: Stripe.Checkout.Session,
): Promise<{ books: Map<number, CheckoutBookLookup>; normal: ResolvedPart; preorder: ResolvedPart }> {
  const normalDecoded = decodeCheckoutLines(session.metadata?.lines);
  const preorderDecoded = decodeCheckoutLines(session.metadata?.preorderLines);
  const books = await getCommerceBookRecords([...normalDecoded, ...preorderDecoded].map((l) => l.id));

  function toLineFacts(decoded: DecodedCheckoutLine[]): OrderLineFacts[] {
    return decoded.flatMap((l) => {
      const book = books.get(l.id);
      if (!book) return [];
      return [
        {
          bookId: l.id,
          titleSnapshot: book.title,
          isbnSnapshot: book.isbn,
          quantity: l.qty,
          unitPriceCents: l.unitPriceCents,
        },
      ];
    });
  }

  return {
    books,
    normal: { decoded: normalDecoded, lines: toLineFacts(normalDecoded) },
    preorder: { decoded: preorderDecoded, lines: toLineFacts(preorderDecoded) },
  };
}

/** Assemble les faits `Orders` d'UNE partie — seul le statut final (`buildOrderCreateData`) et `totalCents` (fourni par l'appelant, cf. docstring `createPaidOrder`) diffèrent entre les deux issues (payée/échouée) ou entre les deux parties. */
function partSessionFacts(
  session: Stripe.Checkout.Session,
  orderType: OrderKind,
  lines: OrderLineFacts[],
  discountCents: number,
  shippingCostCents: number,
  totalCents: number,
  promoCodeId: number | null,
  createdAtEpoch: number,
): OrderSessionFacts {
  const metadata = session.metadata ?? {};
  return {
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    email: session.customer_details?.email ?? null,
    shippingAddress: addressFromStripe(session.collected_information?.shipping_details),
    lines,
    orderType,
    shippingMethod: (metadata.shippingMethod as OrderShippingMethod) ?? "standard",
    shippingCostCents,
    discountCents,
    promoCodeId,
    totalCents,
    paidAtISO: new Date(createdAtEpoch * 1000).toISOString(),
  };
}

/**
 * Décrémente le stock de chaque ligne — l'atomicité (plancher 0, jamais si
 * `stock` n'est pas suivi) est portée par `decrementBookStock` elle-même
 * (`order-source.ts`, issue #65, boucle comparer-puis-échanger) : ce module ne
 * fait plus que sauter les lignes dont le livre a disparu entre le checkout et
 * le webhook (`books` — snapshot `commerce-source` — ne les contient plus).
 */
async function decrementStock(
  decoded: DecodedCheckoutLine[],
  books: Map<number, CheckoutBookLookup>,
): Promise<void> {
  for (const line of decoded) {
    if (!books.has(line.id)) continue; // livre disparu — snapshot honnête, rien à décrémenter
    await decrementBookStock(line.id, line.qty);
  }
}

/**
 * Crée/complète UNE commande (une des deux parties de la scission) —
 * idempotence PAR EFFET (issue #64, étendue à la clé `(stripeSessionId,
 * orderType)`) : un rejeu Stripe après un échec partiel (process mort après
 * `createOrder`, avant le décrément ou l'e-mail) ne doit PAS ressortir
 * immédiatement — chaque effet non encore marqué s'exécute, quel que soit le
 * nombre de rejeux, jusqu'à ce que les trois étapes (création, décrément,
 * e-mail) soient posées.
 *
 * `part.decoded.length === 0` : cette partie était ABSENTE du panier au
 * checkout (panier homogène, ou l'autre type de ligne uniquement) — rien à
 * faire, cas normal, silencieux. `part.decoded.length > 0` MAIS
 * `part.lines.length === 0` (tous les livres de cette partie ont disparu
 * entre le checkout et le webhook) → `buildOrderCreateData` refuse
 * explicitement (comportement inchangé, remonté en erreur par l'appelant).
 */
async function createPaidOrderPart(
  session: Stripe.Checkout.Session,
  createdAtEpoch: number,
  // Jamais "don" : un don passe par `handleDonationSessionCompleted` (mailer
  // don, pas de confirmation boutique) — le type le garantit à la compilation.
  orderType: Exclude<OrderKind, "don">,
  part: ResolvedPart,
  books: Map<number, CheckoutBookLookup>,
  discountCents: number,
  shippingCostCents: number,
  totalCents: number,
  promoCodeId: number | null,
): Promise<void> {
  if (part.decoded.length === 0) return;

  let order: Order | null = await findOrderBySessionId(session.id, orderType);

  if (!order) {
    const facts = partSessionFacts(
      session,
      orderType,
      part.lines,
      discountCents,
      shippingCostCents,
      totalCents,
      promoCodeId,
      createdAtEpoch,
    );
    const orderData = buildOrderCreateData(facts, "paid");
    if ("error" in orderData) {
      throw new Error(orderData.error);
    }
    order = await createOrder(orderData);
  }

  if (!order.stockDecremented) {
    await decrementStock(part.decoded, books);
    order = await updateOrder(order.id, { stockDecremented: true });
  }

  if (!order.confirmationSent) {
    await selectOrderMailer().sendOrderConfirmation({
      orderNumber: order.number ?? order.stripeSessionId,
      orderType,
      email: order.email,
      lines: (order.lines ?? []).map((l) => ({
        titleSnapshot: l.titleSnapshot,
        quantity: l.quantity,
        unitPriceTTC: l.unitPriceTTC,
      })),
      shippingCostTTC: order.shippingCostTTC,
      discountTTC: order.discountTTC ?? 0,
      totalTTC: order.totalTTC,
    });
    await updateOrder(order.id, { confirmationSent: true });
  }
}

/**
 * `checkout.session.completed` / `checkout.session.async_payment_succeeded`
 * — crée la ou les commande(s) UNIQUEMENT quand le paiement est effectivement
 * confirmé (`payment_status === "paid"`) : pour un moyen de paiement différé,
 * `checkout.session.completed` peut se présenter en attente
 * (`payment_status !== "paid"`), auquel cas rien n'est créé ici — l'event
 * `async_payment_succeeded` (même fonction) confirmera plus tard.
 *
 * `totalCents` par partie : pour une session à UN SEUL envoi (panier
 * homogène, comportement historique), `session.amount_total` fait foi (le
 * montant réellement encaissé pour cette commande unique) — inchangé depuis
 * avant la scission. Pour une session SCINDÉE (`shipments === 2`), Stripe
 * n'expose qu'un montant COMBINÉ : chaque partie utilise alors
 * `computePartTotalCents` (composition arithmétique pure de faits déjà
 * validés/alloués au checkout, jamais un prix ou une règle de vendabilité
 * redérivés) — un écart entre la somme des deux parties et `amount_total`
 * (anomalie théorique, ex. metadata tronquée) est signalé à Sentry SANS
 * bloquer la création : l'argent est de toute façon déjà encaissé par
 * Stripe, mieux vaut deux commandes imparfaitement ventilées qu'aucune.
 */
async function createPaidOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  if (session.payment_status !== "paid") return;

  const { books, normal, preorder } = await resolveOrderParts(session);
  const metadata = session.metadata ?? {};
  const shippingCostCents = metadataCents(metadata.shippingCostCents);
  const discountNormal = metadataCents(metadata.discountCents);
  const discountPreorder = metadataCents(metadata.preorderDiscountCents);
  const promoCodeId = metadataPromoCodeId(metadata.promoCodeId);

  const shipments = (normal.decoded.length > 0 ? 1 : 0) + (preorder.decoded.length > 0 ? 1 : 0);

  if (shipments > 1) {
    const normalTotal = computePartTotalCents(normal.lines, shippingCostCents, discountNormal);
    const preorderTotal = computePartTotalCents(preorder.lines, shippingCostCents, discountPreorder);
    if (session.amount_total != null && normalTotal + preorderTotal !== session.amount_total) {
      Sentry.captureMessage(
        "Webhook Stripe : total scindé (commande + précommande) ne reconstitue pas amount_total",
        {
          level: "warning",
          extra: {
            sessionId: session.id,
            normalTotal,
            preorderTotal,
            combined: normalTotal + preorderTotal,
            amountTotal: session.amount_total,
          },
        },
      );
    }
    await createPaidOrderPart(
      session,
      createdAtEpoch,
      "commande",
      normal,
      books,
      discountNormal,
      shippingCostCents,
      normalTotal,
      promoCodeId,
    );
    await createPaidOrderPart(
      session,
      createdAtEpoch,
      "precommande",
      preorder,
      books,
      discountPreorder,
      shippingCostCents,
      preorderTotal,
      promoCodeId,
    );
    return;
  }

  // Panier homogène (un seul envoi, ou aucune ligne décodée du tout —
  // anomalie couverte par `createPaidOrderPart`/`buildOrderCreateData`) :
  // `amount_total` appartient ENTIÈREMENT à la partie non vide — l'autre
  // appel est un no-op (`part.decoded.length === 0`).
  const wholeSessionTotal = session.amount_total ?? 0;
  await createPaidOrderPart(
    session,
    createdAtEpoch,
    "commande",
    normal,
    books,
    discountNormal,
    shippingCostCents,
    wholeSessionTotal,
    promoCodeId,
  );
  await createPaidOrderPart(
    session,
    createdAtEpoch,
    "precommande",
    preorder,
    books,
    discountPreorder,
    shippingCostCents,
    wholeSessionTotal,
    promoCodeId,
  );
}

/**
 * `checkout.session.async_payment_failed` — un moyen de paiement différé a
 * finalement échoué. Crée UNE commande de traçabilité `status: "failed"` PAR
 * PARTIE non vide (idempotente par `(stripeSessionId, orderType)`) — SANS
 * jamais décrémenter le stock (aucune vente n'a eu lieu). Si une commande
 * existe déjà pour cette session/ce type (ordre d'arrivée des events), ne la
 * ré-écrase pas.
 */
async function recordFailedOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  const { normal, preorder } = await resolveOrderParts(session);
  const metadata = session.metadata ?? {};
  const shippingCostCents = metadataCents(metadata.shippingCostCents);
  const discountNormal = metadataCents(metadata.discountCents);
  const discountPreorder = metadataCents(metadata.preorderDiscountCents);
  const promoCodeId = metadataPromoCodeId(metadata.promoCodeId);
  const shipments = (normal.decoded.length > 0 ? 1 : 0) + (preorder.decoded.length > 0 ? 1 : 0);
  const wholeSessionTotal = session.amount_total ?? 0;

  async function recordPart(orderType: OrderKind, part: ResolvedPart, discountCents: number): Promise<void> {
    if (part.decoded.length === 0) return;
    if (await findOrderBySessionId(session.id, orderType)) return;

    const totalCents =
      shipments > 1 ? computePartTotalCents(part.lines, shippingCostCents, discountCents) : wholeSessionTotal;
    const facts = partSessionFacts(
      session,
      orderType,
      part.lines,
      discountCents,
      shippingCostCents,
      totalCents,
      promoCodeId,
      createdAtEpoch,
    );
    const orderData = buildOrderCreateData(facts, "failed");
    if ("error" in orderData) {
      throw new Error(orderData.error);
    }
    await createOrder(orderData);
  }

  await recordPart("commande", normal, discountNormal);
  await recordPart("precommande", preorder, discountPreorder);
}

/**
 * `charge.refunded` — retrouve TOUTES les commandes de l'intention de
 * paiement (`stripePaymentIntentId`, la Charge ne porte pas l'id de session)
 * et passe leur statut à `refunded`. PLURIEL depuis 2026-08-20 : un panier
 * mixte scindé partage la MÊME intention de paiement entre ses deux
 * commandes (un seul paiement Stripe) — un remboursement les concerne donc
 * TOUTES les deux, jamais une seule au hasard de l'ordre de tri. PAS de
 * re-crédit de stock automatique (décision volontairement conservatrice,
 * plan §4 étape 9 — le stock est recalé par le routeur mensuel). Une charge
 * remboursée sans commande retrouvée (event orphelin, ordre d'arrivée
 * improbable) ne jette pas : capturée par l'appelant si besoin, ce module se
 * contente de ne rien faire de plus qu'un no-op sûr.
 *
 * Exportée (client 2026-08-21, contreparties) : `route.ts` l'appelle
 * directement pour `charge.refunded` côté `kind !== "order"` (dons) — un don
 * AVEC contrepartie partage la MÊME `stripePaymentIntentId` que sa commande
 * `orderType: "don"`, retrouvée ici sans aucune distinction de type (la
 * fonction est déjà agnostique du type de commande). Un don SANS commande
 * (montant libre, ou antérieur à la feature) reste le no-op silencieux
 * décrit ci-dessus.
 */
export async function markOrderRefunded(charge: Stripe.Charge): Promise<{ found: boolean }> {
  const piId = paymentIntentId(charge);
  if (!piId) return { found: false };

  const orders = await findOrdersByPaymentIntent(piId);
  if (orders.length === 0) return { found: false };

  for (const order of orders) {
    if (order.status !== "refunded") {
      await updateOrder(order.id, { status: "refunded" });
    }
  }
  return { found: true };
}

/* ------------------------------ dons avec contrepartie (client 2026-08-21) ------------------------------ */

/**
 * Joint les lignes de contrepartie décodées (`donLines`) au titre/ISBN relus
 * fraîchement — même esprit que `resolveOrderParts`, MAIS un id introuvable
 * (fiche supprimée entre le checkout et le webhook) n'est JAMAIS omis ici :
 * contrairement au commerce, la contrepartie a été PROMISE au donateur au
 * paiement — la commande doit toujours refléter ce qui est dû, avec un
 * titre de repli plutôt qu'une ligne disparue. Signalé à Sentry (warning)
 * pour investigation, sans jamais bloquer la création de la commande.
 */
function resolveDonationLines(
  sessionId: string,
  decoded: DecodedCheckoutLine[],
  books: Map<number, ContrepartieBook>,
): OrderLineFacts[] {
  return decoded.map((l) => {
    const book = books.get(l.id);
    if (!book) {
      Sentry.captureMessage("Webhook Stripe (don) : article de contrepartie introuvable — titre de repli", {
        level: "warning",
        extra: { sessionId, bookId: l.id },
      });
    }
    return {
      bookId: l.id,
      titleSnapshot: book?.title ?? `Article #${l.id}`,
      isbnSnapshot: book?.isbn ?? null,
      quantity: l.qty,
      unitPriceCents: l.unitPriceCents, // toujours 0 — contrat partagé avec la server action de don
    };
  });
}

/** `Order.shippingAddress`/`billingAddress` (déjà posées, identiques) → adresse du récap mail — `undefined` seulement si la commande n'en porte aucune (anomalie, ne devrait jamais arriver pour un don : tous les paliers 2026 collectent une adresse). */
function recapAddressFromOrder(order: Order): DonationMailRecap["shippingAddress"] {
  const a = order.shippingAddress;
  if (!a) return undefined;
  return {
    fullName: a.fullName,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? undefined,
    postalCode: a.postalCode,
    city: a.city,
    country: a.country,
  };
}

/**
 * `checkout.session.completed` / `checkout.session.async_payment_succeeded`
 * pour un don AVEC contrepartie (`session.metadata.donLines`, posée par la
 * server action de don — contrat partagé `encodeCheckoutLines`/
 * `decodeCheckoutLines`, `checkout-core.ts`) : crée la commande `orderType:
 * "don"` d'expédition, décrémente le stock (négatif autorisé — la
 * contrepartie est TOUJOURS servie, même après réassort) et envoie le
 * remerciement enrichi d'un récap (palier, composition, adresse). Ne fait
 * RIEN si le paiement n'est pas confirmé ou si la session ne porte pas de
 * lignes de contrepartie (don à montant libre — reste sur le chemin
 * `sendDonationThanks` simple de `route.ts`, jamais ici).
 *
 * Idempotente PAR EFFET, même patron que `createPaidOrderPart` (marqueurs
 * `stockDecremented`/`confirmationSent`) : un rejeu Stripe reprend l'effet
 * manquant sans jamais recréer la commande ni renvoyer un effet déjà posé.
 * JAMAIS `sendOrderConfirmation` (mail boutique) pour un don — uniquement
 * `selectDonationMailer().sendDonationThanks`.
 *
 * `opts` — réservé au backfill (`scripts/backfill-dons-contreparties.ts`) ;
 * `route.ts` ne les passe jamais, le webhook garde son comportement
 * inchangé (défauts `undefined`/`new Date()`) :
 * - `skipThanksMail` : pose `confirmationSent: true` SANS envoyer, pour les
 *   dons dont le donateur a déjà reçu le remerciement simple avant que
 *   cette commande n'existe ;
 * - `paidAtISOOverride` : remplace l'approximation « instant de traitement »
 *   (`new Date()`, valide pour le webhook temps réel — quelques secondes
 *   après le paiement) par une date exacte — le backfill tourne parfois des
 *   jours après le don réel, `paidAt`/`createdAt` doivent rester la date du
 *   don, pas celle du run.
 */
export async function handleDonationSessionCompleted(
  session: Stripe.Checkout.Session,
  opts?: { skipThanksMail?: boolean; paidAtISOOverride?: string },
): Promise<void> {
  if (session.payment_status !== "paid") return;
  const decoded = decodeCheckoutLines(session.metadata?.donLines);
  if (decoded.length === 0) return;

  // Lecture brouillons INCLUS (contrairement au parcours boutique) : une
  // contrepartie peut référencer une fiche minimale non publiée — cf.
  // `src/lib/contreparties.ts`, même lecteur que la page merci.
  const books = await getContrepartieBooksByIds(decoded.map((l) => l.id));

  let order: Order | null = await findOrderBySessionId(session.id, "don");

  if (!order) {
    // `resolveDonationLines` (et son éventuel warning Sentry) UNIQUEMENT à la
    // création — un rejeu (`order` déjà trouvé) ne reconstruit pas les lignes,
    // évitant un warning en double pour la même anomalie.
    const facts: OrderSessionFacts = {
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId(session),
      email: session.customer_details?.email ?? null,
      shippingAddress: addressFromStripe(session.collected_information?.shipping_details),
      lines: resolveDonationLines(session.id, decoded, books),
      orderType: "don",
      shippingMethod: "offert",
      shippingCostCents: 0,
      discountCents: 0,
      promoCodeId: null,
      totalCents: session.amount_total ?? 0,
      // Pas de `createdAtEpoch` transmis par `route.ts` (signature volontairement
      // réduite à la session, symétrique de la server action de don) — l'instant
      // de traitement du webhook est une approximation suffisante de « payée le »,
      // même esprit que `event.created` côté commerce (jamais un instant inventé).
      // `paidAtISOOverride` (backfill) remplace cette approximation par la date
      // réelle du don quand le run a lieu longtemps après le paiement.
      paidAtISO: opts?.paidAtISOOverride ?? new Date().toISOString(),
    };
    const orderData = buildOrderCreateData(facts, "paid");
    if ("error" in orderData) {
      throw new Error(orderData.error);
    }
    order = await createOrder(orderData);
  }

  if (!order.stockDecremented) {
    for (const l of decoded) {
      if (!books.has(l.id)) continue; // livre disparu — snapshot honnête, rien à décrémenter physiquement
      await decrementBookStock(l.id, l.qty, { allowNegative: true });
    }
    order = await updateOrder(order.id, { stockDecremented: true });
  }

  if (!order.confirmationSent) {
    if (opts?.skipThanksMail) {
      // Backfill (cf. docstring) : marqueur posé SANS envoi, aucun mail.
      await updateOrder(order.id, { confirmationSent: true });
    } else {
      const tierId = session.metadata?.tier;
      const tier = tierId ? DONATION_TIERS.find((t) => t.id === tierId) : undefined;
      await selectDonationMailer().sendDonationThanks({
        email: order.email,
        recap: {
          // Repli sur le brut `tierId` si le palier a disparu de la table
          // (retrait ultérieur) — jamais un intitulé vide dans le mail.
          tierTitle: tier?.title ?? tierId ?? "Contrepartie",
          amountEuros: order.totalTTC,
          lines: (order.lines ?? []).map((l) => ({ title: l.titleSnapshot, quantity: l.quantity })),
          shippingAddress: recapAddressFromOrder(order),
        },
      });
      await updateOrder(order.id, { confirmationSent: true });
    }
  }
}

export interface OrderWebhookResult {
  handled: boolean;
  /** `false` uniquement pour `charge.refunded` sans commande retrouvée — l'appelant peut vouloir le signaler (Sentry) sans faire échouer le webhook. */
  orderFound?: boolean;
}

/** Point d'entrée appelé par `route.ts` quand `metadata.kind === "order"`. */
export async function handleOrderWebhookEvent(event: Stripe.Event): Promise<OrderWebhookResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await createPaidOrder(event.data.object as Stripe.Checkout.Session, event.created);
      return { handled: true };
    }
    case "checkout.session.async_payment_failed": {
      await recordFailedOrder(event.data.object as Stripe.Checkout.Session, event.created);
      return { handled: true };
    }
    case "charge.refunded": {
      const { found } = await markOrderRefunded(event.data.object as Stripe.Charge);
      return { handled: true, orderFound: found };
    }
    default:
      return { handled: false };
  }
}

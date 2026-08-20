import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Order } from "@/payload-types";
import { computeStockAfterDecrement, type OrderCreateData, type OrderKind } from "./order-webhook-core";

/**
 * Seam Payload dédié au cycle de vie `orders` (webhook Stripe, plan §4 étape
 * 9) — le SEUL module qui parle au SDK Payload pour cette collection (+ la
 * mise à jour de stock `books` que le webhook déclenche au même moment).
 * Même esprit que `commerce-source.ts` (lecture Payload dédiée du parcours
 * d'achat, hors du port `CatalogueSource`) mais côté ÉCRITURE : PAS de
 * `cache()` React ici (une commande créée deux fois par un rendu mis en
 * cache serait un bug, pas une optimisation) — `getPayload({ config })` reste
 * mémoïsé par Payload lui-même (singleton par process), c'est suffisant.
 *
 * `overrideAccess: true` partout (contrairement aux lectures `books` de
 * `commerce-source`, qui servent un public anonyme) : les deux
 * seuls appelants de ce module — le webhook Stripe et `/api/health` — sont
 * des contextes serveur de confiance, jamais une requête publique ; `orders`
 * n'a d'ailleurs aucune policy `read`/`create` publique (`Orders.ts`).
 *
 * Centralise les appels déjà présents dans `order-handler.ts`/`health/
 * route.ts` — le but est de nommer le seam, pas de changer le comportement
 * observable. La logique métier (idempotence par `stripeSessionId`, reprise
 * par effet non encore marqué — issue #64 —, refus de re-crédit au
 * remboursement) reste dans `order-handler.ts` : ce module ne fait que l'I/O.
 * Exception : `decrementBookStock` porte elle-même la boucle
 * comparer-puis-échanger (issue #65) — l'atomicité du décrément est un trait
 * de CETTE écriture, pas une décision de l'appelant, `computeStockAfterDecrement`
 * (`order-webhook-core.ts`) restant le cœur pur qui porte la règle (plancher 0,
 * `null` = stock non suivi).
 */

/**
 * La commande existe-t-elle déjà pour cette session ET ce type (idempotence,
 * issue #64, étendue 2026-08-20 pour la scission précommande) — un event
 * Stripe rejoué ne doit rien recréer. `orderType` fait partie de la clé
 * d'idempotence depuis que la même session peut légitimement porter DEUX
 * commandes (une par type, panier mixte) : `stripeSessionId` seul ne
 * distingue plus une commande d'une précommande de la même session.
 */
export async function findOrderBySessionId(
  stripeSessionId: string,
  orderType: OrderKind,
): Promise<Order | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripeSessionId: { equals: stripeSessionId }, orderType: { equals: orderType } },
    limit: 1,
    overrideAccess: true,
  });
  return docs[0] ?? null;
}

/**
 * Retrouve TOUTES les commandes d'une intention de paiement Stripe — seul
 * identifiant porté par une `Charge` (`charge.refunded`, pas de
 * `stripeSessionId` dessus). PLURIEL depuis 2026-08-20 : un panier mixte
 * scindé partage la MÊME `stripePaymentIntentId` entre ses deux commandes
 * (un seul paiement) — un remboursement de charge doit donc pouvoir
 * retrouver et faire transiter les DEUX, jamais une seule au hasard de
 * l'ordre de tri (`markOrderRefunded`, `order-handler.ts`).
 */
export async function findOrdersByPaymentIntent(stripePaymentIntentId: string): Promise<Order[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripePaymentIntentId: { equals: stripePaymentIntentId } },
    limit: 0,
    overrideAccess: true,
  });
  return docs;
}

/** Crée une commande (`status: "paid"` ou `"failed"`, cf. `buildOrderCreateData`) — écriture opérationnelle du webhook, ni `contentTouched` ni revalidation Next (contrat CLAUDE.md). */
export async function createOrder(data: OrderCreateData): Promise<Order> {
  const payload = await getPayload({ config });
  return payload.create({
    collection: "orders",
    data,
    overrideAccess: true,
    context: { disableRevalidate: true },
  });
}

/**
 * Met à jour une commande existante — passage à `refunded` (`charge.refunded`)
 * OU pose d'un des marqueurs d'effet du webhook (issue #64 : `stockDecremented`,
 * `confirmationSent`, cf. `order-handler.ts:createPaidOrder`, reprise idempotente
 * par effet plutôt qu'à l'entrée). Même garde de revalidation que `createOrder`.
 */
export async function updateOrder(
  id: number,
  data: Partial<Pick<Order, "status" | "stockDecremented" | "confirmationSent">>,
): Promise<Order> {
  const payload = await getPayload({ config });
  return payload.update({
    collection: "orders",
    id,
    data,
    overrideAccess: true,
    context: { disableRevalidate: true },
  });
}

/** Tentatives max de la boucle CAS avant d'abandonner — concurrence extrême jamais rencontrée en pratique, garde-fou plutôt qu'une boucle infinie. */
const MAX_STOCK_DECREMENT_ATTEMPTS = 5;

/**
 * Décrémente le stock d'un livre au paiement, de façon ATOMIQUE (issue #65) —
 * le décrément est exprimé DANS l'écriture : chaque tentative relit le stock
 * courant, calcule la valeur suivante avec le cœur pur
 * `computeStockAfterDecrement` (plancher 0, `null` = non suivi), puis écrit en
 * comparer-puis-échanger (`where` gardé sur la valeur LUE) — si un autre appel
 * concurrent a modifié le stock entre la lecture et l'écriture, `payload.update`
 * ne matche aucun document (`docs` vide) et la tentative reprend sur le stock
 * frais. Deux commandes concurrentes sur le même livre ne se perdent donc plus
 * l'une l'autre (contrairement à l'ancienne écriture en valeur absolue calculée
 * côté application). Même garde que l'import stock routeur (`stock-import.ts`) :
 * écriture automatisée, ni `contentTouched` ni revalidation par ligne.
 */
export async function decrementBookStock(id: number, qty: number): Promise<void> {
  const payload = await getPayload({ config });

  for (let attempt = 0; attempt < MAX_STOCK_DECREMENT_ATTEMPTS; attempt++) {
    const current = await payload.findByID({
      collection: "books",
      id,
      depth: 0,
      overrideAccess: true,
    });
    const currentStock: number | null = current.commerce?.stock ?? null;
    const nextStock = computeStockAfterDecrement(currentStock, qty);
    if (nextStock === null) return; // stock non suivi — rien à décrémenter

    const { docs } = await payload.update({
      collection: "books",
      where: {
        id: { equals: id },
        "commerce.stock": { equals: currentStock },
      },
      limit: 1,
      data: { commerce: { stock: nextStock } },
      overrideAccess: true,
      context: { migration: true, disableRevalidate: true },
    });
    if (docs.length > 0) return; // écriture appliquée sur la valeur lue à cette tentative
    // sinon : le stock a bougé entre la lecture et l'écriture — retente sur le stock frais
  }

  throw new Error(
    `decrementBookStock : trop de tentatives de concurrence pour le livre ${id} (qty=${qty}).`,
  );
}

/** `updatedAt` de la commande la plus récemment touchée (création OU passage à `refunded`) — signal `/api/health` (moniteur #8, R8), jamais d'appel réseau Stripe. */
export async function findLatestOrderUpdatedAt(): Promise<string | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    sort: "-updatedAt",
    limit: 1,
    overrideAccess: true,
  });
  return docs[0]?.updatedAt ?? null;
}

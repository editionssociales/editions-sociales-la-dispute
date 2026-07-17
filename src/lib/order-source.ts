import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import type { Order } from "@/payload-types";
import type { OrderCreateData } from "./order-webhook-core";

/**
 * Seam Payload dédié au cycle de vie `orders` (webhook Stripe, plan §4 étape
 * 9) — le SEUL module qui parle au SDK Payload pour cette collection (+ la
 * mise à jour de stock `books` que le webhook déclenche au même moment).
 * Même esprit que `cart-source.ts`/`checkout-source.ts` (lecture Payload
 * dédiée, hors du port `CatalogueSource`) mais côté ÉCRITURE : PAS de
 * `cache()` React ici (une commande créée deux fois par un rendu mis en
 * cache serait un bug, pas une optimisation) — `getPayload({ config })` reste
 * mémoïsé par Payload lui-même (singleton par process), c'est suffisant.
 *
 * `overrideAccess: true` partout (contrairement à `cart-source`/
 * `checkout-source`, qui servent un public anonyme en lecture) : les deux
 * seuls appelants de ce module — le webhook Stripe et `/api/health` — sont
 * des contextes serveur de confiance, jamais une requête publique ; `orders`
 * n'a d'ailleurs aucune policy `read`/`create` publique (`Orders.ts`).
 *
 * Centralise les appels déjà présents dans `order-handler.ts`/`health/
 * route.ts`, options reprises À L'IDENTIQUE (mêmes `where`, `sort`, `limit`,
 * `context`) — le but est de nommer le seam, pas de changer son
 * comportement. La logique métier (idempotence par `stripeSessionId`,
 * `computeStockAfterDecrement`, refus de re-crédit au remboursement) reste
 * dans `order-handler.ts` : ce module ne fait que l'I/O.
 */

/** La commande existe-t-elle déjà pour cette session (idempotence — un event Stripe rejoué ne doit rien recréer) ? */
export async function findOrderBySessionId(stripeSessionId: string): Promise<Order | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripeSessionId: { equals: stripeSessionId } },
    limit: 1,
    overrideAccess: true,
  });
  return docs[0] ?? null;
}

/** Retrouve une commande par intention de paiement Stripe — seul identifiant porté par une `Charge` (`charge.refunded`, pas de `stripeSessionId` dessus). */
export async function findOrderByPaymentIntent(stripePaymentIntentId: string): Promise<Order | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripePaymentIntentId: { equals: stripePaymentIntentId } },
    limit: 1,
    overrideAccess: true,
  });
  return docs[0] ?? null;
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

/** Met à jour une commande existante (aujourd'hui : passage à `refunded` depuis `charge.refunded`) — même garde de revalidation que `createOrder`. */
export async function updateOrder(id: number, data: { status: Order["status"] }): Promise<Order> {
  const payload = await getPayload({ config });
  return payload.update({
    collection: "orders",
    id,
    data,
    overrideAccess: true,
    context: { disableRevalidate: true },
  });
}

/** Décrémente le stock d'un livre au paiement — même garde que l'import stock routeur (`stock-import.ts`) : écriture automatisée, ni `contentTouched` ni revalidation par ligne. */
export async function updateBookStock(id: number, stock: number): Promise<void> {
  const payload = await getPayload({ config });
  await payload.update({
    collection: "books",
    id,
    data: { commerce: { stock } },
    overrideAccess: true,
    context: { migration: true, disableRevalidate: true },
  });
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

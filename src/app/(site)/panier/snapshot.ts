import type { Book } from "@/lib/types";

/**
 * Instantané panier — hors fichier `"use server"` : seul des `async function`
 * peuvent y être exportés (cf. `contact/state.ts`, même contrainte Next).
 */
export interface CartSnapshot {
  books: Book[];
  reducedShippingFlags: { id: number; flag: boolean }[];
  /** Livres « vendu par lot » (`commerce.venteParLot`) — même chemin que le port réduit. */
  lotFlags: { id: number; flag: boolean }[];
}

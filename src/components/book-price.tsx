import { formatPrice } from "@/lib/format";

/**
 * Le prix est un FAIT du livre, affiché dès qu'il existe ; seuls le CTA et la
 * microcopie de disponibilité dépendent du statut d'achat. Primitive partagée
 * SERVEUR (zéro `"use client"`), zéro logique propre — même famille que
 * `NewTabMark` (`src/components/CLAUDE.md`).
 */
export function BookPrice({
  price,
  className,
}: {
  price?: number | null;
  className: string;
}) {
  if (price == null) return null;
  return <p className={className}>{formatPrice(price)}</p>;
}

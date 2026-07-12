/**
 * Formate le numéro de commande lisible à partir de l'identifiant Postgres
 * (`id` serial de la table `orders`, déjà strictement croissant et unique —
 * pas besoin d'une séquence dédiée). Préfixé pour ne jamais collisionner avec
 * les anciens numéros WooCommerce, purement numériques (plan phase 4, §3).
 */
export function formatOrderNumber(id: number): string {
  return `CMD-${String(id).padStart(6, '0')}`
}

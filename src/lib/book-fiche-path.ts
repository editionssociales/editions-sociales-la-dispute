/**
 * Chemin public d'une fiche livre — règle UNIQUE (fonds : `/catalogue/<maison>/<slug>` ;
 * article boutique-seul : `/boutique/<slug>`), partagée par la purge ISR du
 * webhook (`order-source.ts:findBookFichePaths`) et les liens du mail de
 * commande de lot (`site-content-core.ts`). Pur : aucune I/O.
 * `null` = fiche sans chemin public (slug vide, ni maison ni boutique).
 */
export function bookFichePath(doc: {
  slug?: string | null;
  edition?: string | null;
  origin?: string | null;
}): string | null {
  if (typeof doc.slug !== "string" || doc.slug === "") return null;
  if (typeof doc.edition === "string") return `/catalogue/${doc.edition}/${doc.slug}`;
  if (doc.origin === "boutique") return `/boutique/${doc.slug}`;
  return null;
}

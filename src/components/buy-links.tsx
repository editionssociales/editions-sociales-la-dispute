import type { Book } from "@/lib/types";
import { canAddToCart } from "@/lib/cart-core";
import { DELIVERY_DELAY_RANGE } from "@/lib/delivery-copy";
import { formatDateFr } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart-button";
import { BookPrice } from "./book-price";
import { Button } from "./button";
import { NewTabMark } from "./new-tab-mark";

/**
 * Boîte d'achat unifiée (chantier 2.2) — les 5 statuts (`upcoming`,
 * `preorder`+panier, `unavailable`, `available`+panier, `available`
 * (défensif)/`external`) partagent la même architecture visuelle : prix →
 * action → microcopie de disponibilité. Rendue dans le conteneur bordé porté
 * par l'appelant (`catalogue/[edition]/[slug]/page.tsx`,
 * `boutique/[slug]/page.tsx` : `border-2 border-ink bg-paper p-4`), jamais
 * ici — cette liste reste réutilisable sans imposer son propre cadre.
 *
 * Le prix est un FAIT du livre (calculé une fois ci-dessous, via `BookPrice`)
 * et s'affiche donc identiquement dans les 5 branches, y compris `upcoming`
 * et `unavailable` (rien n'est en vente, mais le prix reste une information
 * publique) ; seuls le CTA et la microcopie varient avec le statut d'achat.
 */

const PRICE_CLASS = "font-sans text-3xl font-black leading-none text-ink";
const STATUS_CLASS = "font-sans text-xl font-black italic text-ink";
const MICROCOPY_CLASS = "mt-2 font-sans text-xs font-bold uppercase tracking-[.04em] text-muted";

export function BuyLinksList({
  book,
  livraisonDelai = DELIVERY_DELAY_RANGE,
}: {
  book: Book;
  /**
   * Mention affichée pour un livre en stock — éditable au back-office
   * (`PagesLegales.livraisonDelai`, batch 3), fusionnée côté serveur par
   * l'appelant (fiche catalogue/boutique) ; défaut `DELIVERY_DELAY_RANGE`
   * pour tout appelant qui ne la pose pas (tests compris).
   */
  livraisonDelai?: string;
}) {
  // Fourchette réelle plutôt que promesse d'expédition éclair (demande client
  // 2026-08-26) — source unique `delivery-copy.ts`, surchargeable au back-office.
  const inStockCopy = `En stock — livraison ${livraisonDelai}`;
  // Calculé UNE fois, rendu par les CINQ branches sans exception (bug signalé
  // par la cliente : `upcoming`/`unavailable` n'affichaient pas le prix de
  // leur propre fiche, alors que `available`/`preorder`/`external` le
  // faisaient déjà) — le prix est un fait du livre, pas une promesse de vente.
  const priceBlock = <BookPrice price={book.price} className={PRICE_CLASS} />;
  // Liens libraires de repli — lus une seule fois, rendus par les CINQ
  // branches de statut sans exception (bug signalé par la cliente,
  // corrigé en plusieurs passes : `upcoming`/`unavailable` les perdaient
  // via un early return qui court-circuitait ce bloc, puis `preorder` et
  // le panier natif de `canAddToCart` — LE cas majoritaire du catalogue —
  // les perdaient encore). Seul le lien EXACTEMENT repris par le CTA
  // principal (`book.permalink`, cf. `resolveNativePurchase` — priorité
  // ParisLibrairies puis LaLibrairie pour `external`) est exclu du
  // secondaire, pour ne pas le répéter : l'autre lien libraire, s'il existe,
  // reste affiché (bug corrigé : `external` les perdait tous les deux, y
  // compris celui non repris).
  const secondary = [
    book.buy.parislibrairies && book.buy.parislibrairies !== book.permalink
      ? { label: "ParisLibrairies", href: book.buy.parislibrairies }
      : null,
    book.buy.lalibrairie && book.buy.lalibrairie !== book.permalink
      ? { label: "LaLibrairie", href: book.buy.lalibrairie }
      : null,
  ].filter((o): o is { label: string; href: string } => o != null);

  const secondaryLinks = secondary.length > 0 && (
    <div className="mt-2 flex flex-wrap gap-2">
      {secondary.map((s) => (
        <Button
          key={s.label}
          href={s.href}
          variant="outline"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 text-xs tracking-[.03em]"
        >
          {s.label}
          <NewTabMark />
        </Button>
      ))}
    </div>
  );

  if (book.status === "upcoming") {
    return (
      <div>
        {priceBlock}
        <p className={STATUS_CLASS}>
          À paraître{book.publishedAt ? ` le ${formatDateFr(book.publishedAt)}` : ""}
        </p>
        <p className={MICROCOPY_CLASS}>Pas encore en vente en ligne</p>
        {secondaryLinks}
      </div>
    );
  }

  // Précommande (client 2026-08-20) : à paraître MAIS « Ouvert à la
  // précommande » coché — même bouton panier natif qu'`available`
  // (`canAddToCart`, `cart-core.ts`), microcopie de date au lieu de « en
  // stock » (rien n'est en stock avant la parution) ; la scission
  // commande/précommande n'a lieu qu'à l'encaissement (`cart-quote.ts`).
  if (book.status === "preorder") {
    return (
      <div>
        {priceBlock}
        <AddToCartButton id={book.id} className="mt-3 w-full" label="Précommander" />
        <p className={MICROCOPY_CLASS}>
          Expédié à parution
          {book.publishedAt ? ` — le ${formatDateFr(book.publishedAt)}` : ""}
        </p>
        {secondaryLinks}
      </div>
    );
  }

  if (book.status === "unavailable") {
    return (
      <div>
        {priceBlock}
        <p className={STATUS_CLASS}>Indisponible à la vente en ligne</p>
        <p className={MICROCOPY_CLASS}>
          {secondary.length > 0 ? "Consultez nos partenaires libraires ci-dessous" : "Revenez bientôt."}
        </p>
        {secondaryLinks}
      </div>
    );
  }

  // Panier natif (plan §4 étape 6, reflet exact de `resolveNativePurchase`) :
  // bouton panier pour un livre disponible. `book.permalink` vaut alors la
  // fiche interne elle-même (pas un lien d'achat externe) — inutile ici,
  // remplacé par le bouton.
  if (canAddToCart(book)) {
    return (
      <div>
        {priceBlock}
        <AddToCartButton id={book.id} className="mt-3 w-full" />
        <p className={MICROCOPY_CLASS}>{inStockCopy}</p>
        {secondaryLinks}
      </div>
    );
  }

  // `available` sans panier natif (défensif — jamais atteint par
  // `resolveNativePurchase`, seulement par une fixture de test construite à
  // la main) et `external` : CTA plein vers `book.permalink`. Le prix
  // (`priceBlock`) s'affiche dans les deux cas, `book.price` étant souvent
  // connu pour `external`.
  return (
    <div>
      {priceBlock}
      {book.permalink && (
        <Button
          href={book.permalink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 w-full px-5 py-3 text-sm tracking-[.03em]"
        >
          {book.status === "available" ? "Acheter" : "Voir en librairie"}
          <NewTabMark />
        </Button>
      )}
      <p className={MICROCOPY_CLASS}>
        {book.status === "available"
          ? inStockCopy
          : "En vente chez un libraire partenaire"}
      </p>
      {secondaryLinks}
    </div>
  );
}

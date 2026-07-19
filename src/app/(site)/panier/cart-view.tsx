"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useCart } from "@/components/cart/cart-context";
import { ShelfSpines } from "@/components/cart/shelf-spines";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { BookCover } from "@/lib/cover";
import { formatPrice } from "@/lib/format";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import {
  computeCartTotals,
  MAX_LINE_QTY,
  resolveCartSummary,
  type CartLineView,
} from "@/lib/cart-core";
import { computeShipping, FREE_SHIPPING_MIN_CART_CENTS, type ShippingZone } from "@/lib/shipping-core";
import type { PromoEvalResult } from "@/payload/lib/promo-eval-core";
import { getCartSnapshot, validatePromoCode, type CartSnapshot } from "./actions";

interface CheckoutErrorBody {
  error?: string;
  refusals?: { message: string }[];
}

/**
 * Le vrai panier (plan §4 étape 6) — rendu par `page.tsx`. Le panier lui-même (ids +
 * quantités) vit dans `<CartProvider>` (`localStorage`) ; ce composant se
 * contente de le confronter à une relecture serveur fraîche à chaque
 * changement de composition (`getCartSnapshot`), jamais aux prix qu'il aurait
 * pu retenir lui-même.
 */

const ZONES: { value: ShippingZone; label: string }[] = [
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgique" },
  { value: "CH", label: "Suisse" },
];

const FIELD_CLASS =
  "border-2 border-ink bg-paper px-3 py-2 font-sans text-sm font-bold text-ink outline-none " +
  FOCUS_RING_LIGHT;

function euros(cents: number): string {
  return formatPrice(cents / 100) ?? "—";
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center gap-7 border-2 border-ink bg-paper px-6 py-16 text-center">
      <ShelfSpines />
      <div className="max-w-md">
        <p className="font-sans text-lg font-black italic text-ink">Votre panier est vide.</p>
        <p className="mt-2 font-sans text-sm text-ink/60">
          Parcourez le catalogue pour y ajouter des livres.
        </p>
      </div>
      <Button href="/catalogue">Parcourir le catalogue</Button>
    </div>
  );
}

function QuantityStepper({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Quantité">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= 1}
        aria-label="Retirer un exemplaire"
        className={`flex h-11 w-11 items-center justify-center border-2 border-ink font-sans font-bold text-ink hover:bg-ink hover:text-paper disabled:opacity-30 disabled:hover:bg-paper disabled:hover:text-ink ${FOCUS_RING_LIGHT}`}
      >
        −
      </button>
      <span className="w-6 text-center font-sans text-sm font-bold text-ink" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= MAX_LINE_QTY}
        aria-label="Ajouter un exemplaire"
        className={`flex h-11 w-11 items-center justify-center border-2 border-ink font-sans font-bold text-ink hover:bg-ink hover:text-paper disabled:opacity-30 disabled:hover:bg-paper disabled:hover:text-ink ${FOCUS_RING_LIGHT}`}
      >
        +
      </button>
    </div>
  );
}

function CartLineRow({
  line,
  onSetQty,
  onRemove,
}: {
  line: CartLineView;
  onSetQty: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <Fragment>
      <div className="flex items-center justify-center bg-paper p-2">
        <Link href={line.href} className="block w-14 shrink-0">
          <BookCover
            cover={line.cover}
            title={line.title}
            alt={line.title}
            fit="width"
            sizes="56px"
            fallbackClassName="p-1 text-[8px]"
          />
        </Link>
      </div>
      <div className={`flex flex-col justify-center gap-2 bg-paper p-3 ${line.purchasable ? "" : "opacity-60"}`}>
        <Link
          href={line.href}
          className={`font-sans text-sm font-bold text-ink hover:underline ${FOCUS_RING_LIGHT}`}
        >
          {line.title}
        </Link>
        {!line.purchasable && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.04em] text-brick">
            Indisponible — exclu du calcul, retirez-le si besoin.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <QuantityStepper qty={line.qty} onChange={onSetQty} />
          <button
            type="button"
            onClick={onRemove}
            className={`font-sans text-xs font-bold uppercase tracking-[.04em] text-ink/60 underline hover:text-ink ${FOCUS_RING_LIGHT}`}
          >
            Retirer
          </button>
        </div>
      </div>
      <div className="flex items-center justify-end bg-paper p-3 font-sans text-sm text-ink">
        {line.unitPriceCents != null ? euros(line.unitPriceCents) : "—"}
      </div>
      <div className="flex items-center justify-end bg-paper p-3 font-sans text-sm font-bold text-ink">
        {line.purchasable ? euros(line.lineTotalCents) : "—"}
      </div>
    </Fragment>
  );
}

export function CartView() {
  const { state, ready, setLineQty, removeFromCart } = useCart();
  const ids = useMemo(() => state.lines.map((l) => l.id), [state.lines]);
  const idsKey = ids.join(",");

  const [snapshot, setSnapshot] = useState<CartSnapshot>({ books: [], reducedShippingFlags: [] });
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [snapshotError, setSnapshotError] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Enveloppé dans une fonction nommée (plutôt qu'un `setState` nu en tête
    // d'effet) — `react-hooks/set-state-in-effect` (React Compiler) signale
    // sinon un faux positif : ceci relit un système externe (le catalogue
    // serveur) à chaque changement de composition du panier, le cas
    // légitime que la règle documente elle-même.
    //
    // `getCartSnapshot` relit `getAllBooks()` (`catalogue.ts`), qui peut
    // jeter si la lecture Payload/Postgres échoue. Sans ce `try/catch`, l'échec resterait
    // une promesse rejetée non gérée : `snapshotReady` ne passerait jamais à
    // `true`, ce qui bloque déjà l'auto-guérison (garde ci-dessous) mais ne
    // prévient jamais l'utilisateur — d'où `snapshotError`, affiché plutôt
    // que de laisser le panier indéfiniment en chargement.
    async function load() {
      setSnapshotReady(false);
      setSnapshotError(false);
      try {
        const next = await getCartSnapshot(ids);
        if (cancelled) return;
        setSnapshot(next);
        setSnapshotReady(true);
      } catch {
        if (cancelled) return;
        setSnapshotError(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // `idsKey` (ordre + composition, pas les quantités) est la seule chose
    // qui doive redéclencher une relecture serveur — une quantité ne change
    // ni le prix ni la disponibilité d'une ligne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idsKey]);

  const flagsMap = useMemo(
    () => new Map(snapshot.reducedShippingFlags.map((f) => [f.id, f.flag])),
    [snapshot],
  );
  const summary = useMemo(
    () => resolveCartSummary(state, snapshot.books, flagsMap),
    [state, snapshot, flagsMap],
  );

  // Auto-guérison : un id du panier introuvable dans l'instantané (livre
  // supprimé/dépublié entre l'ajout et la visite de `/panier`) est retiré du
  // panier persisté — jamais un article encore trouvé mais devenu
  // non-achetable (`purchasable: false`), qui reste affiché pour action de
  // l'utilisateur (cf. `CartLineRow`). Garde `snapshotReady` INDISPENSABLE :
  // avant la toute première résolution de `getCartSnapshot`, `snapshot.books`
  // vaut `[]` par défaut — sans cette garde, chaque id du panier semblerait
  // "introuvable" et cet effet viderait le panier entier dès le montage.
  useEffect(() => {
    if (!snapshotReady) return;
    for (const id of summary.missingIds) removeFromCart(id);
  }, [snapshotReady, summary.missingIds, removeFromCart]);

  const [zone, setZone] = useState<ShippingZone>("FR");
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<PromoEvalResult | null>(null);
  const [promoPending, startPromoTransition] = useTransition();

  function applyPromoCode() {
    const code = promoInput.trim();
    if (!code) return;
    startPromoTransition(async () => {
      setPromoResult(await validatePromoCode(code, summary.subtotalCents));
    });
  }

  const freeShippingCoupon = promoResult?.ok === true && promoResult.type === "free_shipping";
  const shipping = computeShipping({
    cartTotalCents: summary.subtotalCents,
    zone,
    manifestOnly: summary.manifestOnly,
    freeShippingCoupon,
  });
  const discountCents = promoResult?.ok === true && promoResult.type === "fixed_cart" ? promoResult.discountCents : 0;
  const totals = computeCartTotals(summary.subtotalCents, discountCents, shipping.ok ? shipping.costCents : null);

  const [checkoutPending, startCheckoutTransition] = useTransition();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const hasPurchasableLine = summary.lines.some((line) => line.purchasable);

  /**
   * Appelle `POST /api/checkout` (plan §4 étape 8) — RE-VALIDÉ en entier côté
   * serveur (prix, stock, promo, zone) : ce composant n'envoie que des
   * `{id, qty}` + zone + code promo saisi, jamais un total calculé ici. Sur
   * succès, redirection pleine page vers Stripe (pas un `router.push`, l'URL
   * est hors du domaine de l'app) ; sur refus, message serveur affiché tel
   * quel (déjà rédigé pour un lecteur, cf. `checkout-core.ts`).
   */
  function handleCheckout() {
    setCheckoutError(null);
    startCheckoutTransition(async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lines: state.lines.map((line) => ({ id: line.id, qty: line.qty })),
            zone,
            ...(promoInput.trim() && { promoCode: promoInput.trim() }),
          }),
        });
        const data = (await res.json()) as { url?: string } & CheckoutErrorBody;
        if (res.ok && typeof data.url === "string") {
          window.location.href = data.url;
          return;
        }
        setCheckoutError(
          data.refusals && data.refusals.length > 0
            ? data.refusals.map((r) => r.message).join(" ")
            : (data.error ?? "Le paiement est momentanément indisponible, réessayez."),
        );
      } catch {
        setCheckoutError("Le paiement est momentanément indisponible, réessayez.");
      }
    });
  }

  if (!ready) {
    return <p className="py-16 text-center font-sans text-sm text-ink/50">Chargement du panier…</p>;
  }
  if (state.lines.length === 0) {
    return <EmptyCart />;
  }

  return (
    <div className={`transition-opacity motion-reduce:transition-none ${snapshotReady ? "" : "opacity-70"}`}>
      {snapshotError && (
        <p className="mb-4 font-sans text-sm font-bold text-brick" role="alert">
          Impossible de vérifier votre panier pour le moment (catalogue
          momentanément indisponible). Les prix et disponibilités affichés
          peuvent être périmés — réessayez dans un instant.
        </p>
      )}
      <FramedGrid className="grid-cols-[72px_1fr_auto_auto] items-stretch">
        {summary.lines.map((line) => (
          <CartLineRow
            key={line.id}
            line={line}
            onSetQty={(qty) => setLineQty(line.id, qty)}
            onRemove={() => removeFromCart(line.id)}
          />
        ))}
      </FramedGrid>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-1">
            <span className="font-sans text-xs font-bold uppercase tracking-[.06em] text-ink/60">
              Livraison
            </span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as ShippingZone)}
              className={`${FIELD_CLASS} cursor-pointer`}
            >
              {ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-sans text-xs font-bold uppercase tracking-[.06em] text-ink/60">
                Code promo
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value);
                    setPromoResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyPromoCode();
                    }
                  }}
                  placeholder="AGREG2027"
                  className={`${FIELD_CLASS} min-w-[160px] flex-1 uppercase placeholder:normal-case placeholder:text-ink/40`}
                />
                <Button
                  variant="outline"
                  onClick={applyPromoCode}
                  disabled={promoPending || promoInput.trim() === ""}
                  className="px-4 py-2 text-xs"
                >
                  {promoPending ? "Vérification…" : "Appliquer"}
                </Button>
              </div>
            </label>
            {promoResult && (
              <p
                aria-live="polite"
                className={`font-sans text-xs font-bold ${promoResult.ok ? "text-bottle" : "text-brick"}`}
              >
                {promoResult.ok
                  ? promoResult.type === "free_shipping"
                    ? "Code appliqué : livraison offerte."
                    : `Code appliqué : -${euros(promoResult.discountCents)}.`
                  : promoResult.message}
              </p>
            )}
          </div>
        </div>

        <FramedGrid as="dl" className="h-fit grid-cols-2">
          <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-ink/60">
            Sous-total
          </dt>
          <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
            {euros(totals.subtotalCents)}
          </dd>

          {totals.discountCents > 0 && (
            <>
              <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-ink/60">
                Remise
              </dt>
              <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
                −{euros(totals.discountCents)}
              </dd>
            </>
          )}

          <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-ink/60">
            Port ({zone})
          </dt>
          <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
            {shipping.ok ? euros(shipping.costCents) : "—"}
          </dd>

          <dt className="bg-paper px-3.5 py-2.5 font-sans text-sm font-black uppercase tracking-[.04em] text-ink">
            Total TTC
          </dt>
          <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-lg font-black text-ink">
            {totals.totalCents != null ? euros(totals.totalCents) : "—"}
          </dd>
        </FramedGrid>
      </div>

      {!shipping.ok && (
        <p className="mt-4 font-sans text-sm font-bold text-brick" role="alert">
          {shipping.message}
        </p>
      )}
      {shipping.ok &&
        !freeShippingCoupon &&
        summary.subtotalCents > 0 &&
        summary.subtotalCents < FREE_SHIPPING_MIN_CART_CENTS && (
          <p className="mt-4 font-sans text-xs text-ink/50">
            Livraison offerte dès {euros(FREE_SHIPPING_MIN_CART_CENTS)} d’achat avec un code éligible.
          </p>
        )}

      <div className="mt-8 flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkoutPending || !shipping.ok || !hasPurchasableLine}
          aria-disabled={checkoutPending || !shipping.ok || !hasPurchasableLine}
          className={`inline-flex items-center justify-center border-2 border-ink bg-ink px-8 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.05em] text-paper transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper ${FOCUS_RING_DARK}`}
        >
          {checkoutPending ? "Redirection…" : "Commander"}
        </button>
        {checkoutError && (
          <p className="font-sans text-xs font-bold text-brick" role="alert">
            {checkoutError}
          </p>
        )}
      </div>
    </div>
  );
}

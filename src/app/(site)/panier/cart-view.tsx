"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCart } from "@/components/cart/cart-context";
import { GoodieSuggestionRow, type GoodieSuggestion } from "@/components/cart/goodie-suggestion-row";
import { ShelfSpines } from "@/components/cart/shelf-spines";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { BookCover } from "@/lib/cover";
import { DELIVERY_DELAY_RANGE } from "@/lib/delivery-copy";
import { formatPrice } from "@/lib/format";
import { centsToEuros } from "@/lib/money";
import {
  FOCUS_RING_DARK,
  FOCUS_RING_HOVER_DARK,
  FOCUS_RING_HOVER_LIGHT,
  FOCUS_RING_LIGHT,
} from "@/lib/ui";
import { MAX_LINE_QTY, resolveCartSummary, type CartLineView } from "@/lib/cart-core";
import { FREE_SHIPPING_MIN_CART_CENTS, type ShippingZone } from "@/lib/shipping-core";
import { computeCartQuote } from "@/lib/cart-quote";
import type { PromoEvalResult } from "@/lib/promo-core";
import { getCartSnapshot, validatePromoCode } from "./actions";
import type { CartSnapshot } from "./snapshot";

interface CheckoutErrorBody {
  error?: string;
  // `id` relie chaque refus à SA ligne du panier (`LineRefusal`,
  // `checkout-core.ts`) — il arrivait déjà du serveur mais était jeté ici,
  // laissant le lecteur chercher quel article était en cause.
  refusals?: { id?: number; message: string }[];
}

/**
 * Ce que la zone « code promo » affiche : le verdict serveur, OU l'échec de
 * l'appel lui-même (réseau). `PromoEvalResult` reste un verdict métier — le
 * réseau n'y a pas sa place, d'où ce type d'affichage local.
 */
type PromoFeedback = PromoEvalResult | { ok: false; message: string };

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
  return formatPrice(centsToEuros(cents)) ?? "—";
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center gap-7 border-2 border-ink bg-paper px-6 py-16 text-center">
      <ShelfSpines />
      <div className="max-w-md">
        <p className="font-sans text-lg font-black italic text-ink">Votre panier est vide.</p>
        <p className="mt-2 font-sans text-sm text-muted">
          Parcourez le catalogue pour y ajouter des livres.
        </p>
      </div>
      <Button href="/catalogue">Parcourir le catalogue</Button>
    </div>
  );
}

/**
 * Ligne(s) fantôme(s) — même bloc rendu juste sous les lignes réelles
 * (panier non vide) ET sous l'état vide (`EmptyCart`, seule surface de
 * découverte des goodies qui reste depuis la suppression de « La boutique »).
 * Empilées quand `goodies.length > 1` (cas rare, cap 4 déjà posé par
 * `page.tsx`) — même format pour chaque ligne, juste répété. `goodies` déjà
 * filtré par l'appelant (jamais un article déjà au panier).
 */
function GoodieSuggestions({ goodies }: { goodies: GoodieSuggestion[] }) {
  if (goodies.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
        Souvent ajouté au panier
      </p>
      <div className="flex flex-col gap-2">
        {goodies.map((g) => (
          <GoodieSuggestionRow key={g.id} goodie={g} />
        ))}
      </div>
    </div>
  );
}

/**
 * Échec de `getCartSnapshot` AU PREMIER chargement (aucun instantané
 * précédent à afficher, cf. `CartView`) : jamais la grille sous un bandeau
 * (elle rendrait zéro ligne et un total à 0,00 € sous un texte qui promet des
 * données « périmées » — il n'y a rien à périmer, rien n'a jamais chargé).
 */
function CartUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-6 border-2 border-brick bg-paper-2 px-6 py-16 text-center"
      role="alert"
    >
      <p className="font-sans text-lg font-black italic text-ink">
        Panier momentanément indisponible
      </p>
      <p className="max-w-md font-sans text-sm text-muted">
        Impossible de vérifier votre panier pour le moment (catalogue momentanément
        indisponible). Réessayez dans un instant.
      </p>
      <Button onClick={onRetry} className="px-5 py-2.5 text-sm tracking-[.03em]">
        Réessayer
      </Button>
    </div>
  );
}

/**
 * Bandeau « revenu de Stripe sans payer » (`cancel_url` →
 * `/panier?paiement=annule`, cf. `api/checkout/route.ts`) : ton NEUTRE
 * (border-ink, jamais brick) — rien n'a échoué, l'utilisateur est juste
 * revenu, et la seule chose à dire est que le panier est intact. Avant ce
 * bandeau, ce retour était indiscernable d'une visite normale de `/panier`.
 * `useSearchParams` isolé dans son propre composant sous `<Suspense>` : le
 * hook exige une frontière au prérendu, et la page reste statique.
 */
function PaymentCancelledNotice() {
  const cancelled = useSearchParams().get("paiement") === "annule";
  if (!cancelled) return null;
  return (
    <div className="mb-4 border-2 border-ink bg-paper-2 px-4 py-3" role="status">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[.06em] text-ink">
        Paiement annulé
      </p>
      <p className="mt-2 font-sans text-sm font-bold text-ink">
        Votre panier est intact — reprenez la commande quand vous voulez.
      </p>
    </div>
  );
}

/**
 * Trame réelle (R8) pendant le tout premier chargement de `getCartSnapshot` —
 * reproduit la grille des lignes (mêmes colonnes, même nombre de lignes que
 * `state.lines`, déjà connu depuis `localStorage` avant toute relecture
 * serveur) plutôt qu'un texte ou un spinner générique.
 */
function CartSkeleton({ lineCount }: { lineCount: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <FramedGrid className="grid-cols-[72px_1fr] items-stretch sm:grid-cols-[72px_1fr_auto_auto]">
        {Array.from({ length: lineCount }, (_, i) => (
          <Fragment key={i}>
            <div className="flex items-center justify-center bg-paper p-2">
              <div className="aspect-[2/3] w-14 bg-paper-2" />
            </div>
            <div className="flex flex-col justify-center gap-2 bg-paper p-3">
              <div className="h-4 w-3/4 max-w-[220px] bg-paper-2" />
              <div className="h-4 w-24 bg-paper-2" />
            </div>
            <div className="hidden bg-paper p-3 sm:flex sm:items-center sm:justify-end">
              <div className="h-4 w-12 bg-paper-2" />
            </div>
            <div className="hidden bg-paper p-3 sm:flex sm:items-center sm:justify-end">
              <div className="h-4 w-14 bg-paper-2" />
            </div>
          </Fragment>
        ))}
      </FramedGrid>
      <span className="sr-only">Vérification du panier…</span>
    </div>
  );
}

function QuantityStepper({
  qty,
  onChange,
  disabled = false,
}: {
  qty: number;
  onChange: (next: number) => void;
  /** Ligne non `purchasable` (indisponible) — stepper entièrement désactivé, la quantité n'a plus de sens à modifier. */
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Quantité">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled || qty <= 1}
        aria-label="Retirer un exemplaire"
        className={`flex h-11 w-11 items-center justify-center border-2 border-ink font-sans font-bold text-ink hover:bg-ink hover:text-paper active:brightness-90 disabled:opacity-30 disabled:hover:bg-paper disabled:hover:text-ink disabled:active:brightness-100 ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`}
      >
        −
      </button>
      <span className="w-8 text-center font-sans text-sm font-bold text-ink" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled || qty >= MAX_LINE_QTY}
        aria-label="Ajouter un exemplaire"
        className={`flex h-11 w-11 items-center justify-center border-2 border-ink font-sans font-bold text-ink hover:bg-ink hover:text-paper active:brightness-90 disabled:opacity-30 disabled:hover:bg-paper disabled:hover:text-ink disabled:active:brightness-100 ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`}
      >
        +
      </button>
    </div>
  );
}

function CartLineRow({
  line,
  refused,
  onSetQty,
  onRemove,
}: {
  line: CartLineView;
  /** Ligne visée par un refus de checkout (`refusedIds`) — même lecture d'un coup d'œil qu'une ligne non `purchasable`, le détail du refus restant sous « Commander ». */
  refused: boolean;
  onSetQty: (qty: number) => void;
  onRemove: () => void;
}) {
  // Ligne non `purchasable` OU refusée au paiement : grisée ENTIÈREMENT (les
  // 4 cellules, pas seulement titre/quantité) — un article exclu du calcul ou
  // en cause dans un refus doit se lire d'un coup d'œil, pas seulement au
  // milieu de la ligne.
  const dim = line.purchasable && !refused ? "" : "opacity-50";
  return (
    <Fragment>
      <div className={`flex items-center justify-center bg-paper p-2 ${dim}`}>
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
      <div className={`flex flex-col justify-center gap-2 bg-paper p-3 ${dim}`}>
        <Link
          href={line.href}
          className={`font-sans text-sm font-bold text-ink hover:underline ${FOCUS_RING_LIGHT}`}
        >
          {line.title}
        </Link>
        {/* Micro-label précommande (client 2026-08-20) — même DA que les
            badges de statut du catalogue (`book-card.tsx`), signale AVANT le
            checkout qu'une ligne ira dans une commande séparée. */}
        {line.purchasable && line.isPreorder && (
          <span className="inline-flex w-fit flex-none border-b-2 border-r-2 border-ink bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
            Précommande
          </span>
        )}
        {!line.purchasable && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.04em] text-brick">
            Indisponible — exclu du calcul, retirez-le si besoin.
          </p>
        )}
        {refused && line.purchasable && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.04em] text-brick">
            En cause dans le refus de paiement — détail sous « Commander ».
          </p>
        )}
        {/* Résumé qty × prix unitaire = total — visible uniquement sous `sm`,
            où les cellules prix (colonnes 3/4) sont masquées. */}
        {line.purchasable && line.unitPriceCents != null && (
          <p className="font-sans text-sm font-bold text-ink sm:hidden">
            {line.qty} × {euros(line.unitPriceCents)} = {euros(line.lineTotalCents)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <QuantityStepper qty={line.qty} onChange={onSetQty} disabled={!line.purchasable} />
          <button
            type="button"
            onClick={onRemove}
            className={`inline-flex min-h-11 items-center px-2 -mx-2 font-sans text-xs font-bold uppercase tracking-[.04em] text-muted underline decoration-1 underline-offset-2 hover:text-ink ${FOCUS_RING_LIGHT}`}
          >
            Retirer
          </button>
        </div>
      </div>
      <div className={`hidden items-center justify-end bg-paper p-3 font-sans text-sm text-ink sm:flex ${dim}`}>
        {line.unitPriceCents != null ? euros(line.unitPriceCents) : "—"}
      </div>
      <div className={`hidden items-center justify-end bg-paper p-3 font-sans text-sm font-bold text-ink sm:flex ${dim}`}>
        {line.purchasable ? euros(line.lineTotalCents) : "—"}
      </div>
    </Fragment>
  );
}

export function CartView({ goodies = [] }: { goodies?: GoodieSuggestion[] }) {
  const { state, ready, setLineQty, removeFromCart } = useCart();
  const ids = useMemo(() => state.lines.map((l) => l.id), [state.lines]);
  const idsKey = ids.join(",");
  // Filtre « déjà au panier » : un goodie déjà ajouté ne se propose plus.
  const visibleGoodies = useMemo(
    () => goodies.filter((g) => !state.lines.some((l) => l.id === g.id)),
    [goodies, state.lines],
  );

  const [snapshot, setSnapshot] = useState<CartSnapshot>({ books: [], reducedShippingFlags: [] });
  const [snapshotReady, setSnapshotReady] = useState(false);
  /**
   * Composition (`idsKey`) pour laquelle `snapshot` a été relu — l'auto-guérison
   * ne doit comparer `missingIds` qu'à CET instantané. Sans ça, un goodie
   * ajouté sur `/panier` (tote-bag au checkout) disparaissait au clic : le
   * panier frais était confronté à l'instantané de la composition PRÉCÉDENTE,
   * l'id tout juste posé tombait dans `missingIds`, `removeFromCart` l'annulait
   * avant que `getCartSnapshot` n'ait relu.
   */
  const [snapshotIdsKey, setSnapshotIdsKey] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  // Distinct de `snapshotReady` : celui-ci retombe à `false` à CHAQUE
  // relecture (même une relecture réussie ultérieure), alors que
  // `hasLoadedOnce` ne repasse jamais à `false` — il marque qu'un instantané
  // a DÉJÀ été obtenu au moins une fois, la seule chose qui distingue un
  // premier chargement en échec (rien à montrer : pas de grille, pas de
  // total à 0,00 €) d'un échec de relecture ultérieure (les données de la
  // dernière relecture réussie restent affichées, bandeau « périmées »).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
      const requestedKey = idsKey;
      setSnapshotReady(false);
      setSnapshotError(false);
      try {
        const next = await getCartSnapshot(ids);
        if (cancelled) return;
        setSnapshot(next);
        setSnapshotIdsKey(requestedKey);
        setSnapshotReady(true);
        setHasLoadedOnce(true);
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
    // ni le prix ni la disponibilité d'une ligne. `retryNonce` redéclenche la
    // MÊME relecture sur demande (bouton Réessayer de l'état d'échec initial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idsKey, retryNonce]);

  const retrySnapshot = useCallback(() => setRetryNonce((n) => n + 1), []);

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
  // l'utilisateur (cf. `CartLineRow`). Deux gardes INDISPENSABLES :
  // `snapshotReady` — avant la première résolution, `snapshot.books` vaut `[]`
  // et chaque id semblerait introuvable ; `snapshotIdsKey === idsKey` — un
  // id ajouté depuis `/panier` (goodie) n'est pas introuvable, l'instantané
  // n'a juste pas encore été relu pour cette composition.
  useEffect(() => {
    if (!snapshotReady) return;
    if (snapshotIdsKey !== idsKey) return;
    for (const id of summary.missingIds) removeFromCart(id);
  }, [snapshotReady, snapshotIdsKey, idsKey, summary.missingIds, removeFromCart]);

  const [zone, setZone] = useState<ShippingZone>("FR");
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<PromoFeedback | null>(null);
  const [promoPending, startPromoTransition] = useTransition();

  function applyPromoCode() {
    const code = promoInput.trim();
    if (!code) return;
    startPromoTransition(async () => {
      // Symétrie avec `load()` et `handleCheckout` : sans ce try/catch, un
      // échec réseau de la server action laissait le clic sans AUCUN retour —
      // le seul appel serveur du fichier qui pouvait encore échouer muet.
      try {
        setPromoResult(await validatePromoCode(code, summary.subtotalCents));
      } catch {
        setPromoResult({
          ok: false,
          message: "Vérification du code impossible pour le moment, réessayez.",
        });
      }
    });
  }

  // Le repli réseau S'AFFICHE mais ne pilote jamais le devis : un code
  // peut-être valide ne doit pas être décompté comme refusé — le devis reste
  // simplement sans promo le temps d'un nouvel essai.
  const promoEval: PromoEvalResult | null =
    promoResult == null ? null : promoResult.ok || "reason" in promoResult ? promoResult : null;

  // Scission commande/précommande (client 2026-08-20) : sous-totaux par
  // partie dérivés des lignes `purchasable` (reflet exact de ce que
  // `/api/checkout` scindera à l'encaissement, cf. `checkout-core.ts:
  // splitValidatedLines`) — même filtre `purchasable` que `summary.subtotalCents`,
  // jamais une ligne indisponible comptée dans un total.
  const { normalSubtotalCents, preorderSubtotalCents, hasNormalLines, hasPreorderLines } = useMemo(() => {
    const purchasable = summary.lines.filter((l) => l.purchasable);
    const normal = purchasable.filter((l) => !l.isPreorder);
    const preorder = purchasable.filter((l) => l.isPreorder);
    return {
      normalSubtotalCents: normal.reduce((sum, l) => sum + l.lineTotalCents, 0),
      preorderSubtotalCents: preorder.reduce((sum, l) => sum + l.lineTotalCents, 0),
      hasNormalLines: normal.length > 0,
      hasPreorderLines: preorder.length > 0,
    };
  }, [summary.lines]);

  const { shipping, totals, freeShippingCoupon, split } = computeCartQuote({
    normalSubtotalCents,
    preorderSubtotalCents,
    hasNormalLines,
    hasPreorderLines,
    zone,
    manifestOnly: summary.manifestOnly,
    promoEval,
  });

  const [checkoutPending, startCheckoutTransition] = useTransition();
  /** Un item par refus (`checkout-core.ts` en rédige un par article en défaut) — jamais fusionnés en un seul paragraphe (cf. `<ul>` ci-dessous) ; l'`id`, quand il existe, marque la ligne en cause dans la grille. */
  const [checkoutError, setCheckoutError] = useState<{ id?: number; message: string }[] | null>(
    null,
  );
  const refusedIds = useMemo(
    () => new Set((checkoutError ?? []).flatMap((e) => (e.id != null ? [e.id] : []))),
    [checkoutError],
  );
  const checkoutAlertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function focusCheckoutAlert() {
      if (!checkoutError || checkoutError.length === 0) return;
      checkoutAlertRef.current?.focus();
    }
    focusCheckoutAlert();
  }, [checkoutError]);
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
            ? data.refusals.map((r) => ({ id: r.id, message: r.message }))
            : [{ message: data.error ?? "Le paiement est momentanément indisponible, réessayez." }],
        );
      } catch {
        setCheckoutError([{ message: "Le paiement est momentanément indisponible, réessayez." }]);
      }
    });
  }

  // Vrai blocage (panier invalide / port impossible) — distinct de l'état
  // `checkoutPending` (redirection Stripe en cours), qui ne doit jamais se
  // confondre visuellement avec lui (R7).
  const checkoutBlocked = !shipping.ok || !hasPurchasableLine;

  if (!ready) {
    return <p className="py-16 text-center font-sans text-sm text-muted">Chargement du panier…</p>;
  }
  if (state.lines.length === 0) {
    return (
      <>
        <EmptyCart />
        <GoodieSuggestions goodies={visibleGoodies} />
      </>
    );
  }
  // Échec AU PREMIER chargement (aucun instantané précédent) : état dédié,
  // jamais la grille sous le bandeau habituel — cf. `CartUnavailable`.
  if (snapshotError && !hasLoadedOnce) {
    return <CartUnavailable onRetry={retrySnapshot} />;
  }
  // Premier chargement encore en cours (pas d'échec, pas encore de succès) :
  // trame réelle plutôt qu'un texte ou rien du tout (R8).
  if (!snapshotReady && !hasLoadedOnce) {
    return <CartSkeleton lineCount={state.lines.length} />;
  }

  return (
    // `starting:opacity-0` (@starting-style) : le swap squelette → grille
    // réelle se fond au lieu de claquer — même famille de retour que
    // l'`opacity-70` des relectures, appliquée au premier montage du contenu.
    // Navigateur sans @starting-style : apparition immédiate, comme avant.
    <div
      className={`transition-opacity motion-reduce:transition-none starting:opacity-0 ${snapshotReady ? "" : "opacity-70"}`}
    >
      <Suspense fallback={null}>
        <PaymentCancelledNotice />
      </Suspense>
      {snapshotError && (
        <div className="mb-4 border-2 border-brick bg-paper-2 px-4 py-3" role="alert">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[.06em] text-brick">
            Vérification impossible
          </p>
          <p className="mt-2 font-sans text-sm font-bold text-ink">
            Impossible de vérifier votre panier pour le moment (catalogue
            momentanément indisponible). Les prix et disponibilités affichés
            peuvent être périmés — réessayez dans un instant.
          </p>
        </div>
      )}
      <FramedGrid className="grid-cols-[72px_1fr] items-stretch sm:grid-cols-[72px_1fr_auto_auto]">
        {summary.lines.map((line) => (
          <CartLineRow
            key={line.id}
            line={line}
            refused={refusedIds.has(line.id)}
            // Toute mutation d'une ligne périme le refus affiché (l'utilisateur
            // est justement en train de corriger) : on repart d'un état neutre
            // plutôt que de laisser un marquage qui ne correspond peut-être
            // plus à rien jusqu'au prochain essai.
            onSetQty={(qty) => {
              setCheckoutError(null);
              setLineQty(line.id, qty);
            }}
            onRemove={() => {
              setCheckoutError(null);
              removeFromCart(line.id);
            }}
          />
        ))}
      </FramedGrid>

      <GoodieSuggestions goodies={visibleGoodies} />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-1">
            <span className="font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
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
            {/* Délai annoncé au moment où l'acheteur·se hésite (demande
                client 2026-08-26) — source unique `delivery-copy.ts`. */}
            <span className="font-sans text-xs text-muted">
              Livraison {DELIVERY_DELAY_RANGE} — précommandes expédiées à parution.
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="cart-promo"
                className="font-sans text-xs font-bold uppercase tracking-[.06em] text-muted"
              >
                Code promo
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="cart-promo"
                  type="text"
                  autoComplete="off"
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
            </div>
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
            {shipping.ok &&
              !freeShippingCoupon &&
              summary.subtotalCents > 0 &&
              summary.subtotalCents < FREE_SHIPPING_MIN_CART_CENTS && (
                <p className="font-sans text-xs text-muted">
                  Livraison offerte dès {euros(FREE_SHIPPING_MIN_CART_CENTS)} d’achat avec un code éligible.
                </p>
              )}
          </div>
        </div>

        <FramedGrid as="dl" className="h-fit grid-cols-2">
          <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
            Sous-total
          </dt>
          <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
            {euros(totals.subtotalCents)}
          </dd>

          {totals.discountCents > 0 && (
            <>
              <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
                Remise
              </dt>
              <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
                −{euros(totals.discountCents)}
              </dd>
            </>
          )}

          <dt className="bg-paper px-3.5 py-2.5 font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
            Port ({zone}){split && shipping.ok ? " — 2 envois" : ""}
          </dt>
          <dd className="bg-paper px-3.5 py-2.5 text-right font-sans text-sm font-bold text-ink">
            {shipping.ok ? euros(totals.shippingCents ?? 0) : "—"}
          </dd>

          {/* Panier mixte (client 2026-08-20) : le total de port ci-dessus
              cumule DEUX envois au même tarif — annoncé ici en toutes
              lettres pour que le montant ne semble jamais doublé par erreur. */}
          {split && shipping.ok && (
            <div className="col-span-2 bg-paper px-3.5 pb-2.5">
              <p className="font-sans text-xs text-muted">
                2 envois — frais d’expédition par envoi ({euros(shipping.costCents)} chacun) : un
                colis pour les articles parus, un colis pour la précommande.
              </p>
            </div>
          )}

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

      <div className="mt-8 flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkoutPending || checkoutBlocked}
          aria-busy={checkoutPending}
          className={`inline-flex items-center justify-center gap-2.5 border-2 border-ink bg-ink px-8 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.05em] text-paper transition-colors motion-reduce:transition-none ${FOCUS_RING_DARK} ${
            checkoutPending
              ? "cursor-wait"
              : checkoutBlocked
                ? "cursor-not-allowed opacity-40"
                : `hover:bg-paper hover:text-ink active:brightness-90 ${FOCUS_RING_HOVER_LIGHT}`
          }`}
        >
          {checkoutPending && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 animate-pulse bg-pop-yellow motion-reduce:animate-none"
            />
          )}
          {checkoutPending ? "Redirection vers le paiement…" : "Commander"}
        </button>
        {checkoutError && checkoutError.length > 0 && (
          <div
            ref={checkoutAlertRef}
            tabIndex={-1}
            className={`w-full border-2 border-brick bg-paper-2 px-4 py-3 sm:w-auto ${FOCUS_RING_LIGHT}`}
            role="alert"
          >
            <p className="font-sans text-xs font-extrabold uppercase tracking-[.06em] text-brick">
              Paiement impossible
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {checkoutError.map((refusal, i) => (
                <li key={i} className="flex gap-2 font-sans text-sm font-bold text-ink">
                  <span aria-hidden="true" className="text-brick">
                    ▸
                  </span>
                  <span>{refusal.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

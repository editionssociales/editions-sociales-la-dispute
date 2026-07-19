# src/lib

## Purpose

Unified product model and data layer: reads the Payload/Postgres catalogue (two fonds + boutique-only articles), exposes pure navigation and formatting, and hosts the native commerce engine (cart, checkout, order export).

## Ownership

- **Owns**: `RawBook` port + adapters (pg/memory), catalogue core (`catalogue-core`), catalogue facade + browse navigation, HTML sanitization, env layer, sellability rule, commerce engine (cart/checkout/order/export).
- **Does NOT own**: page rendering, UI components (except `cover.tsx`: domain rule, not layout), Payload collections, I/O orchestration in routes.

## Local Contracts

- Network modules: only `donations` (Stripe Search API, cached per-request via `cache()`) and `brevo` (write-side, never cached, degrades cleanly — `{ ok: false }` when `BREVO_API_KEY` absent) touch the network.
- Purity: rest is pure; exceptions are back-office/commerce (server-only, Payload via Local API, no `cache()`): `catalogue-pg`, `site-content`, `commerce-source`, `order-source`, `highlight`, `stripe`.
- Type ownership: `SafeHtml` (only `sanitizeCms`), RawBook/CatalogueSource (ports), CommerceInfo (port-owned).
- `env.ts`: `DATABASE_URL` + `PAYLOAD_SECRET` REQUIRED at boot (Payload is the only source); the rest optional but shape-checked.
- URL codec: `catalogueHref`/`readFilters` (browse.ts) = unique encoder/decoder for filter URLs.

## Work Guidance

- New catalogue data: extend `RawBook` and the pg mapper (`catalogue-pg-map`); never call `getPayload` outside the named modules above.
- `catalogue.ts` is the sole app entry point; `browse.ts` wraps pure logic.
- New rule: pure core in dedicated module, Payload I/O behind the named seams (`commerce-source` for the purchase path — books facts + promo codes, its read policy locked by `commerce-source.test.ts` — `order-source` for the Order lifecycle); never widen `CommerceInfo` (port-owned), never inline `getPayload` in routes/actions.
- Stock/parution semantics live ONCE in `sellability.ts` (`assessSellability`) — consumed by `catalogue-core` (status) and `checkout-core` (refusals).
- The cart quote (discount/shipping/total from a subtotal + a resolved promo verdict) lives ONCE in `cart-quote.ts` (`computeCartQuote`, composing `promo-core`/`shipping-core`/`cart-core`) — consumed by both the client display (`panier/cart-view.tsx`) and the server re-validation (`api/checkout/route.ts`); never re-inline that composition at a call site.

# src/lib

## Purpose

Unified product model and data layer: reads the Payload/Postgres catalogue (two fonds + boutique-only articles), exposes pure navigation and formatting, and hosts the native commerce engine (cart, quote, promo, checkout, order export).

## Ownership

- **Owns**: `RawBook` port + adapters (pg/memory), catalogue core (`catalogue-core`), catalogue facade + browse navigation, HTML sanitization, env layer, sellability rule, commerce engine (cart/quote/checkout/promo/order/export).
- **Does NOT own**: page rendering, UI components (except `cover.tsx`: domain rule, not layout), Payload collections, I/O orchestration in routes.

## Local Contracts

- Network modules: only `donations` (Stripe Search API, cached per-request via `cache()`) and `brevo` (write-side, never cached, degrades cleanly — `{ ok: false }` when `BREVO_API_KEY` absent) touch the network.
- Purity: rest is pure; exceptions are back-office/commerce (server-only, Payload via Local API, no `cache()`): `catalogue-pg`, `site-content`, `commerce-source`, `order-source`, `highlight`, `stripe`.
- Type ownership: `SafeHtml` (only `sanitizeCms`), RawBook/CatalogueSource (ports), CommerceInfo (port-owned).
- `env.ts`: `DATABASE_URL` + `PAYLOAD_SECRET` REQUIRED at boot (Payload is the only source); the rest optional but shape-checked.
- URL codec: `catalogueHref`/`readFilters` (browse.ts) = unique encoder/decoder for filter URLs.
- `rencontres-data.ts`: PROVISIONAL editorial data (hand-copied from ladispute.fr) pending the Payload rencontres collection — delete it then; never extend it by hand.

## Work Guidance

- New catalogue data: extend `RawBook` and the pg mapper (`catalogue-pg-map`); never call `getPayload` outside the named modules above.
- `catalogue.ts` is the sole app entry point; `browse.ts` wraps pure logic.
- **Single-source-of-truth rule**: domain rules live once in their module and are never re-inlined at call sites. `money.ts` owns the cents/euros conversion (`eurosToCents`/`centsToEuros`); `sellability.ts` owns stock/parution semantics (`assessSellability`); `nouveaute-book.ts` owns the Book→carousel mapping (`toNouveauteBooks`); `shipping-core.ts` owns the manifest-cart rule (`isManifestOnly`); `promo-core.ts` owns promo semantics (`isPromoExpired`, `normalizePromoCode`); `cart-quote.ts` owns the full quote composition (`computeCartQuote` + `ShippingMethodLabel` for Orders — derived from actual shipping result, never coupon validity alone); `catalogue-core.ts:getFacets` owns facet order (libelles by count desc for both mosaics, authors alphabetical).
- **Commerce seams**: Payload I/O for the purchase path enters only via `commerce-source` (books facts + promo codes, read policy locked by `commerce-source.test.ts`) and `order-source` (Order lifecycle). Never widen `CommerceInfo` (port-owned), never inline `getPayload` in routes/actions.

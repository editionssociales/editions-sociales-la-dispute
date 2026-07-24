# src/lib

## Purpose

Unified product model and data layer: reads the Payload/Postgres catalogue (two fonds + boutique-only articles), exposes pure navigation and formatting, and hosts the native commerce engine (cart, quote, promo, checkout, order export).

## Ownership

- **Owns**: `RawBook` port + adapters (pg/memory), catalogue core (`catalogue-core`), catalogue facade + browse navigation, HTML sanitization, env layer, sellability rule, commerce engine (cart/quote/checkout/promo/order/export).
- **Does NOT own**: page rendering, UI components (except `cover.tsx`: domain rule, not layout), Payload collections, I/O orchestration in routes.

## Local Contracts

- Network modules: only `donations` (Stripe Search API, cached per-request via `cache()`) and `brevo` (write-side, never cached, degrades cleanly — `{ ok: false }` when `BREVO_API_KEY` absent) touch the network.
- Purity: rest is pure; exceptions are back-office/commerce (server-only, Payload via Local API, no `cache()`): `catalogue-pg`, `site-content`, `commerce-source`, `order-source`, `highlight`, `rencontres`, `stripe`.
- Type ownership: `SafeHtml` (only `sanitizeCms`), RawBook/CatalogueSource (ports), CommerceInfo (port-owned).
- `env.ts`: `DATABASE_URL` + `PAYLOAD_SECRET` REQUIRED at boot (Payload is the only source); the rest optional but shape-checked.
- URL codec: `catalogueHref`/`readFilters` (browse.ts) = unique encoder/decoder for filter URLs.
- `rencontres.ts`: reads the Payload `rencontres` collection (agenda, `/rencontres`) — `splitRencontres` (sort/split around today) is the pure, tested half; `getRencontres` is the I/O half, degrades to an empty agenda on failure like `highlight.ts`. Event days and "today" go through `isoDayParis` (format.ts) — Payload's `dayOnly` picker stores local midnight (22h/23h UTC the day before from France), so slicing the UTC ISO shifts the day; `parisMidnightUtc` (format.ts) is the inverse (day → instant), the boundary used by the admin filter chips.

## Work Guidance

- New catalogue data: extend `RawBook` and the pg mapper (`catalogue-pg-map`); never call `getPayload` outside the named modules above.
- `catalogue.ts` is the sole app entry point; `browse.ts` wraps pure logic.
- **Single-source-of-truth rule**: domain rules live once in their module and are never re-inlined at call sites. `money.ts` owns the cents/euros conversion (`eurosToCents`/`centsToEuros`); `sellability.ts` owns stock/parution semantics (`assessSellability`); `nouveaute-book.ts` owns the Book→carousel mapping (`toNouveauteBooks`); `shipping-core.ts` owns the manifest-cart rule (`isManifestOnly`); `promo-core.ts` owns promo semantics (`isPromoExpired`, `normalizePromoCode`); `video.ts` owns the YouTube URL → embed rule (`youTubeEmbedUrl`, null on anything unrecognized — never render a broken iframe); `site-content-core.ts` owns the contrepartie « ou » rule (a line starting with the word "ou" is an alternative to the previous one — parsed once for defaults AND back-office input, the renderer only reads `alternative`); `cart-quote.ts` owns the full quote composition (`computeCartQuote` + `ShippingMethodLabel` for Orders — derived from actual shipping result, never coupon validity alone); `catalogue-core.ts:getFacets` owns facet order (alphabetical from `tally`) — the simple libellé view renders it as-is; the tiered « cases variables » view (`libelle-mosaic`) sorts its own LOCAL COPY by count desc (client arbitration, supersedes the earlier « mosaïque désordonnée » decision) — never mutate the facets array, never sort anywhere else.
- **Commerce seams**: Payload I/O for the purchase path enters only via `commerce-source` (books facts + promo codes, read policy locked by `commerce-source.test.ts`) and `order-source` (Order lifecycle). Never widen `CommerceInfo` (port-owned), never inline `getPayload` in routes/actions.

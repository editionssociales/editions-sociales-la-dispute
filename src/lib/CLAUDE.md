# src/lib

## Purpose

Unified product model and headless data layer: merges WordPress + WooCommerce/Payload sources, exposes pure navigation and formatting, and hosts the native commerce engine (cart, checkout, order export; controlled by `COMMERCE_NATIVE` flag).

## Ownership

- **Owns**: `RawBook` port + adapters (http/pg/memory), fusion core (`catalogue-core`), catalogue facade + browse navigation, HTML sanitization, env layer and flag, commerce engine (cart/checkout/order/export).
- **Does NOT own**: page rendering, UI components (except `cover.tsx`: domain rule, not layout), Payload collections, I/O orchestration in routes.

## Local Contracts

- Network modules: only `catalogue-http`, `boutique`, `donations`, `brevo` touch the network; first three cached per-request via `cache()`; `brevo` (write-side) never cached, degrades cleanly (`{ ok: false }` when `BREVO_API_KEY` absent).
- Purity: rest is pure; exceptions are back-office/commerce (server-only, Payload via Local API, no `cache()`): `catalogue-pg`, `site-content`, `cart-source`, `checkout-source`, `order-source`, `highlight`, `stripe`.
- Type ownership: `SafeHtml` (only `sanitizeCms`), RawBook/CatalogueSource (ports), CommerceInfo (port-owned).
- Degradation: graceful (partial/empty) except `catalogue-integrity:assertCatalogueComplete()` (±5% via KNOWN_CATALOGUE_SIZE, DEVOPS.md §5).
- URL codec: `catalogueHref`/`readFilters` (browse.ts) = unique encoder/decoder for filter URLs.

## Work Guidance

- New catalogue data: extend `RawBook` and mappers (`catalogue-wp-map` for WP dialects, `catalogue-pg-map` for Payload); never fetch directly outside `catalogue-http`/`boutique`.
- `catalogue.ts` is the sole app entry point; `browse.ts` wraps pure logic.
- New rule: pure core in dedicated module, Payload I/O in dedicated source (`cart-source`, `checkout-source`, `order-source`) to avoid widening `CommerceInfo` and breaking existing fixtures.

# Implementation prompt — from vitrine prototype to full refoundation

*Kickoff prompt for future work sessions on this repo. Client has approved the full
"Option B" rebuild (see `../devis/DEVIS-MULTI-OPTIONS.md` section 5 for the commercial
framing — this is the engineering-facing version). Intentionally high-level: figure out
the concrete implementation details phase by phase, don't try to design it all upfront.*

> **Detailed plan established 2026-07-09** — see `plan/README.md`: seven phase plans
> (file-level for July, milestone-level for September+), decided stack, consolidated
> calendar, cross-phase interface contracts, and the devis commitment checklist.

## Where we start

A working read-only prototype is live (`CLAUDE.md`, `COHABITATION.md`): it reads the two
catalogue WordPress sites and the WooCommerce store live via REST/Store API through a
ports-and-adapters layer (`CatalogueSource`), merges everything into a unified `Book`
model, and renders a fast, tested front end. It never writes to WordPress. Payments,
legal pages, and production hardening are not done yet.

## Where we're going

A single site that owns its own data — no WordPress left in scope. One admin
back-office for the team (catalogue + shop, non-technical, role-based). One unified
Stripe checkout for books and donations. Newsletter and monitoring on the new stack.
The three in-scope WordPress installs (two catalogues + shop) are decommissioned after
a safe, reversible migration; GEME stays untouched, out of scope.

## The shape of the work, roughly in order

1. **Donations, end to end.** This is the deadline-critical piece (client's fundraising
   campaign launch) and doesn't depend on anything else below — do it first,
   independently, so it can ship even if later phases slip.
2. **Production hardening of the current read-only site.** Legal pages, redirects,
   SEO basics, decoupling each WordPress from its public domain so the domain can point
   at the new site without losing the data source (`COHABITATION.md` phases 2–3 cover
   this — follow that plan, it's already thought through).
3. **Give the catalogue its own database.** Stand up a proper store for books/authors/
   collections/editions, migrate the ~300 existing records into it, bring the cover
   images along. Then swap the `CatalogueSource` adapter from "reads WordPress" to
   "reads the new database" — the point of the ports-and-adapters split is that this
   swap shouldn't require touching the front end. Build the admin UI for the team to
   manage entries once the data lives here. Once the team is comfortable and a
   rollback window has passed, retire the two catalogue WordPress installs.
4. **Bring commerce in-house.** Cart + unified Stripe checkout covering both books and
   donations, VAT, shipping rules (carry over the existing weight/zone configuration
   rather than redesigning it), order confirmation emails, an accounting export, basic
   promo codes. Migrate the shop's products so each book has exactly one record instead
   of a separate WordPress entry and a separate WooCommerce product. Export the full
   historical order/customer data before touching anything, and only decommission the
   shop WordPress once that archive is confirmed safe.
5. **Newsletter and contact.** Move the confirmed subscriber list to the new email
   tool, add a signup form and a single contact form (there are three redundant form
   tools in the legacy stack — the new site only needs one).
6. **Operational baseline.** Error tracking, uptime alerting, cookieless analytics —
   enough that problems surface on their own instead of via an annoyed reader.
7. **Final cutover.** Once every piece above has its own rollback-safe migration done
   and verified, retire the last WordPress in scope and close out the dual-hosting
   setup this project has been running under out of technical necessity.

The client may want this split into two rounds (donations + catalogue first, commerce
later, once their team is less busy) — the sequencing above already supports that
without rework, since commerce is deliberately last.

## Principles to keep across every phase

- **Never touch a WordPress destructively before its replacement is verified.** Every
  cutover keeps the old source running and reversible until data has been checked and
  exported — this project has zero tolerance for silent data loss (catalogue entries,
  orders, subscribers).
- **The ports-and-adapters boundary is what makes incremental migration safe.** Prefer
  swapping an adapter behind the existing port over rewriting call sites — that's the
  whole reason the prototype was built this way.
- **Ship visibly, in small steps**, the same way the prototype got built — working
  demos over big-bang releases, so the client can react as things land instead of
  being surprised at the end.
- Don't build anything the client didn't ask for (no customer accounts, no
  multi-language, no GEME integration) — the scope is deliberately disciplined; resist
  scope creep even where "it would be easy while we're in there."

Start wherever the current priorities point (check in on the donation deadline first),
and propose a concrete plan for whichever phase you're picking up before writing code.

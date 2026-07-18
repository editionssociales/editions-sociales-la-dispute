# Éditions sociales · La Dispute — site unifié

**Site unique** réunissant les deux maisons d'édition **Les Éditions sociales**
et **La Dispute** ainsi que leur **boutique commune** — il remplace les trois
WordPress historiques, désormais éteints (coupure OVH actée).

Stack : **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
**Tailwind CSS v4** · **Payload 3** (back-office `/admin`) · **Postgres**
(Neon, schéma `payload`) · **Stripe** (dons + commandes) · **Vercel**.

## Principe : une seule source

Tout — catalogue des deux fonds, articles boutique-seuls, contenus éditables,
commandes — vit dans Postgres via Payload. Le front lit la collection `books`
derrière un port (`CatalogueSource`, adaptateurs pg/mémoire) et l'expose sous
un modèle de domaine propre (`Book`, statut d'achat résolu par
`src/lib/sellability.ts`). Le commerce natif (panier `localStorage`, checkout
Stripe re-validé serveur, export CSV) est toujours actif.

## Architecture

```
src/
  lib/         Modèle de domaine + couche data (port pg/mémoire, cœurs purs,
               seams Payload commerce-source / order-source) — cf. src/lib/CLAUDE.md
  components/  Présentation brutaliste (grille encadrée, cartes, panier client)
  app/
    (site)/    Front public : catalogue, fiches, boutique, panier, souscription…
    (payload)/ Back-office /admin + API Payload (générés)
    api/       checkout, webhook Stripe, health
  payload/     Collections (Books, Orders, PromoCodes…), globals, dashboard admin
  migrations/  Schéma Postgres versionné (jamais de push en prod)
```

## Développement

```bash
cp .env.example .env   # DATABASE_URL + PAYLOAD_SECRET requis (Neon)
pnpm install
pnpm dev               # http://localhost:3000 — /admin pour le back-office
```

Vérification : `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm knip`.
Le build (`pnpm build`) est hermétique — Postgres uniquement.

## Documents

- `CLAUDE.md` / `src/*/CLAUDE.md` — cartes de scope (toujours vraies).
- `DEVOPS.md` (comptes, secrets, CI/CD) · `OPERATIONS.md` (runbook) ·
  `docs/BACK-OFFICE.md` (guide de l'équipe éditoriale).
- `plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md` — documents d'époque de la
  refonte (historiques).

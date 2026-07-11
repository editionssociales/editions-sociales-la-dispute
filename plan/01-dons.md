Toutes les vérifications sont faites : `revalidateTag(tag, "max")` = stale-while-revalidate confirmé dans `node_modules/next/dist/docs/.../revalidateTag.md` (le contenu périmé est servi, re-fetch en arrière-plan, et l'invalidation n'agit qu'à la visite suivante) ; docs.stripe.com/search confirme « ne pas utiliser la recherche pour les flux read-after-write, données consultables en < 1 min » et 20 rps ; la recherche **charges** supporte `refunded` et `metadata`, et docs.stripe.com/payments/payment-intents confirme que « le PaymentIntent copie ses métadonnées dans le paiement (Charge) » ; `souscription/page.tsx` : bouton mécène `type="button"` explicite confirmé, `button.tsx` rend `<button type="button" {...rest}>` (le `type="submit"` via rest écrase bien) ; `campaign.ts:18-28` : `messages`/`durationDays` obligatoires et tuiles stats fabriquées lignes 78-83 confirmés ; `date -j` : 10/07/2026 = vendredi, 11-12 = week-end, 18/07 = samedi (butée Q2 « ven 18/07 » était aussi fausse — corrigée en ven 17/07) ; devis §10 : mentions légales demandées au client « avant le vendredi 10 » (C90). Voici la version finale.

# Plan d'implémentation — Phase 1 : Dons de bout en bout (deadline 15 août)

*Architecte : session du 2026-07-09, révision finale post-relecture adversariale. Périmètre vendu : devis §3.3 + §5 ligne « Paiement des dons » (1 j / 200 €). Références code vérifiées sur l'état actuel du repo `/Users/yourihamon/marina_es/site`. Docs Next 16 lues dans `node_modules/next/dist/docs/01-app/03-api-reference/` (route handlers, `revalidateTag` — signature **2 arguments**, sémantique stale-while-revalidate vérifiée, cf. plus bas). Docs Stripe vérifiées : la Search API est explicitement déconseillée pour le read-after-write (indexation < 1 min en régime normal, 20 rps max) et les métadonnées d'un PaymentIntent sont copiées sur la Charge à sa création — deux faits qui fondent l'architecture de la jauge ci-dessous.*

---

## Objectif et livrable

**Livrable** : la page `/souscription` existante encaisse des dons réels via **Stripe Checkout** (paliers 2026 + montant libre), avec reçu par email, page de remerciement, jauge de progression vivante, testé de bout en bout en mode test puis passé en réel — **en production bien avant le 15 août**, sans dépendre d'aucune autre phase (ni Postgres/Neon, ni Payload, ni commerce natif).

**Décisions d'architecture** (chacune justifiée par la recon) :

| Décision | Choix | Pourquoi |
|---|---|---|
| Stripe Checkout Sessions **vs** Payment Links | **Checkout Sessions**, créées par une **server action** (formulaires HTML, zéro JS client ajouté) | Montant libre impossible proprement en Payment Links multiples ; montants dérivés **côté serveur** depuis la table des paliers (le client n'envoie qu'un `tierId`) ; collecte d'adresse conditionnelle par palier ; `locale: "fr"` ; metadata uniforme pour la jauge. Pas de clé publishable nécessaire (redirect vers `session.url`, pas de Stripe.js) |
| Dons récurrents | **NON — hors périmètre vendu** (vérifié devis §3.3 et §5 : « Stripe Checkout, reçus, mise en réel », aucune mention d'abonnement) | `mode: "payment"` uniquement. Si demandé → chiffrage à part |
| Source de vérité de la jauge | **Stripe lui-même** : **Search API sur les *charges*** (`metadata['campaign']` + `status:'succeeded'` + `refunded:'false'` — les metadata du PaymentIntent sont copiées sur la Charge, vérifié docs Stripe), somme `amount_captured − amount_refunded`, agrégée via `fetch` taggé + **`revalidate: 60`**, invalidation par tag depuis le webhook en simple accélérateur | **Zéro stockage** = zéro brique anticipée (contrainte d'indépendance respectée à la lettre) ; webhook trivialement **idempotent** (il n'écrit rien) ; dégradation propre si Stripe indisponible (jauge masquée, page intacte) ; le passage par les **charges** (et non les PaymentIntents) rend la jauge **nette des remboursements** — ce qui exclut mécaniquement le don de test remboursé d'E11 |
| Fraîcheur de la jauge — **promesse honnête** | La Search API indexe en **~1 min** (documenté par Stripe, à ne pas contourner) et `revalidateTag(tag, "max")` sert le périmé puis re-fetch en arrière-plan (doc Next 16 vérifiée) : une invalidation immédiate post-paiement re-cacherait l'ancien total. Donc : **fenêtre de fetch à 60 s** (et non 300 s), webhook = accélérateur best-effort, et promesse contractuelle « le don apparaît en ≤ 3 min avec du trafic » — jamais « temps réel » | Coût dérisoire : ≤ ~10 requêtes Search par refresh (pagination par 100), une fois par minute de trafic, très en-dessous des 20 rps de la Search API. La page reste **statique + ISR** (fenêtre effective 60 s), pas d'îlot client, pas de `force-dynamic` (contrat `src/app/CLAUDE.md`) |
| Reçus | **Reçus natifs Stripe** (Dashboard → Settings → Emails → « Successful payments »), branding FR | 0 code, couvre « reçu par email » du devis. ⚠️ Un reçu Stripe est un **reçu de paiement**, pas un **reçu fiscal** (cf. Questions ouvertes) ; Brevo transactionnel = phase Communication, pas ici |
| Échecs / abandons | Gérés par Checkout (page hébergée) : `cancel_url` → retour `#paliers` ; sessions expirées jamais comptées (seules les charges `succeeded` alimentent la jauge) ; erreur de création de session → page statique `/souscription/erreur` | La page `/souscription` ne devient jamais dynamique, ne plante jamais |
| Pages légales | **Condition d'entrée du passage en réel (E11)** — encaisser de l'argent réel sans mentions légales (LCEN), identité de l'encaisseur et politique de remboursement est une non-conformité, et la review d'activation Stripe examine le site public | Normalement livrées par la phase « Mise en production » ; **filet dans CETTE phase** (E10b) si elle glisse : page légale minimale sur le gabarit C90 déjà promis au client (devis §10, attendu « avant le vendredi 10 ») — 1–2 h, pas de nouveau périmètre |
| HelloAsso | **Branche de repli documentée** (cf. Questions ouvertes Q1), pas la branche par défaut | Ne vaut que si la structure est une association ET veut des reçus fiscaux ; Stripe marche quel que soit le statut, et le compte servira de toute façon au commerce natif de septembre (payouts unifiés) |

**Correctif d'acquis intégré (RECON R2 §2.4)** : le compte Stripe du client est un compte **mode test jamais activé en live** (passerelle Woo Stripe `enabled=no`, prod réelle = Paybox). « Payouts unifiés » reste l'objectif, mais l'**activation live du compte (KYC Stripe) est LE chemin critique** de cette phase — à lancer immédiatement, indépendamment de tout code. La review Stripe demande l'URL du site et la description d'activité : le site public doit porter une identité d'éditeur lisible (cf. pages légales ci-dessus) — les deux chemins critiques se rejoignent.

---

## Preconditions et provisioning (comptes, cles, acces — qui fait quoi, client vs Youri)

| # | Quoi | Qui | Quand | Détail |
|---|---|---|---|---|
| P1 | **Lancer l'activation live du compte Stripe existant** (celui d'`acct_1SQlxX…` vu dans la config Woo) : infos légales de la structure, IBAN, pièce d'identité du représentant, **URL du site public + description d'activité** (fournir l'URL prod-beta ; la review examine le site → des mentions légales visibles accélèrent le KYC, cf. P9/E10b) | **Client** (Youri guide) | **Dès le 10/07** — KYC = plusieurs jours possibles | Dashboard Stripe → « Activate payments ». Vérifiable via Dashboard : `charges_enabled` / « payments enabled ». Nécessaire même si les dons partaient chez HelloAsso (le commerce de septembre est vendu en Stripe) |
| P2 | Inviter Youri sur le compte Stripe (rôle **Developer** minimum, Admin idéalement) | Client | 10/07 | Dashboard → Settings → Team. Youri récupère lui-même `sk_test_…` puis, au jour J, `sk_live_…` — jamais transmises par email |
| P3 | Clés **test** dans l'environnement | Youri | dès P2 (repli : sandbox Stripe perso de Youri pour développer le 10/07, swap des clés ensuite — le code est identique) | `site/.env.local` : `STRIPE_SECRET_KEY=sk_test_…` + `STRIPE_WEBHOOK_SECRET=whsec_…` (celui du `stripe listen`). `site/.env` : remplacer le placeholder 7 caractères. Les deux fichiers sont bien gitignorés (`.env*` sauf `.env.example` — vérifié) |
| P4 | Clés dans **Vercel** (projet `editions-sociales-la-dispute`, team `solidz`) | Youri | avec la 1re mise en ligne (E9) | ⚠️ **Piège R4** : utiliser le `VERCEL_TOKEN` **du shell** (`yourimerad`/`solidz`), PAS celui de `site/.env` (team `ldes` vide, accès refusé). `vercel env add STRIPE_SECRET_KEY production` + `STRIPE_WEBHOOK_SECRET production` (valeurs **test** d'abord : en cible `production` jusqu'à E11 **et** en cible `preview` — 2 min qui débloquent la recette commerce de septembre, demandé par la phase 4 ; la clé **live**, elle, reste `production` uniquement, posée au jour J — jamais en preview/development) |
| P5 | **Stripe CLI** en local | Youri | 10/07 | `brew install stripe/stripe-cli/stripe` ; `stripe login` sur le compte de dev |
| P6 | **Paliers & contreparties 2026** + objectif (€) de la campagne | **Client** | demandés depuis le devis (§10.5, « dès le jeudi 9 ») ; butée **ven 17/07** | Défaut si retard : reprise des 8 paliers 15→300 € + 2 mécènes actuellement codés dans la page (provisoires assumés) |
| P7 | Décision **Stripe vs HelloAsso** (statut juridique de la structure fusionnée) | Client | **au plus tard démo du 15/07** | Défaut recommandé : Stripe (cf. Q1) |
| P8 | Merger la **PR #5** (CI sur `main`) et rattraper le commit de retard du checkout local (`git pull`) | Youri | avant d'ouvrir la PR dons | Pour que la PR dons passe sous CI. R4 : la CI n'existe que dans `worktree-devops-foundation` |
| P9 | **Mentions légales & infos éditeur** (gabarit fourni par Youri, préparation Floée — pièce **C90** du devis §10, attendue « avant le vendredi 10 ») : identité de l'éditeur/encaisseur, hébergeur, contact, politique de remboursement des dons | **Client** (gabarit : Youri) | 10/07 (devis) ; **bloquant pour E11** | Publication normalement portée par la phase « Mise en production » ; filet E10b ici si elle glisse. Sert aussi le KYC P1 (Stripe regarde le site) |

Aucun compte nouveau à créer : Stripe existe (client), Vercel/GitHub existent. Coût récurrent ajouté : **0 €/mois** (frais Stripe à la transaction ~1,5 % + 0,25 €, conformes devis §8).

---

## Etapes (ordonnees, numerotees ; pour chaque etape : quoi, fichiers/ressources touches, comment verifier)

Travail sur branche `feat/dons-stripe` → PR → merge `main` (= déploiement prod-beta automatique, pipeline git→Vercel vérifié vivant par R4). Convention : **c'est la première surface serveur d'écriture du repo** (zéro `route.ts`, zéro `"use server"` aujourd'hui — R1 §4) ; les gabarits ci-dessous suivent les docs embarquées Next 16 (`route.md`, `revalidateTag.md` : signature `revalidateTag(tag, profile)` à 2 arguments, la forme à 1 argument est dépréciée ; **`profile: "max"` = stale-while-revalidate : le périmé est servi, le re-fetch part en arrière-plan, et l'invalidation n'agit qu'à la prochaine visite** ; `params`/`searchParams` sont des **Promise** ; `headers()` est async).

### E1 — Socle Stripe dans le repo

- **Quoi** : `pnpm add stripe` (SDK officiel, version épinglée par le lockfile ; l'`apiVersion` reste celle épinglée par le SDK — ne pas la forcer à la main). Créer `src/lib/stripe.ts` (server-only) :
  - `getStripe()` : instanciation paresseuse de `new Stripe(process.env.STRIPE_SECRET_KEY)` ; jette une erreur claire si la clé est absente/placeholder.
  - `donationsEnabled()` : `true` ssi `STRIPE_SECRET_KEY` commence par `sk_test_` ou `sk_live_`. **C'est l'interrupteur de la phase** : clé absente ⇒ la page rend les boutons inertes actuels (iso-rendu avec aujourd'hui) ⇒ déploiement sans risque avant provisioning, et rollback = retirer la clé + redeploy.
- **Fichiers** : `package.json`, `pnpm-lock.yaml`, `src/lib/stripe.ts`, `.env.example` (ajouter `STRIPE_SECRET_KEY=`, `STRIPE_WEBHOOK_SECRET=`, commentées).
- **Vérifier** : `pnpm typecheck` ; `pnpm build` passe (aucune route ne consomme encore Stripe).

### E2 — Module pur `donation-tiers` + tests

- **Quoi** : `src/lib/donation-tiers.ts`, **pur, sans I/O** (convention `src/lib/CLAUDE.md`) :
  - `CAMPAIGN_KEY = "souscription-2026"` (valeur de `metadata.campaign` — contrat de la jauge, ne plus jamais changer après le 1er don).
  - `DONATION_TIERS: { id: string; amount: number; title: string; physical: boolean }[]` — reprend les 8 `CONTREPARTIES` (15→300 €, `physical: true`) + 2 `MECENES` (500/1000 €, `physical: false` — contact direct, cf. Q4) actuellement en dur dans `souscription/page.tsx:83-181`.
  - `FREE_AMOUNT = { min: 5, max: 10_000 }` et `parseDonation(input: { tierId?: string; amount?: string }): { amountMinor: number; tier?: Tier } | { error: string }` — validation/clamp **côté serveur**, montants en centimes.
  - `CAMPAIGN_2026_GOAL` (provisoire : 50 000 €) et `CAMPAIGN_2026_PALIERS` (provisoire : 50/75/100 k€ comme 2024, remplacés en E10).
  - `deriveCampaign2026(totals: { collected: number; contributors: number })` → **`{ gauge, collected, contributors, percentOfGoal }` — et rien d'autre**. ⚠️ **Ne pas réutiliser `deriveCampaign` « tel quel » côté rendu** : `CampaignFacts` (`src/lib/campaign.ts:18-28`, vérifié) exige `messages` et `durationDays`, qui n'existent pas pour une campagne en cours, et `deriveCampaign` fabrique 4 tuiles `stats` dont « messages de soutien » et « collectés en N jours » (`campaign.ts:78-83`) — collées telles quelles, la section 2026 afficherait des chiffres faux. Implémentation : appeler `deriveCampaign` en interne avec `messages: 0, durationDays: 0` et ne ré-exposer **que** `gauge`/`collected`/`contributors`/`percentOfGoal` (le type de retour interdit statiquement l'accès à `stats`). Le bloc 2024 continue de consommer `CAMPAIGN_2024.stats`, inchangé.
- **Fichiers** : `src/lib/donation-tiers.ts`, `src/lib/donation-tiers.test.ts` (ids uniques, montants > 0, parse : tierId valide / inconnu / montant libre borné / virgule décimale / négatif / NaN ; `deriveCampaign2026` n'expose pas `stats` et calcule les markers de jauge).
- **Vérifier** : `pnpm test` (nouvelle suite verte, node env, dans le périmètre vitest `src/**/*.test.ts` existant).

### E3 — Server action `createDonationCheckout`

- **Quoi** : `src/app/souscription/actions.ts` avec `"use server"` :
  ```ts
  export async function createDonationCheckout(formData: FormData) {
    const parsed = parseDonation({ tierId: …, amount: … });
    if ("error" in parsed) redirect("/souscription/erreur");
    const origin = /* SITE_URL env ?? `https://${(await headers()).get("host")}` */;
    let url: string | null = null;
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        submit_type: "donate",
        locale: "fr",
        line_items: [{ quantity: 1, price_data: { currency: "eur",
          unit_amount: parsed.amountMinor,
          product_data: { name: `Souscription 2026 — ${parsed.tier?.title ?? "Montant libre"}` } } }],
        metadata: { kind: "donation", campaign: CAMPAIGN_KEY, tier: parsed.tier?.id ?? "libre" },
        payment_intent_data: {
          description: `Souscription 2026 — ${parsed.tier?.title ?? "Montant libre"}`,
          metadata: { kind: "donation", campaign: CAMPAIGN_KEY, tier: parsed.tier?.id ?? "libre" },
        },
        ...(parsed.tier?.physical && { shipping_address_collection: { allowed_countries: ["FR", "BE", "CH"] } }),
        customer_creation: "if_required",
        success_url: `${origin}/souscription/merci?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/souscription#paliers`,
      });
      url = session.url;
    } catch { redirect("/souscription/erreur"); }
    redirect(url!); // redirect() jette NEXT_REDIRECT : à garder HORS du try/catch Stripe
  }
  ```
  Points durs : **metadata dupliquée sur `payment_intent_data`** (les metadata de session ne se propagent PAS au PaymentIntent ; le PI, lui, **copie ses metadata sur la Charge** à sa création — vérifié docs Stripe — et c'est la charge que la jauge recherche) ; **`kind: "donation"` posé dès maintenant** — c'est le discriminateur exigé par la phase commerce (phase 4, `kind: "order"`) pour partager le même webhook, coût nul aujourd'hui, et la jauge continue de filtrer sur `campaign` uniquement (règle inchangée) ; montant **jamais** lu tel quel du client pour un palier ; `submit_type: "donate"` (bouton « Faire un don » côté Stripe).
- **Fichiers** : `src/app/souscription/actions.ts`.
- **Vérifier** : `pnpm dev` + clé test ; POST manuel du formulaire (E5) redirige vers `checkout.stripe.com` avec le bon montant/libellé en français.

### E4 — Pages retour

- **Quoi** :
  - `src/app/souscription/merci/page.tsx` — server component **dynamique** (lit `searchParams` — Promise en Next 16). Si `session_id` présent : `stripe.checkout.sessions.retrieve(id)` ; affiche montant, palier, et si `payment_status !== "paid"` un état « confirmation en cours ». Si absent/invalide/erreur Stripe : remerciement générique (jamais d'erreur brute). `export const metadata = { robots: { index: false } }`. Style maison (Container/Kicker/Button existants), lien retour catalogue + souscription.
  - `src/app/souscription/erreur/page.tsx` — **statique**, « Le paiement n'a pas pu démarrer » + bouton retour `#paliers` + mailto. `robots: noindex`.
- **Fichiers** : les 2 pages ci-dessus.
- **Vérifier** : `/souscription/merci?session_id=<id de test>` affiche le montant ; `/souscription/merci` sans param ne plante pas ; `pnpm build` classe `merci` en dynamique et `erreur` en statique.

### E5 — Câblage de la page `/souscription`

- **Quoi** : dans `src/app/souscription/page.tsx`, si `donationsEnabled()` :
  - Cartes contreparties (`:482-487`) : envelopper le `<Button>` dans `<form action={createDonationCheckout}>` + `<input type="hidden" name="tierId" value={tier.id}/>`, et `<Button type="submit">` — le primitive `Button` (vérifié `src/components/button.tsx:63-67`) rend `<button type="button" {...rest}>`, donc `type="submit"` passé via `...rest` écrase le défaut **sans toucher au composant ni aux chaînes de classes** (iso-rendu).
  - Cartes mécènes (`:514-519`) : même enveloppe `<form>` + hidden `tierId`, **ET passer explicitement le bouton en `type="submit"`** — ⚠️ ce bouton est un `<button type="button">` **nu avec `type` codé en dur** (vérifié) : enveloppé dans un form sans changer son `type`, il ne soumettrait jamais et les paliers 500/1000 € resteraient inertes en silence. Changer `type="button"` → `type="submit"` sur place (classes conservées à l'identique), ou le remplacer par le primitive `Button` avec `type="submit"` si le rendu reste iso. Scénario de recette dédié : **R12**.
  - **Bloc montant libre** dans la section CTA finale (`:667-673`) : petit `<form>` avec `<input name="amount" type="number" min={5} step={1} inputMode="numeric">` + Button « Contribuer » (classes Tailwind littérales, style maison).
  - Si `!donationsEnabled()` : rendu **strictement identique à aujourd'hui** (boutons inertes).
  - Les données `CONTREPARTIES`/`MECENES` de la page prennent un champ `tierId` référencé vers `DONATION_TIERS` (ou sont dérivées de lui — au choix de l'implémenteur, sans casser le rendu).
- **Fichiers** : `src/app/souscription/page.tsx`.
- **Vérifier** : diff DOM nul hors ajout des `<form>`/bloc montant libre/`type="submit"` mécène ; parcours complet en local avec carte `4242 4242 4242 4242` → `merci`, **y compris depuis une carte mécène**.

### E6 — Webhook Stripe

- **Quoi** : `src/app/api/stripe/webhook/route.ts` — **premier route handler du repo** (POST = dynamique par nature, hors ISR) :
  ```ts
  export async function POST(req: Request) {
    const body = await req.text(); // corps BRUT obligatoire pour la signature
    const sig = req.headers.get("stripe-signature");
    let event: Stripe.Event;
    try {
      event = await getStripe().webhooks.constructEventAsync(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch { /* Sentry.captureMessage — cf. Observabilité ci-dessous */ return new Response("invalid signature", { status: 400 }); }
    if (event.type === "checkout.session.completed"
      || event.type === "checkout.session.async_payment_succeeded"
      || event.type === "charge.refunded") {
      revalidateTag("donations", "max"); // Next 16 : 2 arguments ; "max" = stale-while-revalidate
    }
    return Response.json({ received: true });
  }
  ```
  **Idempotence** : le handler n'écrit rien (pas de base) — rejouer un événement n'a aucun effet secondaire ; aucun store de déduplication nécessaire. Le jour où le webhook écrira (email Brevo, ligne en base — phases ultérieures), ajouter la déduplication par `event.id` À CE MOMENT-LÀ.
  **Rôle honnête du webhook** : c'est un **accélérateur best-effort, pas le mécanisme de fraîcheur**. Deux faits vérifiés l'imposent : (1) la Search API Stripe indexe en ~1 min et est documentée « à ne pas utiliser en read-after-write » ; (2) `revalidateTag(…, "max")` sert le périmé et re-fetch en arrière-plan à la visite suivante — un re-fetch parti avant l'indexation re-cacherait l'ancien total. La fraîcheur est donc garantie par la **fenêtre de 60 s du fetch** (E7) : total visible en ~1–2 min, ≤ 3 min pire cas avec trafic. Le webhook raccourcit simplement le cas sans trafic et sert de point d'extension (Brevo, base) pour les phases suivantes. `charge.refunded` est écouté pour que la jauge décompte vite un remboursement (dont le don de test d'E11).
  **Observabilité (contrat de la phase 6 — bloquant pour la recette dons)** : `Sentry.captureMessage` (ou `captureException`) sur **toute signature invalide** et **toute erreur gérée** du handler — un webhook qui répond 400 proprement est invisible pour `onRequestError`, donc sans capture explicite une panne de livraison webhook serait **silencieuse pendant la fermeture d'août**. Option recommandée par la phase 6 : exposer dans `/api/health` l'âge du dernier événement Stripe reçu, à brancher sur le moniteur Better Stack.
- **Fichiers** : `src/app/api/stripe/webhook/route.ts`.
- **Vérifier (local)** : `stripe listen --forward-to localhost:3000/api/stripe/webhook` (copie le `whsec_…` dans `.env.local`) ; `stripe trigger checkout.session.completed` → 200 ; requête avec signature bidon → 400 **et** événement Sentry capturé (cf. Observabilité).

### E7 — Jauge 2026 vivante

- **Quoi** : `src/lib/donations.ts` (server-only, symétrique de `boutique.ts` : fetch + `next: { revalidate, tags }` — style maison R1 §1) :
  - `getDonationTotals()` : `GET https://api.stripe.com/v1/charges/search?query=metadata['campaign']:'souscription-2026' AND status:'succeeded' AND refunded:'false'&limit=100` (header `Authorization: Bearer $STRIPE_SECRET_KEY`), pagination par `next_page`, chaque fetch avec **`next: { revalidate: 60, tags: ["donations"] }`**. Fetch **opt-in** au cache (Next 16 : fetch = no-store par défaut, l'option `revalidate` opte explicitement). Pourquoi les **charges** et pas les PaymentIntents : le champ `refunded` est requêtable et `amount_refunded` est sur l'objet → jauge **nette des remboursements** (partiels compris), sans expand ni 2e appel ; les metadata y sont copiées depuis le PI (E3).
  - `sumDonations(charges)` **pure et testée** : `collected = Σ (amount_captured − amount_refunded) / 100`, `contributors = count` (les charges entièrement remboursées sont déjà exclues par `refunded:'false'` ; les partielles comptent pour leur net).
  - `getCampaign2026()` : compose `sumDonations` + `deriveCampaign2026` (E2) ; **`null` sur toute erreur** (clé absente, Stripe down) → la page dégrade sans planter.
  - Dans `souscription/page.tsx` : si `getCampaign2026()` non-null **et** `collected > 0`, afficher une section jauge 2026 — qui consomme **uniquement `campaign.gauge` + `collected`/`contributors`** (réutilise `<Gauge>` et `<CountUp>` existants ; **PAS le bloc de 4 tuiles `stats` du gabarit 2024**, cf. E2) ; sinon rien (le bloc 2024 rétrospectif reste tel quel, avec ses `stats`). Effet cache : la fenêtre ISR effective de `/souscription` passe de 3600 s à **60 s** (le plus petit `revalidate` d'un fetch gagne) + invalidation par tag via E6. Coût : ≤ ~10 requêtes Search par refresh, une fois par minute au plus — négligeable vs 20 rps. Documenter la fenêtre **et la latence d'indexation Search ~1 min** dans `src/app/CLAUDE.md` (contrat de fraîcheur).
- **Fichiers** : `src/lib/donations.ts`, `src/lib/donations.test.ts` (sur `sumDonations` — dont cas remboursement partiel — + parsing de la réponse search), `src/app/souscription/page.tsx`, `src/app/CLAUDE.md`.
- **Vérifier** : don test → recharger `/souscription` à ~1 min puis ~2–3 min : **le nouveau total apparaît en ≤ 3 min** (chaîne : indexation Search ~1 min + fenêtre 60 s + un aller stale-while-revalidate) et égale le total Dashboard Stripe (Payments filtrés `metadata:campaign=souscription-2026`). Rembourser le don test → le total redescend dans la même fenêtre. **Ne pas resserrer ce critère : c'est la physique documentée de la Search API.**

### E8 — Gate de vérification complet + PR

- **Quoi** : `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Le `build` est le vrai gate : première coexistence server action + route handler + page dynamique dans ce repo Next 16.2.9. Vérifier dans la sortie du build : `/souscription` = ISR, `/souscription/merci` = dynamique, `/api/stripe/webhook` = dynamique, `/souscription/erreur` = statique. PR `feat/dons-stripe` (CI de la PR #5 mergée dessus), puis merge `main`.
- **Vérifier** : CI verte ; build Vercel `READY`.

### E9 — E2E sur Vercel (mode test)

- **Quoi** : après merge (prod-beta = `https://editions-sociales-la-dispute.vercel.app`, avec clés **test** en env `production` — assumé : la beta n'est pas encore le domaine du client) :
  1. Env vars posées (P4), **redeploy** (un changement d'env n'est pris qu'au déploiement suivant).
  2. Dashboard Stripe (mode test) → Developers → Webhooks → add endpoint `https://editions-sociales-la-dispute.vercel.app/api/stripe/webhook`, événements `checkout.session.completed` + `checkout.session.async_payment_succeeded` + `charge.refunded` → récupérer le `whsec_…` de CET endpoint → `vercel env` → redeploy.
  3. Parcours complets sur l'URL de prod-beta (⚠️ R4 : les previews sont derrière SSO Vercel — les tests client se font sur l'URL prod-beta, publique) : palier fixe, **palier mécène**, montant libre, carte 3DS `4000 0025 0000 3155`, refus `4000 0000 0000 9995`, abandon (back) → retour `#paliers`.
  4. Onglet Webhooks du Dashboard : livraisons 200 ; jauge mise à jour en ≤ 3 min ; remboursement d'un don test → jauge décomptée.
- **Vérifier** : matrice de recette (section Recette) verte en mode test, y compris par le client (cartes de test fournies par mail).

### E10 — Contenu 2026 (à réception, P6)

- **Quoi** : remplacer les paliers/contreparties provisoires : `DONATION_TIERS` + textes `CONTREPARTIES`/`MECENES` de la page + `CAMPAIGN_2026_GOAL`/`CAMPAIGN_2026_PALIERS` (objectif + paliers de jauge réels) ; ajuster la prose de la section (« Les contreparties de notre campagne 2024, de retour… » → texte 2026). Petite PR dédiée.
- **Vérifier** : relecture client sur prod-beta ; `pnpm test` (les tests de `donation-tiers` valident la nouvelle table).

### E10b — Filet légal (SEULEMENT si la phase « Mise en production » n'a pas livré les pages légales à J−2 d'E11)

- **Quoi** : page statique minimale `src/app/mentions-legales/page.tsx` sur le **gabarit C90** (devis §10, pièce attendue du client depuis le 10/07 — P9) : identité de l'éditeur et **de l'encaisseur des dons**, directeur de publication, hébergeur (Vercel), contact, **politique de remboursement des dons**, données personnelles (Stripe). Lien depuis le footer (`site-footer.tsx`). Style maison, `robots` indexable. 1–2 h — c'est un **filet d'avance sur la ligne « Mise en production » du devis**, pas du périmètre nouveau ; la phase Mise en production reprendra/complétera la page (sitemap, 301, etc.).
- **Fichiers** : `src/app/mentions-legales/page.tsx`, `src/components/site-footer.tsx`.
- **Vérifier** : page accessible depuis le footer sur prod-beta ; contenu validé par le client (texte C90).

### E11 — Passage en réel (jour J, checklist exécutable)

**Conditions d'entrée** (toutes) : P1 terminé (**compte live activé**, « payments enabled » dans le Dashboard) ; E9 vert ; E10 fait (ou provisoire assumé par le client) ; **pages légales publiées** — mentions légales + identité de l'encaisseur + politique de remboursement accessibles depuis le footer (phase Mise en production, sinon filet E10b) ; **cadre de propriété acté** — transfert Vercel/GitHub vers les comptes client planifié OU accord écrit du client pour l'intérim sur `solidz`/`yourimerad` (cf. Dépendances, C70/C71).

1. Dashboard **live** : branding (logo, couleurs, nom public « Les Éditions sociales — La Dispute »), **statement descriptor** ≤ 22 chars (ex. `EDITIONS SOCIALES`), Settings → Emails → activer les reçus « Successful payments » (⚠️ Stripe n'envoie **pas** de reçus en mode test — c'est ici que le reçu se vérifie pour la première fois), IBAN de payout confirmé, Radar actif (défaut).
2. Créer l'endpoint webhook **live** : même URL, mêmes 3 événements → nouveau `whsec_live_…`. **Le jour du flip DNS (mar 21/07)** : créer le **second endpoint** sur le domaine final (`https://editionssociales.fr/api/stripe/webhook`, mêmes événements) **simultanément** à l'activation du « Redirect to Primary » sur l'URL `*.vercel.app` — redirect à ne **PAS** activer avant : les livraisons webhook sur l'URL vercel.app recevraient des 307/308 que Stripe ne suit pas. Garder les **deux** endpoints actifs ensuite ; point inscrit à la **checklist du jour du flip** (phase Mise en production).
3. `vercel env rm/add STRIPE_SECRET_KEY production` (→ `sk_live_…`) + `STRIPE_WEBHOOK_SECRET production` (→ live) — **token shell**, cible `production` uniquement → redeploy.
4. **Don réel de 1 €** (montant libre, carte personnelle de Youri) : page Checkout en français → `merci` avec montant → **reçu email reçu** → webhook 200 → don visible dans le Dashboard live → jauge +1 € en ≤ 3 min.
5. **Rembourser le 1 € depuis le Dashboard** : l'événement `charge.refunded` invalide le tag, la charge sort du filtre `refunded:'false'` → **la jauge redescend à 0 et la section 2026 (conditionnée à `collected > 0`) disparaît** en ≤ 3 min — vérifier. Le don de test ne pollue donc ni la jauge publique d'avant-lancement (cohérent avec Q6), ni les exports (filtre Dashboard « refunded » à l'export compta).
6. Verrou : plus personne ne touche `CAMPAIGN_KEY` ni les endpoints webhook. Rollback à tout moment : re-swap des env vars vers `sk_test_`/retrait de la clé (+ redeploy) → boutons redeviennent test/inertes, page intacte.

### E11bis — Brief de lancement (semaine du 28–31/07, avant la fermeture d'août du client)

- **Quoi** : figer **par écrit** avec le client, avant son départ en août (engagement **C51** du devis : « message et moment du lancement figés ensemble avant le départ ») : le **texte d'annonce**, le **canal de diffusion**, la **date/heure exacte** du lancement du 15/08, et **qui appuie sur quel bouton le jour J**. Joindre ce brief à la **checklist campagne du ~10–14/08 de la phase 6**.
- **Vérifier** : brief écrit validé par le client (mail ou document partagé) au plus tard le **31/07** ; référencé dans la checklist campagne de la phase 6. Effort ~0 : une séance courte pendant la recette.

### E12 — Lancement de campagne (15/08) et surveillance

- **Quoi** : le lancement est un événement de com du client, pas un déploiement — le système tourne en réel depuis E11, et le message/moment/rôles du jour J sont figés par le brief E11bis. Youri disponible le 15/08 (engagement devis) : surveiller Dashboard Stripe (paiements, disputes), livraisons webhook (retries Stripe automatiques en cas de 5xx), jauge. Si la phase Ops (Better Stack/Sentry) est livrée d'ici là, moniteur HTTP sur `/souscription` + alerte Sentry sur le route handler ; sinon surveillance manuelle Dashboard — suffisant pour un flux de dons.
- **Vérifier** : premiers dons réels visibles jauge + Dashboard le jour même.

---

## Donnees et migration (si applicable : source exacte, script, verification, rollback)

Pas de migration : **aucune donnée existante à déplacer, aucun WordPress touché** (principe absolu n°1 respecté par construction — cette phase n'écrit que chez Stripe).

- **Source de vérité des dons 2026** : le compte Stripe du client (charges `succeeded` non remboursées portant `metadata.campaign = "souscription-2026"`, copiée depuis le PaymentIntent). Le repo ne stocke **rien**. Conséquences assumées :
  - *Export / compta* : Dashboard Stripe → Payments → filtre metadata → Export CSV (montant, date, email, adresse de livraison pour les contreparties physiques, statut de remboursement). C'est le « back-office dons » remis au client — à montrer à la démo du 15/07.
  - *Remboursements* : **décomptés de la jauge** (filtre `refunded:'false'` + `amount_refunded` soustrait pour les partiels) — mieux que le comportement Ulule, et c'est ce qui neutralise le don de test d'E11 après remboursement.
  - *Chiffres 2024* : `CAMPAIGN_2024` (`src/lib/campaign.ts:91-104`) reste figé en dur — c'est une rétrospective, pas une donnée vivante.
- **Rollback** : retirer/re-swapper `STRIPE_SECRET_KEY` en env Vercel + redeploy → la page revient à l'état boutons inertes (E1/E5) ; les dons déjà encaissés restent chez Stripe, intouchés. Aucune destruction possible par cette phase.

---

## Recette et criteres d'acceptation (testables, du point de vue du client)

Mode test (E9, avant le 15/07) puis re-déroulé en réel avec le don de 1 € (E11).

| # | Scénario | Critère d'acceptation |
|---|---|---|
| R1 | Sur `/souscription`, cliquer « Contribuer » sur le palier 50 € | Page de paiement **Stripe en français**, montant 50,00 €, libellé « Souscription 2026 — L'essentiel », bouton type « don » |
| R2 | Payer avec `4242 4242 4242 4242` (test) | Redirection vers `/souscription/merci` affichant le montant ; paiement visible dans le Dashboard |
| R3 | Palier avec contrepartie physique | Checkout demande **l'adresse postale** (FR/BE/CH) ; l'adresse figure dans le paiement côté Dashboard/export |
| R4 | Montant libre : saisir 20 € | Checkout à 20,00 € ; saisir 2 € → refusé (min 5 €) sans casser la page |
| R5 | Jauge | Après R2, le total affiché sur `/souscription` s'incrémente en **≤ 3 minutes** (recharger la page ; latence normale : indexation Stripe ~1 min + fenêtre de cache 60 s) et égale le total Dashboard. **Pendant la démo : faire le don en début de séquence et montrer la jauge 2–3 min plus tard** |
| R6 | Reçu email | **En réel uniquement** (E11.4) : email de reçu Stripe reçu après le don de 1 € (les reçus ne partent pas en mode test — expliqué au client) |
| R7 | Abandon | « Retour » depuis Checkout → revient sur `/souscription#paliers` ; rien n'est compté |
| R8 | Carte refusée (`4000 0000 0000 9995`) | Message d'erreur sur la page Stripe, pas de don compté, l'utilisateur peut réessayer |
| R9 | 3DS (`4000 0025 0000 3155`) | Challenge 3DS puis succès normal |
| R10 | Robustesse | POST forgé sur `/api/stripe/webhook` sans signature → 400 ; `/souscription/merci` sans `session_id` → page générique propre ; Stripe indisponible → `/souscription` s'affiche (jauge masquée) |
| R11 | Non-régression | Le reste du site inchangé (catalogue, fiches, accueil) ; `pnpm typecheck · lint · test · build` verts ; 55 tests existants + nouveaux verts |
| R12 | **Palier mécène 500 €** : cliquer « Contribuer » sur la carte inversée | Checkout à 500,00 €, **sans** collecte d'adresse postale ; redirection `merci` ; visible au Dashboard avec `tier` mécène |
| R13 | Remboursement | Rembourser un don test depuis le Dashboard → la jauge décompte le montant en ≤ 3 min ; à 0 don net, la section jauge 2026 disparaît |
| R14 | Conformité (réel) | Avant tout encaissement réel : mentions légales accessibles depuis le footer, identité de l'encaisseur et politique de remboursement lisibles |

**Acceptation finale client** : « je fais un don de 1 € depuis mon téléphone sur la page publique, je reçois un reçu par email, je vois la jauge bouger en quelques minutes, et je retrouve le don dans mon Dashboard Stripe » — avant le 24/07.

---

## Risques et parades

| Risque | Probabilité/Impact | Parade |
|---|---|---|
| **KYC Stripe live pas prêt à temps** (compte jamais activé — correction R2 : « ils sont déjà sur Stripe » était faux, Paybox est la passerelle vivante) | Moyenne / **bloquant go-live** | P1 lancé le 10/07 (marge > 4 semaines) ; **site public présentable pour la review** (URL fournie + mentions légales P9/E10b — Stripe examine le site) ; suivi hebdo du statut ; si blocage persistant au 01/08 : compte Stripe **neuf** au nom de la structure (KYC frais, parfois plus rapide qu'un déblocage) ou bascule HelloAsso si association (Q1) — le code page/jauge est réutilisable, seule l'action de checkout change |
| **Dons réels encaissés sans pages légales** (LCEN, identité encaisseur, remboursement) | Moyenne si la phase Mise en production glisse / **non-conformité au moment où le site devient marchand** | Condition d'entrée dure d'E11 + filet E10b (gabarit C90, 1–2 h) ; pièce client P9 relancée dès le 10/07 |
| Latence de la jauge : Search API ~1 min d'indexation (documenté « pas de read-after-write ») + sémantique stale-while-revalidate de `revalidateTag(…, "max")` | Certaine / cosmétique **si promesse calibrée** | Conception alignée sur la physique : fenêtre de fetch 60 s, webhook = simple accélérateur, critère de recette « ≤ 3 min » (R5/R13), formulation client « la jauge se met à jour en quelques minutes ». **Ne jamais re-promettre du temps réel** ; si un jour il le faut : stockage local des dons via le webhook (phase base de données, point d'extension prévu) |
| Fenêtre Payload/Next sans rapport ici, mais **première surface serveur** (action + route handler) sur Next 16.2.9 | Faible / build cassé | `pnpm build` dès E3/E6 (pas à la fin) ; gabarits tirés des docs embarquées (`route.md`, `revalidateTag.md` 2-args, `headers()` async, `searchParams` Promise) |
| **Tokens `site/.env` ne pilotent pas l'infra live** (R4 : GitHub PAT = compte client vide, VERCEL_TOKEN = team `ldes` vide) | Certaine si oubli / perte de temps + faux 404 | Toute commande `vercel`/`gh` de cette phase utilise les **tokens du shell** ; note ajoutée en tête de PR |
| **Clé live Stripe du client hébergée sur l'infra de Youri** (Vercel `solidz`, repo `yourimerad`) dès E11, alors que le devis §9 promet le transfert « au plus tard à la mise en production » (C70/C71) et que les coquilles client (team `ldes`, compte GitHub `editionssociales`) sont vides | Certaine / confiance + contractuel | Traité en condition d'entrée E11 : accord écrit d'intérim OU transfert planifié dans la fenêtre E11→15/08 (cf. Dépendances) ; au transfert, re-provisionner les env vars Stripe côté client et re-vérifier l'endpoint webhook |
| **Fraude / card-testing** sur le montant libre | Faible / frais de disputes | Min 5 €, plafond 10 000 €, montants serveur-side, Radar actif, `submit_type: donate` ; surveiller les premiers jours ; si vague de tests de cartes : monter le min ou couper le montant libre (1 ligne) |
| Previews Vercel derrière SSO (R4) → le client ne peut pas tester une preview | Certaine / friction démo | Tous les tests client sur l'URL **prod-beta publique** (en mode test Stripe) ; le point SSO previews est traité par la phase « mise en production » avant la démo du 15/07 |
| Paliers 2026 livrés tard | Moyenne / cosmétique | E10 découplé : la mécanique part en test avec les paliers 2024 provisoires ; swap de contenu = 0,1 j |
| Événements webhook manqués (deploy au mauvais moment, 5xx) | Faible / jauge en retard de ≤ 60 s | Stripe retente automatiquement (jusqu'à 3 j) ; de toute façon la jauge se recalcule **entièrement** depuis Stripe toutes les 60 s — le webhook n'est qu'un accélérateur, jamais la source de vérité |
| Confusion reçu de paiement / **reçu fiscal** | Moyenne / attente client déçue | Clarifié par écrit avant le 15/07 (cf. Q8) : Stripe envoie un reçu de paiement ; un reçu fiscal suppose une structure éligible (branche HelloAsso ou hors périmètre) |

---

## Dependances et interfaces avec les autres phases

- **Indépendance totale confirmée** : aucune dépendance à Neon/Postgres, Payload, Blob, Brevo. La jauge lit Stripe directement — décision prise **précisément** pour ne pas anticiper la base : si tout le reste glisse, les dons vivent quand même. Coût de ce choix : la latence d'affichage de quelques minutes (physique de la Search API, assumée et documentée) ; le jour où une base existe, on peut y matérialiser les dons via le webhook existant (dédup par `event.id` à ajouter alors) et rendre la jauge instantanée — point d'extension prévu, rien à défaire.
- **Phase 2 (mise en production / DNS)** : `success_url`/`cancel_url` dérivées du host de la requête (`headers()`) → survivent au cutover `editionssociales.fr` → Vercel sans code ; au cutover — **daté : le jour du flip DNS, mar 21/07** — **ajouter un endpoint webhook** pour le domaine final `editionssociales.fr` (garder les deux), **simultanément** à l'activation du « Redirect to Primary » sur l'URL `*.vercel.app`, qui ne doit **pas** être activé avant (les livraisons webhook sur vercel.app recevraient des 307/308 que Stripe ne suit pas) — à inscrire à la checklist du jour du flip (cf. E11.2). **Pages légales : la dépendance est désormais datée** — elles sont condition d'entrée d'E11 (~21–24/07) ; si la phase Mise en production ne les a pas livrées à J−2, le filet E10b de cette phase publie la version minimale (gabarit C90), que la phase Mise en production complète ensuite (sitemap, 301, robots). Le point « SSO previews avant démo 15/07 » appartient aussi à cette phase.
- **Propriété / transfert (devis §9, C70/C71)** : dès E11, la **clé secrète live du client** vit dans le projet Vercel de la team `solidz` et le code dans le repo `yourimerad` — or le passage des dons en réel est, de fait, une mise en production, et R4 montre que les coquilles de transfert (team Vercel `ldes`, compte GitHub `editionssociales`) existent mais sont **vides**. À traiter explicitement, deux voies au choix du client (à poser à la démo du 15/07) : **(a) transfert dans la fenêtre E11→15/08** — transfert du projet Vercel vers la team client (emporte env vars et domaines ; re-vérifier l'URL `*.vercel.app` et l'endpoint webhook après transfert, re-poser les secrets par acquit) + transfert du repo GitHub au compte `editionssociales` (ou ajout owner) ; **(b) accord écrit d'hébergement intérimaire** sur `solidz`/`yourimerad` jusqu'à la recette, transfert à la recette complète (avant la fermeture d'août). Recommandation : **(b)** — ne pas déménager l'infra entre le go-live réel et le lancement de campagne ; l'intérim écrit protège les deux parties, et Youri est déjà invité (jamais propriétaire) sur le compte Stripe, qui est LA ressource qui encaisse.
- **Phase commerce natif (septembre, B phasé)** : réutilise `src/lib/stripe.ts` et étend `src/app/api/stripe/webhook/route.ts` (switch sur `event.type`, discrimination par `metadata.kind` : `donation` posé dès E3, `order` pour les commandes) ; **même compte Stripe** = payouts unifiés (la promesse du devis) ; `metadata.campaign` sépare dons et ventes dans les exports et dans la jauge (la recherche filtre sur la metadata, les ventes de septembre n'y entreront jamais). La bascule PSP Paybox→Stripe de la boutique est un sujet de CETTE phase-là, pas des dons.
- **Phase newsletter/Brevo** : hook futur = le webhook (envoi transactionnel custom, dédup par `event.id` à ajouter alors) ; zéro rework du checkout.
- **Phase back-office (démo 15/07)** : le back-office des dons **est** le Dashboard Stripe (paiements, exports CSV, remboursements) — à inclure dans la démo ; les dons en mode test y seront visibles, bon support de démonstration.
- **Ops (Sentry/Better Stack)** : le **contrat minimal est intégré dès E6** (captures Sentry sur signature invalide et erreurs gérées du webhook — bloquant pour la recette dons, cf. E6) ; quand la phase est livrée, ajouter moniteur `/souscription` + capture d'erreurs de l'action, et brancher l'option `/api/health` (âge du dernier événement Stripe reçu) sur le moniteur Better Stack ; ce reste-là est non bloquant pour le go-live dons.
- **CI/devops** : merger la PR #5 avant (P8). **COHABITATION.md** : aucun impact (aucun WordPress lu ni touché par cette phase) ; noter au passage que son § « pas de repo connecté » est périmé.

---

## Calage calendrier (dates concretes vu le calendrier des FAITS ; effort estime vs jours vendus)

*(Jours de semaine vérifiés par `date -j` : le 10/07/2026 est un **vendredi**, les 11–12/07 un week-end, le 18/07 un samedi.)*

| Date | Jalon |
|---|---|
| **ven 10/07** | P1–P3 + P9 lancés (mail client : activation Stripe + accès + rappel paliers 2026 + mentions légales C90 + question statut juridique) ; P8 (merge PR #5) ; **E1–E8 développés** (le jour vendu) avec clés test (sandbox Youri si P2 traîne) — parcours local complet + webhook via `stripe listen` |
| sam 11/07 – dim 12/07 | **Week-end = la marge** (assumé : pas de travail planifié ; tout débordement d'E1–E8 s'y résorbe) ; swap vers les clés test du compte client dès P2 |
| **lun 13/07** | E9 : merge `main`, prod-beta en mode test, endpoint webhook test, matrice de recette déroulée ; cartes de test envoyées au client ; **butée décision Q1 (Stripe/HelloAsso)** |
| **mer 15/07** | Démo (avec le back-office) : parcours don en mode test montré en live (don en début de séance, jauge revisitée 2–3 min après) + Dashboard Stripe ; décisions Q3–Q6 + choix transfert/intérim (C70/C71) pris en séance |
| **ven 17/07** | **Butée P6/Q2** (paliers & contenus 2026 — le 18 est un samedi) |
| ven 17/07 – lun 20/07 | E10 : contenus/paliers 2026 intégrés ; **point d'étape pages légales** (phase Mise en production ou déclenchement du filet E10b) |
| **mar 21/07 → ven 24/07** | **E11 passage en réel** (dès `charges_enabled` ET pages légales en ligne) — aligné sur « B phasé : dons fin juillet » ; recette réelle (don 1 € puis remboursement, R13/R14) ; **mar 21/07 = jour du flip DNS** : second endpoint webhook sur `editionssociales.fr` créé **simultanément** à l'activation du « Redirect to Primary » (pas avant — cf. E11.2) |
| **mar 28/07 – ven 31/07** | **E11bis brief de lancement** figé par écrit avec le client (C51 : texte d'annonce, canal, date/heure du 15/08, qui appuie sur quel bouton) — avant la fermeture d'août ; joint à la checklist campagne ~10–14/08 de la phase 6 |
| ven 07/08 | Butée absolue de secours du go-live (marge d'une semaine avant le lancement) |
| **sam 15/08** | Lancement de campagne — système en réel depuis 3+ semaines, Youri disponible (E12) |

**Effort estimé vs vendu** : vendu **1 j** (200 €). Réaliste : E1–E8 ≈ 1 j (tenable : mécanique connue, page existante, dérivation de jauge prête) + **~0,25–0,5 j étalés** (E9 e2e Vercel, E10 swap contenu, E11 jour J, E11bis brief de lancement — séance courte pendant la recette, ≈ 0 —, coordination client) + **E10b ≤ 0,25 j seulement si déclenché** (et alors imputé à la ligne « Mise en production » du devis, dont c'est le périmètre — pas un dépassement des dons). Une partie de l'étalement est déjà promise dans la ligne du devis (« test de bout en bout puis passage en réel ») ; le dépassement net est donc ≈ 0,25 j, absorbable dans la semaine 1 sans toucher au forfait — **signalé, pas gonflé**. La branche HelloAsso, si elle était choisie, resterait ≈ 1 j (au même prix, conforme devis) mais tout basculement APRÈS le 15/07 coûterait le re-développement — d'où la butée Q1.

---

## Questions ouvertes / decisions client (chacune avec : quand elle doit etre tranchee au plus tard, et le defaut recommande)

| # | Question | Butée | Défaut recommandé |
|---|---|---|---|
| Q1 | **Stripe direct ou HelloAsso ?** (dépend du statut : association loi 1901 → HelloAsso 0 % + reçus fiscaux auto) | **lun 13/07** (sinon le jour vendu part en Stripe et un revirement coûte un re-dev) | **Stripe** : marche quel que soit le statut, compte déjà existant, payouts unifiés avec le commerce de septembre, pas de « pourboire HelloAsso » imposé aux donateurs. Branche HelloAsso si choisie : boutons → formulaire HelloAsso (lien ou widget iframe), jauge via API v5 (OAuth client_credentials, fetch taggé identique), pas de webhook — même enveloppe 1 j |
| Q2 | **Paliers, contreparties et objectif 2026** (textes + montants + goal de la jauge) | **ven 17/07** (pour un go-live fin juillet ; le 18/07 est un samedi) | Reprise provisoire des paliers 2024 (8 + 2 mécènes, objectif 50 k€, jauge 50/75/100 k€) — swap trivial à réception (E10) |
| Q3 | **Montant libre** : présent ? bornes ? | démo 15/07 | Oui, min 5 € / max 10 000 € (anti card-testing / anti-fat-finger) |
| Q4 | **Adresse postale** : quels paliers physiques, quels pays de livraison des contreparties | démo 15/07 | Paliers 15–300 € = adresse demandée (FR/BE/CH, pratique actuelle de la boutique) ; mécènes 500/1000 € = pas d'adresse (« on prend contact avec vous », texte actuel de la page) |
| Q5 | **Champ « message de soutien »** au checkout (custom field optionnel Stripe, lisible dans le Dashboard — écho des 419 messages Ulule 2024) | démo 15/07 | Oui (coût ~0) ; **aucun affichage public** des messages (hors périmètre) |
| Q6 | **Affichage de la jauge 2026 avant le 15/08** (le paiement sera réel dès fin juillet : jauge quasi vide visible ?) | passage en réel (E11) | La section jauge n'apparaît qu'à partir du **premier don net** (`collected > 0`, **remboursements déduits** — le don de test d'E11, remboursé, ne la déclenche donc pas, cf. E11.5). Si le client préfère la masquer jusqu'au 15/08 même en cas de dons précoces réels : une constante à basculer (1 ligne) |
| Q7 | **Dons récurrents (mensuels)** | — (constat, pas une décision de cette phase) | **Non vendus** (vérifié devis §3.3/§5) — si souhaité, chiffrage séparé (mode `subscription`, portail de gestion, churn) ; ne pas laisser entrer par la fenêtre |
| Q8 | **Reçu fiscal** : le client s'attend-il à des reçus fiscaux (défiscalisation des donateurs) ? | démo 15/07 | Clarifier : Stripe envoie un **reçu de paiement** (ce que couvre le devis). Reçu fiscal ⇒ structure éligible (intérêt général) ⇒ branche HelloAsso, ou émission manuelle par le client — hors périmètre code |
| Q9 | **Transfert Vercel/GitHub vs intérim écrit** (C70/C71 : la clé live du client tournera sur l'infra de Youri dès E11 ; coquilles `ldes`/`editionssociales` vides — R4) | démo 15/07 | **Intérim écrit** jusqu'à la recette complète (avant la fermeture d'août), transfert à la recette — ne pas déménager l'infra entre le go-live et le lancement ; checklist de re-provisioning (env vars, endpoint webhook) au transfert |
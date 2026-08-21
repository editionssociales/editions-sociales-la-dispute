"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { CAMPAIGN_KEY, parseDonation, type DonationTierId } from "@/lib/donation-tiers";
import {
  resolveContrepartieItems,
  type ContrepartieSelection,
} from "@/lib/contreparties-core";
import { getContrepartieBooksBySlugs } from "@/lib/contreparties";
import { encodeCheckoutLines } from "@/lib/checkout-core";

/**
 * Server action de `/souscription` — crée une session Stripe Checkout pour un
 * don (palier fixe ou montant libre) et y redirige. Le montant n'est jamais
 * lu tel quel du client pour un palier : `parseDonation` (`donation-tiers.ts`)
 * le dérive de `DONATION_TIERS` sur le serveur ; le formulaire n'envoie qu'un
 * `tierId` (ou un `amount` pour le montant libre).
 *
 * Contrepartie (client 2026-08-21, CONTRAT PARTAGÉ avec le webhook) : tout
 * palier connu pose en plus `metadata.donLines` — la composition complète
 * résolue (`contreparties-core.ts`), encodée au même format que le panier
 * (`encodeCheckoutLines`, `unitPriceCents` à 0 pour chaque ligne) — que le
 * palier soit fixe (résolution triviale, sélection vide) ou à choix
 * (sélection lue dans le formulaire, `readContrepartieSelection`). Un montant
 * libre n'a JAMAIS de `donLines` : ce n'est pas une contrepartie, juste un don.
 */

/** Lit les champs `choix.<sectionId>` du formulaire — clé de section `choix` → id d'option choisie. */
function readContrepartieSelection(formData: FormData): ContrepartieSelection {
  const selection: ContrepartieSelection = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("choix.") || typeof value !== "string") continue;
    selection[key.slice("choix.".length)] = value;
  }
  return selection;
}

export async function createDonationCheckout(formData: FormData) {
  const tierId = formData.get("tierId");
  const amount = formData.get("amount");
  const parsed = parseDonation({
    tierId: typeof tierId === "string" ? tierId : undefined,
    amount: typeof amount === "string" ? amount : undefined,
  });

  if ("error" in parsed) {
    // Capturé en warning (même pattern que le webhook) : un flux de refus à
    // 100 % le jour du lancement doit se voir dans le monitoring — l'erreur
    // étant absorbée ici, `onRequestError` (instrumentation) ne la voit jamais.
    Sentry.captureMessage(`Don refusé : ${parsed.error}`, { level: "warning" });
    // `?raison=montant` : la page d'erreur distingue un montant refusé par la
    // validation (bornes rappelées) d'un échec technique Stripe — ne concerne
    // que no-JS/POST directs, la validation native min/max couvre l'UI.
    redirect("/souscription/erreur?raison=montant");
  }

  // Résolution de la contrepartie — UNIQUEMENT pour un palier connu (un
  // montant libre, `parsed.tier` absent, n'a pas de composition à résoudre).
  // `parsed.tier.id` vient de `DONATION_TIERS.find` (`parseDonation`) : le
  // cast est sûr, cette valeur appartient toujours à l'union `DonationTierId`.
  let donLines: string | undefined;
  if (parsed.tier) {
    const resolvedTierId = parsed.tier.id as DonationTierId;
    const selection = readContrepartieSelection(formData);
    const resolution = resolveContrepartieItems(resolvedTierId, selection);
    if (!resolution.ok) {
      // Ne peut se produire QUE sur un palier à choix — un palier fixe résout
      // toujours avec une sélection vide (`contreparties-core.ts`) : retour à
      // l'étape de sélection dédiée, jamais un refus générique/silencieux.
      redirect(`/souscription/contrepartie/${resolvedTierId}?erreur=choix`);
    }

    const books = await getContrepartieBooksBySlugs(resolution.items.map((item) => item.slug));
    const lines: { id: number; qty: number; unitPriceCents: number }[] = [];
    let missingSlug: string | undefined;
    for (const item of resolution.items) {
      const book = books.get(item.slug);
      if (!book) {
        missingSlug = item.slug;
        break;
      }
      lines.push({ id: book.id, qty: item.qty, unitPriceCents: 0 });
    }
    if (missingSlug) {
      // On n'encaisse jamais un don dont on ne peut pas fabriquer la
      // commande : fiche `books` manquante en base pour un slug de la
      // composition (TODO-AUDIT, `contreparties-core.ts`) — signalé en
      // erreur (pas un simple warning, ce refus bloque le don).
      Sentry.captureMessage(
        `Contrepartie : slug introuvable en base — impossible de composer la commande de don`,
        { level: "error", extra: { slug: missingSlug, tierId: resolvedTierId } },
      );
      redirect("/souscription/erreur?raison=contrepartie");
    }
    donLines = encodeCheckoutLines(lines);
  }

  // Origine absolue pour les URL de retour Stripe : `NEXT_PUBLIC_SITE_URL`
  // (déjà posée pour robots.ts/sitemap.ts/layout.tsx) en priorité, repli sur
  // l'hôte de la requête (dev, preview sans variable posée).
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${(await headers()).get("host")}`;

  const label = `Souscription 2026 — ${parsed.tier?.title ?? "Montant libre"}`;
  // Dupliquée sur la session ET sur `payment_intent_data` : les metadata de
  // session ne se propagent pas au PaymentIntent, et c'est la Charge — sur
  // laquelle le PaymentIntent copie ses propres metadata — que la jauge (E7)
  // recherche. `kind: "donation"` est le discriminateur posé dès maintenant
  // pour la phase commerce (septembre), qui partagera ce webhook.
  // `kind`/`campaign`/`tier` INCHANGÉS (la jauge les lit tels quels) —
  // `donLines` est la SEULE clé ajoutée, absente pour un montant libre.
  const metadata: Record<string, string> = {
    kind: "donation",
    campaign: CAMPAIGN_KEY,
    tier: parsed.tier?.id ?? "libre",
    ...(donLines !== undefined && { donLines }),
  };

  let url: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      locale: "fr",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: parsed.amountMinor,
            product_data: { name: label },
          },
        },
      ],
      metadata,
      payment_intent_data: {
        description: label,
        metadata,
      },
      ...(parsed.tier?.physical && {
        shipping_address_collection: { allowed_countries: ["FR", "BE", "CH"] },
      }),
      customer_creation: "if_required",
      success_url: `${origin}/souscription/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/souscription#paliers`,
    });
    url = session.url;
  } catch (err) {
    // Sans capture, un échec Stripe (clé mal posée, capability manquante,
    // panne API) serait invisible du monitoring — même traitement que
    // /api/checkout (route jumelle).
    Sentry.captureException(err);
    redirect("/souscription/erreur");
  }

  // redirect() jette NEXT_REDIRECT : à garder hors du try/catch Stripe
  // ci-dessus (sans quoi le catch l'avalerait). `session.url` est typée
  // `string | null` : une session sans URL part vers le parcours d'erreur
  // prévu, jamais vers l'invariant error de redirect(null).
  if (!url) redirect("/souscription/erreur");
  redirect(url);
}

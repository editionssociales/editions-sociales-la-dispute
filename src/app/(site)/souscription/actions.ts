"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { CAMPAIGN_KEY, parseDonation } from "@/lib/donation-tiers";

/**
 * Server action de `/souscription` — crée une session Stripe Checkout pour un
 * don (palier fixe ou montant libre) et y redirige. Le montant n'est jamais
 * lu tel quel du client pour un palier : `parseDonation` (`donation-tiers.ts`)
 * le dérive de `DONATION_TIERS` sur le serveur ; le formulaire n'envoie qu'un
 * `tierId` (ou un `amount` pour le montant libre).
 */
export async function createDonationCheckout(formData: FormData) {
  const tierId = formData.get("tierId");
  const amount = formData.get("amount");
  const parsed = parseDonation({
    tierId: typeof tierId === "string" ? tierId : undefined,
    amount: typeof amount === "string" ? amount : undefined,
  });

  if ("error" in parsed) {
    // `?raison=montant` : la page d'erreur distingue un montant refusé par la
    // validation (bornes rappelées) d'un échec technique Stripe — ne concerne
    // que no-JS/POST directs, la validation native min/max couvre l'UI.
    redirect("/souscription/erreur?raison=montant");
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
  const metadata = {
    kind: "donation",
    campaign: CAMPAIGN_KEY,
    tier: parsed.tier?.id ?? "libre",
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
  } catch {
    redirect("/souscription/erreur");
  }

  // redirect() jette NEXT_REDIRECT : à garder hors du try/catch Stripe
  // ci-dessus (sans quoi le catch l'avalerait).
  redirect(url!);
}

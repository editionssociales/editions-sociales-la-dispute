import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { ClearCartOnConfirmation } from "@/components/cart/clear-cart-on-confirmation";
import { isCommerceNative } from "@/lib/env";
import { donationsEnabled, getStripe } from "@/lib/stripe";

/**
 * Page de retour après un achat Stripe Checkout (`success_url` posée par
 * `POST /api/checkout`, plan §4 étape 8) — sobre par construction (plan §4
 * étape 8 : « crée une page de confirmation sobre si nécessaire »), même
 * gabarit que `souscription/merci` mais générique (le webhook, étape 9, est
 * l'unique source de vérité de la commande — cette page ne fait que relire
 * la session pour un message immédiat, jamais une garantie que la commande
 * est déjà en base : la création peut suivre de quelques secondes).
 */
export const metadata: Metadata = {
  title: "Merci",
  robots: { index: false, follow: false },
};

interface OrderConfirmation {
  email: string | null;
  totalTTC: number;
  pending: boolean;
}

/**
 * Relit la session Stripe créée par le checkout pour afficher un message
 * honnête — jamais un montant repris de l'URL. Toute erreur (paramètre
 * absent, session invalide, Stripe indisponible, session d'une AUTRE
 * campagne — `metadata.kind !== "order"`) dégrade en `null` : la page
 * affiche alors un remerciement générique, jamais une erreur brute.
 */
async function lookupOrder(sessionId: string | undefined): Promise<OrderConfirmation | null> {
  if (!sessionId || !donationsEnabled()) return null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.kind !== "order") return null;
    return {
      email: session.customer_details?.email ?? null,
      totalTTC: (session.amount_total ?? 0) / 100,
      pending: session.payment_status !== "paid",
    };
  } catch {
    return null;
  }
}

export default async function MerciPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const order = await lookupOrder(sessionId);

  return (
    <section className="bg-white">
      <Container className="max-w-2xl py-20 sm:py-28">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-black/50">
          Commande
        </p>
        {order && isCommerceNative() && <ClearCartOnConfirmation />}
        {order ? (
          <>
            <h1 className="mt-3 font-sans text-3xl font-black italic leading-[0.98] text-black sm:text-4xl">
              {order.pending ? "Paiement en cours de confirmation" : "Merci pour votre commande !"}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-black/70">
              {order.pending ? (
                "Votre paiement est en cours de confirmation — vous recevrez un email dès qu'il sera validé, sans action de votre part."
              ) : (
                <>
                  Votre commande de{" "}
                  <strong className="font-bold text-black">
                    {order.totalTTC.toLocaleString("fr-FR")}&nbsp;€
                  </strong>{" "}
                  a bien été enregistrée
                  {order.email ? (
                    <>
                      {" "}
                      — un email de confirmation a été envoyé à{" "}
                      <strong className="font-bold text-black">{order.email}</strong>
                    </>
                  ) : null}
                  .
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 font-sans text-3xl font-black italic leading-[0.98] text-black sm:text-4xl">
              Merci pour votre commande !
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-black/70">
              Votre commande a bien été prise en compte. Si le paiement a
              abouti, un email de confirmation vous a été envoyé.
            </p>
          </>
        )}
        <div className="mt-8 flex flex-wrap gap-4">
          <Button href="/catalogue" variant="solid" className="px-6 py-3 text-sm tracking-[.03em]">
            Découvrir le catalogue
          </Button>
          <Button href="/panier" variant="outline" className="px-6 py-3 text-sm tracking-[.03em]">
            Retour au panier
          </Button>
        </div>
      </Container>
    </section>
  );
}

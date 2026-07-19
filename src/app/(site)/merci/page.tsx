import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { ClearCartOnConfirmation } from "@/components/cart/clear-cart-on-confirmation";
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

  const title = order?.pending ? "Paiement en cours de confirmation" : "Merci pour votre commande !";
  const intro = order ? (
    order.pending ? (
      "Votre paiement est en cours de confirmation — vous recevrez un email dès qu'il sera validé, sans action de votre part."
    ) : (
      <>
        Votre commande de{" "}
        <strong className="font-bold text-ink">
          {order.totalTTC.toLocaleString("fr-FR")}&nbsp;€
        </strong>{" "}
        a bien été enregistrée
        {order.email ? (
          <>
            {" "}
            — un email de confirmation a été envoyé à{" "}
            <strong className="font-bold text-ink">{order.email}</strong>
          </>
        ) : null}
        .
      </>
    )
  ) : (
    "Votre commande a bien été prise en compte. Si le paiement a abouti, un email de confirmation vous a été envoyé."
  );

  return (
    <section className="bg-paper">
      <Container className="max-w-2xl py-20 sm:py-28">
        {order && <ClearCartOnConfirmation />}
        <PageHero eyebrow="Commande" tone="system" title={title} />

        {/* Carte de confirmation (R3) : liseré bottle (succès) ou ocher (paiement
            en attente) en tête — même code couleur que les issues de la
            souscription, jamais un dégradé, jamais deux couleurs pour un même
            rôle. Référence citable pour un contact support ultérieur, dérivée
            de l'identifiant de session Stripe (connu même si la commande n'a
            pas encore atteint la base — le webhook fait foi, cf. commentaire
            de `lookupOrder`). */}
        <div className="mt-6 border-2 border-ink bg-paper-2 p-6 sm:p-8">
          <div
            aria-hidden="true"
            className={`h-1.5 w-12 ${order?.pending ? "bg-ocher" : "bg-bottle"}`}
          />
          <p className="mt-4 font-sans text-base leading-relaxed text-ink">{intro}</p>
          {sessionId && (
            <p className="mt-3 font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
              Référence : {sessionId.slice(-10).toUpperCase()}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
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

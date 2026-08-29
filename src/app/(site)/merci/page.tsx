import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { ClearCartOnConfirmation } from "@/components/cart/clear-cart-on-confirmation";
import { ContactLine } from "@/components/contact-line";
import { DELIVERY_DELAY_RANGE } from "@/lib/delivery-copy";
import { formatPrice } from "@/lib/format";
import { ACCENT_BG } from "@/lib/accents";
import { stripeEnabled, getStripe } from "@/lib/stripe";

/**
 * Page de retour après un achat Stripe Checkout (`success_url` posée par
 * `POST /api/checkout`, plan §4 étape 8) — sobre par construction (plan §4
 * étape 8 : « crée une page de confirmation sobre si nécessaire »), même
 * gabarit que `souscription/merci` (barre d'accent + badge + `PageHero`) mais
 * générique (le webhook, étape 9, est l'unique source de vérité de la
 * commande — cette page ne fait que relire la session pour un message
 * immédiat, jamais une garantie que la commande est déjà en base : la
 * création peut suivre de quelques secondes).
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
  if (!sessionId || !stripeEnabled()) return null;
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
  // Issue sémantique (R3) : paiement confirmé (ou aucune info de session à
  // relire, cas de repli optimiste) = bottle ; confirmation Stripe encore en
  // cours = ocher — même code couleur que `souscription/merci`.
  const tone = order?.pending ? "ocher" : "bottle";

  const title = order?.pending ? "Paiement en cours de confirmation" : "Merci pour votre commande !";
  const intro = order ? (
    order.pending ? (
      "Votre paiement est en cours de confirmation — vous recevrez un email dès qu'il sera validé, sans action de votre part."
    ) : (
      <>
        Votre commande de{" "}
        <strong className="font-bold text-ink">{formatPrice(order.totalTTC)}</strong>{" "}
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
    <>
      <div aria-hidden="true" className={`h-1.5 ${ACCENT_BG[tone]}`} />
      <section className="bg-paper">
        <Container width="prose" className="py-20 sm:py-28">
          {order && <ClearCartOnConfirmation />}
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center border-2 border-ink ${ACCENT_BG[tone]}`}
          >
            <span aria-hidden="true" className="font-sans text-2xl font-black text-paper">
              ✓
            </span>
          </div>
          <PageHero tone="system" title={title} intro={intro} />
          {/* Référence citable pour un contact support ultérieur — dérivée de
              l'identifiant de session Stripe (connu même si la commande n'a pas
              encore atteint la base — le webhook fait foi, cf. commentaire de
              `lookupOrder`). Contenu propre à cette page de commande, absent de
              `souscription/merci`. */}
          {sessionId && (
            <p className="mt-3 font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
              Référence : {sessionId.slice(-10).toUpperCase()}
            </p>
          )}

          {/* Délai annoncé (demande client 2026-08-26, source unique
              `delivery-copy.ts`) — cette page ne sait pas distinguer une
              précommande (elle ne relit que la session Stripe), d'où la
              parenthèse : le mail de confirmation, lui, adapte sa phrase
              commande par commande (`order-mail.ts`). */}
          <p className="mt-4 font-sans text-sm text-muted">
            Livraison {DELIVERY_DELAY_RANGE} — les précommandes sont expédiées à parution.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Button href="/catalogue" variant="solid" className="px-6 py-3 text-sm tracking-[.03em]">
              Découvrir le catalogue
            </Button>
            {/* Cas nominal (commande retrouvée) : le panier a déjà été vidé par
                `ClearCartOnConfirmation` ci-dessus — un lien « Retour au panier »
                mènerait à un panier vide. Il ne reste utile que dans le cas de
                repli (session absente/invalide) où le panier n'a pas été touché. */}
            {!order && (
              <Button href="/panier" variant="outline" className="px-6 py-3 text-sm tracking-[.03em]">
                Retour au panier
              </Button>
            )}
          </div>

          {/* Adresse de la maison — indépendante de Brevo : tant que la chaîne
              e-mail n'est pas provisionnée, AUCUN récapitulatif de commande ne
              part, et cette ligne est le seul recours de l'acheteur·se. Elle
              reste utile ensuite (question sur un envoi, une facture). */}
          <ContactLine
            subject="À propos de ma commande"
            lead="Une question sur votre commande ?"
            className="mt-10"
          />
        </Container>
      </section>
    </>
  );
}

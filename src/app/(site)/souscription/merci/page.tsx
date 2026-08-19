import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { ContactLine } from "@/components/contact-line";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { CAMPAIGN_KEY, DONATION_TIERS } from "@/lib/donation-tiers";
import { ACCENT_BG } from "@/lib/accents";

/**
 * Page de retour après un don Stripe Checkout (`success_url` posée par
 * `createDonationCheckout`, E3). Dynamique par nature : elle lit
 * `session_id` dans `searchParams` (Promise en Next 16) pour relire la
 * session côté Stripe. Jamais indexée : c'est une page de confirmation, pas
 * un contenu éditorial.
 */
export const metadata: Metadata = {
  title: "Merci",
  robots: { index: false, follow: false },
};

/** Don retrouvé depuis la session Checkout — `null` si rien à en dire. */
type Donation = { amount: number; tierTitle: string; pending: boolean };

/**
 * Relit la session Stripe créée par E3 pour afficher le montant réellement
 * encaissé — jamais une valeur reprise de l'URL. Toute erreur (paramètre
 * absent, session invalide, Stripe indisponible) dégrade en `null` : la page
 * affiche alors un remerciement générique, jamais une erreur brute.
 */
async function lookupDonation(sessionId: string | undefined): Promise<Donation | null> {
  if (!sessionId || !stripeEnabled()) return null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // Défense en profondeur : n'afficher un montant que pour une session de
    // don de cette campagne (le webhook/Checkout partagera un jour ce même
    // préfixe d'URL avec le commerce natif, cf. `metadata.kind`).
    if (session.metadata?.campaign !== CAMPAIGN_KEY) return null;
    const tier = DONATION_TIERS.find((t) => t.id === session.metadata?.tier);
    return {
      amount: (session.amount_total ?? 0) / 100,
      tierTitle: tier?.title ?? "Montant libre",
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
  const donation = await lookupDonation(sessionId);
  // Issue sémantique (R3) : paiement confirmé (ou aucune info de session à
  // relire, cas générique optimiste) = bottle ; confirmation Stripe encore en
  // cours = ocher. `/souscription/erreur` (brick) reste une page distincte,
  // ce parcours-ci n'aboutit jamais à un échec.
  const tone = donation?.pending ? "ocher" : "bottle";

  return (
    <>
      <div aria-hidden="true" className={`h-1.5 ${ACCENT_BG[tone]}`} />
      <section className="bg-paper">
        <Container width="prose" className="py-20 sm:py-28">
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center border-2 border-ink ${ACCENT_BG[tone]}`}
          >
            <span aria-hidden="true" className="font-sans text-2xl font-black text-paper">
              ✓
            </span>
          </div>
          {donation ? (
            <PageHero
              tone="system"
              title={donation.pending ? "Paiement en cours de confirmation" : "Merci pour votre don !"}
              intro={
                donation.pending ? (
                  "Votre paiement est en cours de confirmation — vous recevrez un reçu par email dès qu’il sera validé, sans action de votre part."
                ) : (
                  <>
                    Votre don de{" "}
                    <strong className="font-bold text-ink">
                      {donation.amount.toLocaleString("fr-FR", {
                        // Centimes forcés dès que le montant n'est pas entier
                        // (POST direct décimal) : « 42,50 € », jamais « 42,5 € ».
                        minimumFractionDigits: Number.isInteger(donation.amount) ? 0 : 2,
                      })}&nbsp;€
                    </strong>{" "}
                    — {donation.tierTitle} — a bien été enregistré. Stripe vous
                    enverra un reçu par email.
                  </>
                )
              }
            />
          ) : (
            <PageHero
              tone="system"
              title="Merci pour votre soutien !"
              intro="Votre contribution a bien été prise en compte. Si le paiement a abouti, Stripe vous enverra un reçu par email."
            />
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            <Button href="/catalogue" variant="solid" className="px-6 py-3 text-sm tracking-[.03em]">
              Découvrir le catalogue
            </Button>
            <Button
              href="/souscription"
              variant="outline"
              className="px-6 py-3 text-sm tracking-[.03em]"
            >
              Retour à la souscription
            </Button>
          </div>

          {/* Adresse de la maison — indépendante de Brevo : le reçu Stripe
              part de Stripe, mais aucun message de la maison (remerciement,
              suivi de contrepartie) ne partira tant que la chaîne e-mail
              n'est pas provisionnée. Un donateur doit savoir à qui écrire. */}
          <ContactLine
            subject="À propos de mon don"
            lead="Une question sur votre don ?"
            className="mt-10"
          />
        </Container>
      </section>
    </>
  );
}

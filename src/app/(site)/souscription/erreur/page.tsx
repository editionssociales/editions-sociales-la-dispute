import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { formatInt } from "@/lib/format";
import { FREE_AMOUNT } from "@/lib/donation-tiers";

/**
 * Page de repli quand `createDonationCheckout` (E3) échoue — la page
 * `/souscription` elle-même ne plante jamais. Elle lit `raison` dans
 * `searchParams` (Promise en Next 16 — rendu dynamique, assumé pour une page
 * d'erreur) pour distinguer un montant refusé par la validation serveur
 * (`?raison=montant`, bornes rappelées) d'un vrai échec technique (clé
 * absente, Stripe indisponible, erreur réseau). Jamais indexée.
 */
export const metadata: Metadata = {
  title: "Paiement indisponible",
  robots: { index: false, follow: false },
};

export default async function ErreurPage({
  searchParams,
}: {
  searchParams: Promise<{ raison?: string }>;
}) {
  const { raison } = await searchParams;
  // Bornes importées de `FREE_AMOUNT` (jamais de littéraux) : le message ne
  // peut pas diverger de la validation de `parseDonation`.
  const intro =
    raison === "montant"
      ? `Le montant saisi n’a pas pu être accepté — un don libre va de ${FREE_AMOUNT.min} à ${formatInt(FREE_AMOUNT.max)} €. Aucune somme n’a été prélevée.`
      : "Un problème technique a empêché l’ouverture de la page de paiement. Aucune somme n’a été prélevée. Vous pouvez réessayer, ou nous écrire si le problème persiste.";

  return (
    <>
      {/* Issue sémantique (R3) : brick = échec — seule page de ce parcours
          qui en aboutit à un. */}
      <div aria-hidden="true" className="h-1.5 bg-brick" />
      <section className="bg-paper">
        <Container className="max-w-2xl py-20 sm:py-28">
          <div className="mb-6 flex h-14 w-14 items-center justify-center border-2 border-ink bg-brick">
            <span aria-hidden="true" className="font-sans text-2xl font-black text-paper">
              !
            </span>
          </div>
          <PageHero tone="system" title="Le paiement n’a pas pu démarrer" intro={intro} />
          <div className="mt-8 flex flex-wrap gap-4">
            <Button
              href="/souscription#paliers"
              variant="solid"
              className="px-6 py-3 text-sm tracking-[.03em]"
            >
              Réessayer
            </Button>
            {/* Page /contact (formulaire fonctionnel) plutôt qu'un mailto en
                dur vers une boîte dont rien ne garantit l'existence (migration
                DNS/OVH en cours) : jamais un deuxième échec d'affilée. */}
            <Button href="/contact" variant="outline" className="px-6 py-3 text-sm tracking-[.03em]">
              Nous écrire
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

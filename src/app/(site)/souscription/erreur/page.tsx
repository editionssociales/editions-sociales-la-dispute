import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";

/**
 * Page statique de repli quand `createDonationCheckout` (E3) échoue à créer
 * la session Stripe (clé absente, Stripe indisponible, erreur réseau) — la
 * page `/souscription` elle-même ne devient jamais dynamique ni ne plante.
 * Jamais indexée.
 */
export const metadata: Metadata = {
  title: "Paiement indisponible",
  robots: { index: false, follow: false },
};

export default function ErreurPage() {
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
          <PageHero
            eyebrow="Souscription 2026"
            tone="system"
            title="Le paiement n'a pas pu démarrer"
            intro="Un problème technique a empêché l'ouverture de la page de paiement. Aucune somme n'a été prélevée. Vous pouvez réessayer, ou nous écrire si le problème persiste."
          />
          <div className="mt-8 flex flex-wrap gap-4">
            <Button
              href="/souscription#paliers"
              variant="solid"
              className="px-6 py-3 text-sm tracking-[.03em]"
            >
              Réessayer
            </Button>
            <Button
              href="mailto:contact@editionssociales.fr"
              variant="outline"
              className="px-6 py-3 text-sm tracking-[.03em]"
            >
              Nous écrire
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

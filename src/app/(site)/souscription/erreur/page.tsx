import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { Eyebrow } from "@/components/eyebrow";

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
    <section className="bg-paper">
      <Container className="max-w-2xl py-20 sm:py-28">
        <Eyebrow>Souscription 2026</Eyebrow>
        <h1 className="mt-3 font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
          Le paiement n&apos;a pas pu démarrer
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/70">
          Un problème technique a empêché l&apos;ouverture de la page de
          paiement. Aucune somme n&apos;a été prélevée. Vous pouvez réessayer,
          ou nous écrire si le problème persiste.
        </p>
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
  );
}

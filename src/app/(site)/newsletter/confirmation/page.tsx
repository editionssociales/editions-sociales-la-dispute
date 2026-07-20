import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";

/**
 * Page de confirmation DOI (plan §5 étape 6) — cible de `redirectionUrl`
 * posée par `subscribeToNewsletter` (`newsletter/actions.ts`) : Brevo y
 * redirige le navigateur après que le destinataire a cliqué le lien de
 * l'email de double opt-in. Statique, sans donnée externe (même famille que
 * `souscription/merci`/`souscription/erreur`) ; jamais indexée — page
 * technique, pas un contenu éditorial.
 */
export const metadata: Metadata = {
  title: "Inscription confirmée",
  robots: { index: false, follow: false },
};

export default function NewsletterConfirmationPage() {
  return (
    <section className="bg-paper">
      <Container className="max-w-2xl py-20 sm:py-28">
        <PageHero
          tone="system"
          title="Inscription confirmée"
          intro="Votre adresse email est confirmée : vous recevrez désormais nos actualités (parutions, rencontres, souscriptions) — une fois par mois. Vous pourrez vous désinscrire à tout moment depuis n'importe quel email reçu."
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <Button href="/catalogue" variant="solid" className="px-6 py-3 text-sm tracking-[.03em]">
            Découvrir le catalogue
          </Button>
          <Button href="/" variant="outline" className="px-6 py-3 text-sm tracking-[.03em]">
            Retour à l&apos;accueil
          </Button>
        </div>
      </Container>
    </section>
  );
}

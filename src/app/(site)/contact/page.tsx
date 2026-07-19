import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHero } from "@/components/page-hero";
import { ContactForm } from "@/components/contact-form";

/**
 * Page de contact unique (plan §5 étape 7) — remplace fonctionnellement les 3
 * outils redondants du legacy (Contact Form 7 + WPForms sur Boutique, Everest
 * Forms sur LD). Server component, entièrement statique (le formulaire est
 * un îlot client autonome) — pas de donnée externe à lire ici, même famille
 * qu'`a-propos`/`rencontres` (`src/app/CLAUDE.md`).
 */
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contacter Les Éditions sociales et La Dispute — une question, une commande, une proposition.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <Container className="bg-paper py-12 sm:py-16">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Contact" }]} />
      <PageHero
        eyebrow="Nous écrire"
        title="Contact"
        intro="Une question sur un livre, une commande, une proposition éditoriale ? Écrivez-nous, nous vous répondrons dès que possible."
        className="max-w-xl"
      />

      <div className="mt-10 max-w-xl">
        <ContactForm />
      </div>
    </Container>
  );
}

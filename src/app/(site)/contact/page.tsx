import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Breadcrumb } from "@/components/breadcrumb";
import { Eyebrow } from "@/components/eyebrow";
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
    <Container className="bg-paper pb-16 pt-10 sm:pb-20 sm:pt-14">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Contact" }]} />
      <Reveal>
        <div className="mt-6 max-w-xl">
          <Eyebrow>Nous écrire</Eyebrow>
          <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
            Contact
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/70">
            Une question sur un livre, une commande, une proposition
            éditoriale ? Écrivez-nous, nous vous répondrons dès que possible.
          </p>
        </div>
      </Reveal>

      <div className="mt-10 max-w-xl">
        <ContactForm />
      </div>
    </Container>
  );
}

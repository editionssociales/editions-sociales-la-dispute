import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/page-hero";
import { ContactForm } from "@/components/contact-form";
import { brevoConfigured } from "@/lib/brevo";
import { ManualContact } from "./_components/manual-contact";

/**
 * Page de contact unique (plan §5 étape 7) — remplace fonctionnellement les 3
 * outils redondants du legacy (Contact Form 7 + WPForms sur Boutique, Everest
 * Forms sur LD). Server component, entièrement statique (le formulaire est
 * un îlot client autonome) — pas de donnée externe à lire ici, même famille
 * qu'`a-propos`/`rencontres` (`src/app/CLAUDE.md`).
 *
 * **Aiguillage du repli e-mail** : sans `BREVO_API_KEY`, aucun message ne
 * peut partir — la page rend alors le chemin manuel (`ManualContact`) plutôt
 * qu'un formulaire qui n'aboutit nulle part. Poser la clé suffit à retrouver
 * le formulaire, sans toucher au code. La lecture se fait au PRÉRENDU (page
 * statique) et non à la requête : sur Vercel, une variable d'environnement
 * ajoutée n'atteint de toute façon le runtime qu'au déploiement suivant —
 * lire ici ne coûte donc aucune réversibilité, et évite de dynamiser une page
 * qui n'a rien d'autre à lire (politique de fraîcheur, `src/app/CLAUDE.md`).
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
      <PageHero
        title="Contact"
        intro="Une question sur un livre, une commande, une proposition éditoriale ? Écrivez-nous, nous vous répondrons dès que possible."
        className="max-w-xl"
      />

      <div className="mt-10 max-w-xl">
        {brevoConfigured() ? <ContactForm /> : <ManualContact />}
      </div>
    </Container>
  );
}

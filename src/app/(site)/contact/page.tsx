import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/page-hero";
import { ContactForm } from "@/components/contact-form";
import { brevoConfigured } from "@/lib/brevo";
import { getPageContact } from "@/lib/site-content";
import { ManualContact } from "./_components/manual-contact";

/**
 * Page de contact unique (plan §5 étape 7) — remplace fonctionnellement les 3
 * outils redondants du legacy (Contact Form 7 + WPForms sur Boutique, Everest
 * Forms sur LD). Server component (le formulaire est un îlot client
 * autonome) — titre et chapeau viennent du global `page-contact`
 * (`src/lib/site-content`), lu SANS `revalidate` (purement statique +
 * revalidation à la demande par `revalidatePageContactAfterChange`), même
 * politique que les pages légales qui lisent leur propre global (`cgv`,
 * `mentions-legales`, `confidentialite` — `src/app/CLAUDE.md`).
 *
 * **Aiguillage du repli e-mail** : sans `BREVO_API_KEY`, aucun message ne
 * peut partir — la page rend alors le chemin manuel (`ManualContact`) plutôt
 * qu'un formulaire qui n'aboutit nulle part. Poser la clé suffit à retrouver
 * le formulaire, sans toucher au code. La lecture se fait au PRÉRENDU (page
 * statique) et non à la requête : sur Vercel, une variable d'environnement
 * ajoutée n'atteint de toute façon le runtime qu'au déploiement suivant —
 * lire ici ne coûte donc aucune réversibilité.
 */
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contacter Les Éditions sociales et La Dispute — une question, une commande, une proposition.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const { titre, intro } = await getPageContact();
  return (
    <Container className="bg-paper py-12 sm:py-16">
      <PageHero title={titre} intro={intro} className="max-w-xl" />

      <div className="mt-10 max-w-xl">
        {brevoConfigured() ? <ContactForm /> : <ManualContact />}
      </div>
    </Container>
  );
}

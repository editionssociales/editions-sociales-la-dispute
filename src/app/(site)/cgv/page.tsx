import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHero } from "@/components/page-hero";
import { LegalCmsBody, LegalSection, LEGAL_BODY } from "@/components/legal-section";
import { getPagesLegales } from "@/lib/site-content";

// Même recette de sous-titre légal que `confidentialite/page.tsx` : de vrais
// <h3> (navigation par titres des lecteurs d'écran), pas des spans gras.
const H3_CLASS = "mt-6 font-sans text-lg font-black italic text-ink";

export const metadata: Metadata = {
  title: "Conditions générales & conditions de don",
  description:
    "Conditions générales de vente et conditions de don des Éditions sociales x La Dispute.",
  alternates: { canonical: "/cgv" },
};

export default async function CgvPage() {
  // Global `pages-legales` (spec « éditeur de contenus ») : onglet rempli =
  // tout le corps (chapeau compris) vient du back-office ; onglet vide = le
  // JSX ci-dessous. Le global reste prioritaire dans les deux cas.
  const { cgv } = await getPagesLegales();
  return (
    <>
      <Container className="bg-paper py-12 sm:py-16">
        <Breadcrumb
          trail={[
            { label: "Accueil", href: "/" },
            { label: "Conditions générales & conditions de don" },
          ]}
        />
        <PageHero
          eyebrow="Dons et vente en ligne"
          title="Conditions générales & conditions de don"
          intro={
            !cgv &&
            "Ce site propose la vente en ligne de nos livres, ainsi que les dons de la campagne en cours."
          }
        />
      </Container>

      {cgv ? (
        <LegalCmsBody html={cgv} />
      ) : (
        <>
          {/* Dons */}
          <LegalSection title="Conditions de don">
            <p className={LEGAL_BODY}>
              Un don est un soutien libre à l&apos;activité des Éditions
              sociales et de La Dispute : il ne constitue ni un achat, ni une
              commande, et n&apos;ouvre droit à aucune contrepartie
              commerciale au sens du droit de la consommation.
            </p>
            <p className={LEGAL_BODY}>
              Le don n&apos;étant pas un contrat de vente à distance, le droit
              de rétractation de 14 jours prévu par le code de la consommation
              ne s&apos;applique pas. Le dispositif de don en ligne n&apos;est
              pas encore opérationnel sur ce site : une fois en service, un
              email de confirmation sera envoyé à la suite de chaque don,
              faisant office de reçu.
            </p>
            <p className={LEGAL_BODY}>
              La possibilité de délivrer un reçu fiscal ouvrant droit à
              réduction d&apos;impôt dépend du statut juridique de la
              structure, en cours de confirmation : aucun reçu fiscal
              n&apos;est promis à ce stade. Cette page sera mise à jour dès que
              ce statut sera arrêté.
            </p>
          </LegalSection>

          {/* Vente */}
          <LegalSection title="Conditions de vente">
                <p className={LEGAL_BODY}>
                  La vente en ligne de nos livres est opérée directement sur
                  ce site. Les prix affichés sont TTC, la TVA applicable au
                  livre est de 5,5 %, et le prix du livre est unique en
                  France (loi n° 81-766 du 10 août 1981).
                </p>
                <h3 className={H3_CLASS}>Commande et paiement</h3>
                <p className={LEGAL_BODY}>
                  Le paiement s&apos;effectue en ligne par carte bancaire via
                  Stripe, prestataire de paiement sécurisé. La commande
                  n&apos;est considérée comme définitive qu&apos;à réception
                  de la confirmation de paiement, qui fait office d&apos;accusé
                  de réception envoyé par email.
                </p>
                <h3 className={H3_CLASS}>Droit de rétractation</h3>
                <p className={LEGAL_BODY}>
                  Conformément aux articles L. 221-18 et suivants du code de
                  la consommation, vous disposez d&apos;un délai de 14 jours
                  à compter de la réception de votre commande pour exercer
                  votre droit de rétractation, sans avoir à justifier de
                  motifs ni à payer de pénalités autres que les frais de
                  retour.{" "}
                  <span className="italic text-ocher-text">
                    [À COMPLÉTER : modalités pratiques d&apos;exercice du
                    droit de rétractation — formulaire type, adresse de
                    retour, prise en charge des frais de retour]
                  </span>
                  .
                </p>
                <h3 className={H3_CLASS}>Livraison</h3>
                <p className={LEGAL_BODY}>
                  Les commandes sont expédiées en France métropolitaine, en
                  Belgique et en Suisse ; les frais de port sont calculés
                  selon le montant du panier et affichés avant paiement.{" "}
                  <span className="italic text-ocher-text">
                    [À COMPLÉTER : transporteur(s) retenu(s) et délais de
                    livraison indicatifs]
                  </span>
                  .
                </p>
                <h3 className={H3_CLASS}>Médiation de la consommation</h3>
                <p className={LEGAL_BODY}>
                  Conformément aux articles L. 616-1 et R. 616-1 du code de
                  la consommation, tout consommateur a le droit de recourir
                  gratuitement à un médiateur de la consommation en vue de
                  la résolution amiable d&apos;un litige. Le médiateur
                  compétent est{" "}
                  <span className="italic text-ocher-text">
                    [À COMPLÉTER : nom, adresse postale et site du médiateur
                    de la consommation]
                  </span>
                  .
                </p>
          </LegalSection>
        </>
      )}
    </>
  );
}

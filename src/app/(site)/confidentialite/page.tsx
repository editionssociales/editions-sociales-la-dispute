import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Breadcrumb } from "@/components/breadcrumb";
import { Eyebrow } from "@/components/eyebrow";
import { LegalCmsBody, LegalSection, LEGAL_BODY, LEGAL_LINK } from "@/components/legal-section";
import { getPagesLegales } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Confidentialité",
  description:
    "Politique de confidentialité des Éditions sociales x La Dispute : responsable de traitement, sous-traitants et droits RGPD.",
  alternates: { canonical: "/confidentialite" },
};

const H3_CLASS = "mt-6 font-sans text-lg font-black italic text-ink";

export default async function ConfidentialitePage() {
  // Global `pages-legales` : onglet rempli = corps entier (chapeau compris)
  // édité en back-office ; onglet vide = le JSX en dur ci-dessous.
  const { confidentialite } = await getPagesLegales();
  return (
    <>
      <Container className="bg-paper pb-16 pt-10 sm:pb-20 sm:pt-14">
        <Breadcrumb
          trail={[{ label: "Accueil", href: "/" }, { label: "Confidentialité" }]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <Eyebrow>
              Données personnelles
            </Eyebrow>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
              Politique de confidentialité
            </h1>
            {!confidentialite && (
              <p className={LEGAL_BODY}>
                Cette page décrit les traitements de données personnelles
                effectivement en place sur ce site, conformément au règlement
                (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.
              </p>
            )}
          </div>
        </Reveal>
      </Container>

      {confidentialite ? (
        <LegalCmsBody html={confidentialite} />
      ) : (
        <>
          {/* Responsable de traitement */}
          <LegalSection title="Responsable de traitement">
            <p className={LEGAL_BODY}>
              Le responsable du traitement des données collectées sur ce site
              est la structure éditrice identifiée dans les{" "}
              <Link href="/mentions-legales" className={LEGAL_LINK}>
                mentions légales
              </Link>
              .
            </p>
          </LegalSection>

          {/* Sous-traitants actifs */}
          <LegalSection title="Finalités et sous-traitants">
            <p className={LEGAL_BODY}>
              Seuls les traitements et prestataires effectivement actifs à ce
              jour sont listés ci-dessous. Cette page sera complétée à mesure
              que de nouveaux services seront déployés (statistiques de
              fréquentation, dons en ligne, lettre d&apos;information).
            </p>

            <h3 className={H3_CLASS}>Hébergement du site</h3>
            <p className={LEGAL_BODY}>
              Le site est hébergé par Vercel Inc. (États-Unis). Ce transfert
              hors de l&apos;Union européenne est encadré par des clauses
              contractuelles types adoptées par la Commission européenne.
            </p>

            <h3 className={H3_CLASS}>Police de caractères</h3>
            <p className={LEGAL_BODY}>
              La police Effra est chargée à l&apos;affichage depuis Adobe Fonts
              (Typekit), un service tiers qui peut recevoir l&apos;adresse IP du
              navigateur au moment du chargement de la ressource.
            </p>

            <h3 className={H3_CLASS}>Achat en ligne</h3>
            <p className={LEGAL_BODY}>
              La vente de nos livres est opérée sur la boutique
              boutique.editionssociales.fr, propulsée par WooCommerce. Les
              données liées à une commande (identité, adresse, paiement) sont
              traitées selon la politique de confidentialité propre à cette
              boutique, consultable sur ce site.
            </p>
          </LegalSection>

          {/* Droits */}
          <LegalSection title="Vos droits">
            <p className={LEGAL_BODY}>
              Conformément au RGPD, vous disposez d&apos;un droit
              d&apos;accès, de rectification, d&apos;effacement, de limitation
              et d&apos;opposition sur les données vous concernant. Pour
              exercer ces droits, contactez{" "}
              <span className="italic">[À COMPLÉTER : email de contact]</span>.
            </p>
            <p className={LEGAL_BODY}>
              Vous disposez également du droit d&apos;introduire une
              réclamation auprès de la Commission nationale de
              l&apos;informatique et des libertés (CNIL).
            </p>
          </LegalSection>
        </>
      )}
    </>
  );
}

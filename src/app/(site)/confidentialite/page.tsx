import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Breadcrumb } from "@/components/breadcrumb";

export const metadata: Metadata = {
  title: "Confidentialité",
  description:
    "Politique de confidentialité des Éditions sociales x La Dispute : responsable de traitement, sous-traitants et droits RGPD.",
  alternates: { canonical: "/confidentialite" },
};

const H2_CLASS =
  "font-sans text-2xl font-black italic leading-[0.98] text-black sm:text-3xl";
const H3_CLASS = "mt-6 font-sans text-lg font-black italic text-black";
const BODY_CLASS = "mt-4 text-[15px] leading-relaxed text-black/70";
const LINK_CLASS =
  "font-bold text-black underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-black hover:text-white";

export default function ConfidentialitePage() {
  return (
    <>
      <Container className="bg-white pb-16 pt-10 sm:pb-20 sm:pt-14">
        <Breadcrumb
          trail={[{ label: "Accueil", href: "/" }, { label: "Confidentialité" }]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
              Données personnelles
            </p>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
              Politique de confidentialité
            </h1>
            <p className={BODY_CLASS}>
              Cette page décrit les traitements de données personnelles
              effectivement en place sur ce site, conformément au règlement
              (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.
            </p>
          </div>
        </Reveal>
      </Container>

      {/* Responsable de traitement */}
      <section className="border-t-2 border-black">
        <Container className="py-12 sm:py-16">
          <h2 className={H2_CLASS}>Responsable de traitement</h2>
          <p className={BODY_CLASS}>
            Le responsable du traitement des données collectées sur ce site
            est la structure éditrice identifiée dans les{" "}
            <Link href="/mentions-legales" className={LINK_CLASS}>
              mentions légales
            </Link>
            .
          </p>
        </Container>
      </section>

      {/* Sous-traitants actifs */}
      <section className="border-t-2 border-black">
        <Container className="py-12 sm:py-16">
          <h2 className={H2_CLASS}>Finalités et sous-traitants</h2>
          <p className={BODY_CLASS}>
            Seuls les traitements et prestataires effectivement actifs à ce
            jour sont listés ci-dessous. Cette page sera complétée à mesure
            que de nouveaux services seront déployés (statistiques de
            fréquentation, dons en ligne, lettre d&apos;information).
          </p>

          <h3 className={H3_CLASS}>Hébergement du site</h3>
          <p className={BODY_CLASS}>
            Le site est hébergé par Vercel Inc. (États-Unis). Ce transfert
            hors de l&apos;Union européenne est encadré par des clauses
            contractuelles types adoptées par la Commission européenne.
          </p>

          <h3 className={H3_CLASS}>Police de caractères</h3>
          <p className={BODY_CLASS}>
            La police Effra est chargée à l&apos;affichage depuis Adobe Fonts
            (Typekit), un service tiers qui peut recevoir l&apos;adresse IP du
            navigateur au moment du chargement de la ressource.
          </p>

          <h3 className={H3_CLASS}>Achat en ligne</h3>
          <p className={BODY_CLASS}>
            La vente de nos livres est opérée sur la boutique
            boutique.editionssociales.fr, propulsée par WooCommerce. Les
            données liées à une commande (identité, adresse, paiement) sont
            traitées selon la politique de confidentialité propre à cette
            boutique, consultable sur ce site.
          </p>
        </Container>
      </section>

      {/* Droits */}
      <section className="border-t-2 border-black">
        <Container className="py-12 sm:py-16">
          <h2 className={H2_CLASS}>Vos droits</h2>
          <p className={BODY_CLASS}>
            Conformément au RGPD, vous disposez d&apos;un droit
            d&apos;accès, de rectification, d&apos;effacement, de limitation
            et d&apos;opposition sur les données vous concernant. Pour
            exercer ces droits, contactez{" "}
            <span className="italic">[À COMPLÉTER : email de contact]</span>.
          </p>
          <p className={BODY_CLASS}>
            Vous disposez également du droit d&apos;introduire une
            réclamation auprès de la Commission nationale de
            l&apos;informatique et des libertés (CNIL).
          </p>
        </Container>
      </section>
    </>
  );
}

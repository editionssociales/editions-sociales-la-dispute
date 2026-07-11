import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Breadcrumb } from "@/components/breadcrumb";

export const metadata: Metadata = {
  title: "Conditions générales & conditions de don",
  description:
    "Conditions générales de vente et conditions de don des Éditions sociales x La Dispute.",
  alternates: { canonical: "/cgv" },
};

const H2_CLASS =
  "font-sans text-2xl font-black italic leading-[0.98] text-black sm:text-3xl";
const BODY_CLASS = "mt-4 text-[15px] leading-relaxed text-black/70";
const LINK_CLASS =
  "font-bold text-black underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-black hover:text-white";

export default function CgvPage() {
  return (
    <>
      <Container className="bg-white pb-16 pt-10 sm:pb-20 sm:pt-14">
        <Breadcrumb
          trail={[
            { label: "Accueil", href: "/" },
            { label: "Conditions générales & conditions de don" },
          ]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
              Dons et vente en ligne
            </p>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
              Conditions générales &amp; conditions de don
            </h1>
            <p className={BODY_CLASS}>
              Ce site ne propose pas encore de vente en ligne native : il
              relaie les dons de la campagne en cours et renvoie vers la
              boutique existante pour tout achat.
            </p>
          </div>
        </Reveal>
      </Container>

      {/* Dons */}
      <section className="border-t-2 border-black">
        <Container className="py-12 sm:py-16">
          <h2 className={H2_CLASS}>Conditions de don</h2>
          <p className={BODY_CLASS}>
            Un don est un soutien libre à l&apos;activité des Éditions
            sociales et de La Dispute : il ne constitue ni un achat, ni une
            commande, et n&apos;ouvre droit à aucune contrepartie
            commerciale au sens du droit de la consommation.
          </p>
          <p className={BODY_CLASS}>
            Le don n&apos;étant pas un contrat de vente à distance, le droit
            de rétractation de 14 jours prévu par le code de la consommation
            ne s&apos;applique pas. Le dispositif de don en ligne n&apos;est
            pas encore opérationnel sur ce site : une fois en service, un
            email de confirmation sera envoyé à la suite de chaque don,
            faisant office de reçu.
          </p>
          <p className={BODY_CLASS}>
            La possibilité de délivrer un reçu fiscal ouvrant droit à
            réduction d&apos;impôt dépend du statut juridique de la
            structure, en cours de confirmation : aucun reçu fiscal
            n&apos;est promis à ce stade. Cette page sera mise à jour dès que
            ce statut sera arrêté.
          </p>
        </Container>
      </section>

      {/* Vente */}
      <section className="border-t-2 border-black">
        <Container className="py-12 sm:py-16">
          <h2 className={H2_CLASS}>Conditions de vente</h2>
          <p className={BODY_CLASS}>
            La vente en ligne de nos livres est opérée sur la boutique{" "}
            <a
              href="https://boutique.editionssociales.fr"
              className={LINK_CLASS}
              target="_blank"
              rel="noreferrer"
            >
              boutique.editionssociales.fr
            </a>
            , dont les conditions générales de vente propres s&apos;appliquent
            à toute commande.
          </p>
          <p className={BODY_CLASS}>
            Pour mémoire : les prix affichés sont TTC, la TVA applicable au
            livre est de 5,5 %, et le prix du livre est unique en France
            (loi n° 81-766 du 10 août 1981).
          </p>
          <p className={BODY_CLASS}>
            Les conditions générales de vente complètes (droit de
            rétractation, médiateur de la consommation, livraison) seront
            publiées lorsque la vente en ligne sera opérée directement sur
            ce site.
          </p>
        </Container>
      </section>
    </>
  );
}

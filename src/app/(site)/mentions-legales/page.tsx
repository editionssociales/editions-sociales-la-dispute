import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Breadcrumb } from "@/components/breadcrumb";
import { Eyebrow } from "@/components/eyebrow";
import { LegalSection, LEGAL_BODY, LEGAL_LINK } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales des Éditions sociales x La Dispute.",
  alternates: { canonical: "/mentions-legales" },
};

/** Ligne d'identité (libellé + valeur), certaines encore en placeholder client. */
function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-t-2 border-black bg-white px-4 py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-56 shrink-0 font-sans text-xs font-bold uppercase tracking-[.06em] text-black/50">
        {label}
      </dt>
      <dd className="text-sm text-black">{value}</dd>
    </div>
  );
}

export default function MentionsLegalesPage() {
  return (
    <>
      <Container className="bg-white pb-16 pt-10 sm:pb-20 sm:pt-14">
        <Breadcrumb
          trail={[{ label: "Accueil", href: "/" }, { label: "Mentions légales" }]}
        />
        <Reveal>
          <div className="mt-6 max-w-3xl">
            <Eyebrow>
              Éditeur, hébergement, propriété
            </Eyebrow>
            <h1 className="mt-3 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
              Mentions légales
            </h1>
            <p className={LEGAL_BODY}>
              Conformément à l&apos;article 6-III de la loi n° 2004-575 du 21
              juin 2004 pour la confiance dans l&apos;économie numérique
              (LCEN).
            </p>
          </div>
        </Reveal>
      </Container>

      {/* Éditeur du site */}
      <LegalSection title="Éditeur du site">
        <dl className="mt-6 border-2 border-black">
          <IdentityRow label="Raison sociale" value="[À COMPLÉTER : raison sociale]" />
          <IdentityRow
            label="Forme juridique"
            value="[À COMPLÉTER : forme juridique — SARL / association]"
          />
          <IdentityRow label="Siège social" value="[À COMPLÉTER : adresse du siège social]" />
          <IdentityRow label="SIRET" value="[À COMPLÉTER : SIRET]" />
          <IdentityRow
            label="RCS"
            value="[À COMPLÉTER : n° RCS et ville d'immatriculation, le cas échéant]"
          />
          <IdentityRow
            label="Capital social"
            value="[À COMPLÉTER : capital social, le cas échéant]"
          />
          <IdentityRow
            label="N° TVA intracommunautaire"
            value="[À COMPLÉTER : n° TVA intracommunautaire]"
          />
          <IdentityRow
            label="Directeur de la publication"
            value="[À COMPLÉTER : nom du directeur de la publication]"
          />
          <IdentityRow label="Contact" value="[À COMPLÉTER : email de contact et téléphone]" />
        </dl>
      </LegalSection>

      {/* Hébergement */}
      <LegalSection title="Hébergement">
        <p className={LEGAL_BODY}>
          Le site est hébergé par Vercel Inc.,{" "}
          <span className="italic">
            [ADRESSE LÉGALE VERCEL — vérifier sur vercel.com/legal au moment
            de la rédaction]
          </span>
          .
        </p>
        <p className={LEGAL_BODY}>
          Pendant la période de transition, certains médias (images de
          couverture, documents PDF) restent servis par OVH SAS, 2 rue
          Kellermann, 59100 Roubaix.
        </p>
      </LegalSection>

      {/* Contact */}
      <LegalSection title="Contact">
        <p className={LEGAL_BODY}>
          Pour toute question relative au site ou à son contenu :{" "}
          <span className="italic">[À COMPLÉTER : email de contact]</span>.
        </p>
      </LegalSection>

      {/* Propriété intellectuelle */}
      <LegalSection title="Propriété intellectuelle">
        <p className={LEGAL_BODY}>
          L&apos;ensemble des éléments présents sur ce site (textes,
          couvertures, illustrations, mise en page, logos) est protégé au
          titre du droit d&apos;auteur et du droit des marques. Toute
          reproduction, représentation ou diffusion, totale ou partielle,
          sans autorisation préalable est interdite, sauf mention contraire
          ou usage strictement personnel.
        </p>
        <p className={LEGAL_BODY}>
          Voir aussi la{" "}
          <Link href="/confidentialite" className={LEGAL_LINK}>
            politique de confidentialité
          </Link>{" "}
          et les{" "}
          <Link href="/cgv" className={LEGAL_LINK}>
            conditions générales &amp; conditions de don
          </Link>
          .
        </p>
      </LegalSection>
    </>
  );
}

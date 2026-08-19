import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHero } from "@/components/page-hero";
import { LegalCmsBody, LegalSection, LEGAL_BODY, LEGAL_LINK } from "@/components/legal-section";
import { getPagesLegales } from "@/lib/site-content";
import { buildMailto, CONTACT_EMAIL } from "@/lib/contact-address";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales des Éditions sociales x La Dispute.",
  alternates: { canonical: "/mentions-legales" },
};

/**
 * Ligne d'identité (libellé + valeur) — une valeur non encore renseignée est
 * distinguée visuellement (`italic text-ocher-text`, R6/5.2) pour que
 * l'inachevé se voie comme un état, pas comme une donnée réelle.
 * `placeholder` est un booléen EXPLICITE posé par l'appelant (issue #91) —
 * jamais dérivé d'une comparaison de chaîne (`.startsWith("[À COMPLÉTER")`
 * cassait silencieusement au moindre reformulage du texte français).
 */
function IdentityRow({
  label,
  value,
  placeholder = false,
}: {
  label: string;
  value: string;
  placeholder?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-t-2 border-ink bg-paper px-4 py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-56 shrink-0 font-sans text-xs font-bold uppercase tracking-[.06em] text-muted">
        {label}
      </dt>
      <dd className={placeholder ? "text-sm italic text-ocher-text" : "text-sm text-ink"}>
        {value}
      </dd>
    </div>
  );
}

export default async function MentionsLegalesPage() {
  // Global `pages-legales` : onglet rempli = corps entier (chapeau compris)
  // édité en back-office ; onglet vide = le JSX en dur ci-dessous, avec
  // l'identité légale de l'éditeur (raison sociale, SIRET, RCS…).
  const { mentionsLegales } = await getPagesLegales();
  return (
    <>
      <Container className="bg-paper py-12 sm:py-16">
        <PageHero
          title="Mentions légales"
          intro={
            !mentionsLegales &&
            "Conformément à l'article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN)."
          }
        />
      </Container>

      {mentionsLegales ? (
        <LegalCmsBody html={mentionsLegales} />
      ) : (
        <>
          {/* Éditeur du site */}
          <LegalSection title="Éditeur du site">
            <dl className="mt-6 border-2 border-ink">
              <IdentityRow label="Raison sociale" value="LA DISPUTE EDITIONS SOCIALES" />
              <IdentityRow label="Forme juridique" value="SARL (société à responsabilité limitée)" />
              <IdentityRow label="Siège social" value="73 rue Pixérécourt, 75020 Paris" />
              <IdentityRow label="SIRET" value="414 271 981 00014" />
              <IdentityRow label="RCS" value="RCS Paris 414 271 981" />
              <IdentityRow label="Capital social" value="7 622,45 €" />
              <IdentityRow label="N° TVA intracommunautaire" value="FR60 414 271 981" />
              <IdentityRow label="Directrice de la publication" value="Antonia Naim (gérante)" />
              <IdentityRow label="Contact" value={CONTACT_EMAIL} />
            </dl>
          </LegalSection>

          {/* Hébergement */}
          <LegalSection title="Hébergement">
            <p className={LEGAL_BODY}>
              Le site est hébergé par Vercel Inc., 440 N Barranca Avenue #4133,
              Covina, CA 91723, États-Unis.
            </p>
            <p className={LEGAL_BODY}>
              Les médias (images de couverture, documents PDF) sont stockés sur
              l&apos;infrastructure de Vercel Inc. La base de données du
              catalogue et des commandes est hébergée par Neon Inc. dans un
              centre de données situé dans l&apos;Union européenne (Francfort,
              Allemagne).
            </p>
          </LegalSection>

          {/* Contact */}
          <LegalSection title="Contact">
            <p className={LEGAL_BODY}>
              Pour toute question relative au site ou à son contenu :{" "}
              <a href={buildMailto().href} className={LEGAL_LINK}>
                {CONTACT_EMAIL}
              </a>
              .
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
      )}
    </>
  );
}

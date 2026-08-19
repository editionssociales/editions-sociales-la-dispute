import { buildMailto } from "@/lib/contact-address";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

/**
 * Une LIGNE — jamais un bloc — donnant l'adresse publique de la maison, en
 * clair et cliquable. Posée là où quelqu'un peut rester sans réponse : les
 * pages de remerciement d'un don et d'une commande (aucun e-mail ne part tant
 * que Brevo n'est pas provisionné) et, sous une autre forme, le pied de page.
 *
 * Indépendante de Brevo par construction : c'est un chemin humain, pas un
 * envoi — elle ne change pas d'état selon le provisioning. L'objet
 * pré-rempli (`subject`) est l'affaire de l'appelant : la page sait de quoi
 * on lui écrira, ce composant non.
 *
 * Composant serveur de pure présentation (`src/components/CLAUDE.md`) :
 * l'adresse et le lien viennent de `@/lib/contact-address`, source unique.
 */

const LINK_CLASS =
  "font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper " +
  FOCUS_RING_LIGHT_OUTER;

export function ContactLine({
  subject,
  lead = "Une question ?",
  className = "",
}: {
  /** Objet pré-rempli du `mailto:` — le contexte de la page qui appelle. */
  subject?: string;
  /** Amorce de la phrase, adaptable au contexte (don, commande…). */
  lead?: string;
  className?: string;
}) {
  const { href, address } = buildMailto({ subject });

  return (
    <p className={`font-sans text-sm leading-relaxed text-muted ${className}`}>
      {lead} Écrivez-nous à{" "}
      <a href={href} className={LINK_CLASS}>
        {address}
      </a>
      .
    </p>
  );
}

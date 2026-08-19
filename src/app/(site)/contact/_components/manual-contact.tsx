import { Button } from "@/components/button";
import { buildMailto, CONTACT_EMAIL } from "@/lib/contact-address";
import { DEFAULT_SUBJECT } from "@/lib/contact-form";

/**
 * Chemin manuel de /contact — rendu À LA PLACE du formulaire quand la chaîne
 * e-mail n'est pas provisionnée (`brevoConfigured()` faux au rendu de la
 * page). Un formulaire dont l'envoi ne peut aboutir nulle part est un CTA
 * muet (R7) : il encaisse une saisie et la jette en silence. Ici, tout ce
 * qu'on peut promettre est tenu — l'adresse en clair (copiable, lisible sans
 * JS ni client de messagerie configuré) ET un lien `mailto:` à objet
 * pré-rempli.
 *
 * Aucune mention Brevo : rien n'est transmis à un sous-traitant sur ce
 * chemin, la mention RGPD du formulaire n'aurait plus d'objet.
 *
 * Module colocalisé privé (`src/app/CLAUDE.md`), serveur — rien à hydrater.
 */
export function ManualContact() {
  const { href } = buildMailto({ subject: DEFAULT_SUBJECT });

  return (
    <div className="flex flex-col gap-4 border-2 border-ink bg-paper-2 p-6 sm:p-7">
      <p className="font-sans text-sm leading-relaxed text-ink">
        L&apos;envoi de messages depuis le site n&apos;est pas encore en
        service. Écrivez-nous directement — c&apos;est la même boîte, relevée
        par les deux maisons.
      </p>
      <p className="break-words font-sans text-base font-black leading-tight text-ink">
        {CONTACT_EMAIL}
      </p>
      <Button href={href} className="w-fit px-6 py-3 text-sm tracking-[.03em]">
        Nous écrire par e-mail
      </Button>
    </div>
  );
}

/**
 * Adresse publique de contact + construction des liens `mailto:` — SOURCE
 * UNIQUE (règle « single-source-of-truth », `src/lib/CLAUDE.md`) : personne ne
 * réécrit l'adresse ni n'assemble un `mailto:` à la main ailleurs.
 *
 * **Pourquoi une constante DURE, et non une variable d'environnement.** Ce
 * module est le repli du jour où la chaîne e-mail (Brevo) n'est pas
 * provisionnée : une adresse lue dans la configuration disparaîtrait
 * précisément le jour où la configuration manque — le repli s'évanouirait avec
 * ce qu'il doit rattraper. `CONTACT_TO_EMAIL` (env, `env.ts`) reste ce qu'elle
 * est : une DESTINATION DE ROUTAGE de l'envoi transactionnel, chiffrée côté
 * Vercel — jamais une adresse à publier. Changer l'adresse publique est un
 * geste éditorial rare : il passe par cette ligne et un déploiement, ce qui le
 * rend relisable en revue plutôt qu'invisible dans un panneau distant.
 *
 * Module PUR (aucun I/O, aucun `server-only`) : il est lu par des composants
 * serveur (pied de page, pages de remerciement, page /contact) comme par des
 * îlots client (`contact-form.tsx`, état d'erreur), et par la vue back-office
 * `/admin/sante`.
 */

/**
 * Boîte OVH réellement relevée par la maison, et adresse que l'ancien site
 * public affichait. Les deux maisons (Éditions sociales ET La Dispute)
 * relèvent leur courrier ici : `ladispute.fr` n'a AUCUNE boîte — ne jamais
 * inventer une adresse sur ce domaine.
 */
export const CONTACT_EMAIL = "ecrire@editionssociales.fr";

/**
 * Longueur maximale retenue pour une URL `mailto:` — au-delà, les clients de
 * messagerie et les navigateurs tronquent ou refusent silencieusement le lien
 * (aucune limite normative : ~2000 caractères est le plancher historique des
 * implémentations, on garde une marge). Un lien plus long n'est pas « moins
 * pratique », il est CASSÉ : d'où la troncature explicite, doublée de
 * l'adresse en clair côté rendu.
 */
export const MAILTO_MAX_LENGTH = 1800;

/**
 * Marque de troncature ajoutée au corps raccourci — dit au destinataire ET à
 * l'expéditeur que le texte a été coupé, plutôt que de laisser croire à un
 * message complet qui s'arrête au milieu d'une phrase.
 */
export const TRUNCATION_MARK = "\n\n[…] (message raccourci — la fin n'a pas tenu dans le lien)";

/** Objet pré-rempli de l'invitation à s'inscrire à la lettre d'information (repli sans Brevo). */
export const NEWSLETTER_MAILTO_SUBJECT = "Inscription à la lettre d'information";

export interface MailtoLink {
  /** `href` prêt à poser sur un `<a>` — toujours sous `MAILTO_MAX_LENGTH`. */
  href: string;
  /** L'adresse en clair, à AFFICHER à côté du lien (un `mailto:` ne s'ouvre pas partout). */
  address: string;
  /** `true` si le corps a dû être raccourci : le rendu doit alors inviter à copier l'adresse plutôt qu'à se fier au seul lien. */
  truncated: boolean;
}

function query(subject: string, body: string): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return params.length > 0 ? `?${params.join("&")}` : "";
}

/**
 * Recule sur une frontière de MOT quand c'est possible — une coupure au
 * milieu d'un mot se lit comme une corruption, pas comme une troncature.
 * Ne recule jamais au point de vider le corps (garde au moins la moitié du
 * budget trouvé).
 */
function cutOnWordBoundary(body: string, limit: number): string {
  const head = body.slice(0, limit);
  const space = head.search(/\s+\S*$/);
  return space > limit / 2 ? head.slice(0, space) : head;
}

/**
 * Construit le lien `mailto:` vers l'adresse publique, objet et corps
 * pré-remplis et correctement encodés. Ne jette jamais.
 *
 * Seul le CORPS est tronquable : l'objet est court par construction (borné à
 * `SUBJECT_MAX_LENGTH`, `contact-form.ts`) et le perdre rendrait le message
 * illisible côté boîte de réception. Cas dégénéré prévu quand même (objet
 * démesuré) : on retombe sur un lien nu vers l'adresse, jamais sur une URL
 * hors limite.
 */
export function buildMailto({ subject = "", body = "" }: { subject?: string; body?: string } = {}): MailtoLink {
  const base = `mailto:${CONTACT_EMAIL}`;
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();

  const full = `${base}${query(cleanSubject, cleanBody)}`;
  if (full.length <= MAILTO_MAX_LENGTH) {
    return { href: full, address: CONTACT_EMAIL, truncated: false };
  }

  // Recherche dichotomique du plus grand préfixe de corps qui tient, marque de
  // troncature comprise (l'encodage n'étant pas linéaire en nombre de
  // caractères — un accent vaut 9 caractères une fois encodé).
  let low = 0;
  let high = cleanBody.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${base}${query(cleanSubject, cleanBody.slice(0, mid) + TRUNCATION_MARK)}`;
    if (candidate.length <= MAILTO_MAX_LENGTH) low = mid;
    else high = mid - 1;
  }

  if (low <= 0) {
    // Même sans corps, l'en-tête ne tient pas : objet démesuré → lien nu.
    const withSubjectOnly = `${base}${query(cleanSubject, "")}`;
    return {
      href: withSubjectOnly.length <= MAILTO_MAX_LENGTH ? withSubjectOnly : base,
      address: CONTACT_EMAIL,
      truncated: true,
    };
  }

  const kept = cutOnWordBoundary(cleanBody, low);
  return {
    href: `${base}${query(cleanSubject, kept + TRUNCATION_MARK)}`,
    address: CONTACT_EMAIL,
    truncated: true,
  };
}

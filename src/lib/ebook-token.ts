import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lien de téléchargement d'un livre numérique après achat (client
 * 2026-08-24 ; arbitrage du fil : « Un lien par mail ça irait tu penses ?
 * Pcq on n'a pas de gestion de compte client » → « oui, c'est parfait »).
 *
 * Le jeton porte DEUX faits et rien d'autre : quelle commande, quel livre.
 * Il ne prouve pas le droit à lui seul — la route de téléchargement relit la
 * commande et vérifie qu'elle est bien payée et qu'elle contient bien ce
 * livre (`ebook-download.ts`). Le jeton n'est donc qu'une capacité SIGNÉE :
 * impossible à forger, mais révoquée d'office si la commande est annulée ou
 * remboursée. C'est aussi ce qui permet de remplacer le fichier sans casser
 * les liens déjà envoyés (le jeton désigne le livre, jamais le fichier).
 *
 * Pas de date d'expiration, volontairement : un achat ne périme pas, et une
 * expiration ne ferait que produire des liens morts dans de vieux e-mails
 * (support pour l'équipe) sans rien protéger de plus — le lien est déjà un
 * porteur (« bearer »), exactement comme l'était le lien WooCommerce
 * historique. Révocation possible à tout moment : annuler/rembourser la
 * commande, ou faire tourner `PAYLOAD_SECRET` (invalide TOUS les liens).
 *
 * Module PUR (aucune I/O, aucun accès à `process.env` — le secret est un
 * argument) : testable directement, et utilisable des deux côtés, envoi
 * (webhook) comme vérification (route).
 */

/**
 * Sépare la clé de signature du secret Payload : `PAYLOAD_SECRET` sert déjà
 * aux JWT du back-office — dériver une sous-clé par usage évite qu'un jeton
 * d'un domaine puisse jamais être confondu avec un jeton de l'autre.
 */
const PURPOSE = "ebook-download-v1";

/** Longueur de signature conservée (caractères base64url) — 32 caractères ≈ 192 bits, très au-delà du forçage brut d'un lien. */
const SIGNATURE_LENGTH = 32;

function signature(secret: string, payload: string): string {
  const key = createHmac("sha256", secret).update(PURPOSE).digest();
  return createHmac("sha256", key).update(payload).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

/** Comparaison à temps constant de deux signatures (jamais `===` sur un secret dérivé). */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface EbookGrant {
  orderId: number;
  bookId: number;
}

/**
 * Jeton opaque `<commande>.<livre>.<signature>` — sûr en URL, lisible dans un
 * log de support. Séparateur `.` et non `-` : l'alphabet base64url de la
 * signature CONTIENT `-` (et `_`), un découpage sur `-` serait ambigu.
 */
export function signEbookToken(secret: string, grant: EbookGrant): string {
  const payload = `${grant.orderId}.${grant.bookId}`;
  return `${payload}.${signature(secret, payload)}`;
}

/**
 * Relit un jeton — `null` sur toute anomalie (forme, ids non entiers,
 * signature fausse), jamais d'exception : l'appelant rend une page « lien
 * invalide » honnête, pas une erreur 500.
 */
export function verifyEbookToken(secret: string, token: string): EbookGrant | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawOrderId, rawBookId, received] = parts;
  const orderId = Number(rawOrderId);
  const bookId = Number(rawBookId);
  if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(bookId)) return null;
  if (orderId <= 0 || bookId <= 0) return null;
  // Re-signe à partir des ids REPARSÉS, pas des chaînes brutes : « 007 » et
  // « 7 » ne doivent pas produire deux jetons valides pour la même commande.
  if (`${orderId}` !== rawOrderId || `${bookId}` !== rawBookId) return null;
  if (!signatureMatches(signature(secret, `${orderId}.${bookId}`), received)) return null;
  return { orderId, bookId };
}

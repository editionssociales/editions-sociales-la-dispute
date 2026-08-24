import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import config from "@payload-config";
import { getPayload } from "payload";
import { verifyEbookToken } from "./ebook-token";

/**
 * Seam du téléchargement d'un livre numérique après achat (client
 * 2026-08-24) — la SEULE porte d'entrée du fichier pour le public.
 *
 * Le jeton du lien (`ebook-token.ts`) dit « commande X, livre Y » ; il ne
 * donne aucun droit à lui seul. C'est ici que le droit est VÉRIFIÉ, contre la
 * base : la commande existe, elle n'est ni annulée ni remboursée ni en échec,
 * et elle contient bien ce livre. Un remboursement révoque donc le lien sans
 * qu'on ait rien à faire.
 *
 * Le fichier lui-même n'est jamais servi par son adresse de stockage : la
 * collection `ebooks` garde l'access control Payload (`Ebooks.ts`), et
 * `readEbookFile` relit les octets côté serveur (Blob en prod, disque en dev)
 * pour que la route les renvoie elle-même. Aucune URL de stockage ne sort
 * jamais du serveur.
 */

/** Pourquoi un lien ne donne rien — cas fonctionnels, jamais des erreurs techniques (celles-là remontent en exception). */
export type EbookDownloadRefusal =
  /** Jeton illisible, tronqué, ou signature fausse (lien recopié à moitié depuis un e-mail, lien forgé). */
  | "lien-invalide"
  /** Commande, livre ou fichier disparus depuis l'envoi du lien. */
  | "introuvable"
  /** Commande annulée, remboursée ou en échec de paiement — le droit n'existe plus. */
  | "revoquee";

export interface EbookDownloadGrant {
  bookTitle: string;
  /** Nom du fichier tel que téléversé — sert de nom de fichier au téléchargement. */
  filename: string;
  mimeType: string;
  /** Octets, quand Payload le connaît — affiché à l'acheteur·euse avant le clic. */
  filesize: number | null;
}

/** Statuts de commande qui donnent droit au fichier — le paiement a eu lieu et n'a pas été défait (`Orders.ts:status`). */
const STATUTS_QUI_DONNENT_DROIT = new Set(["paid", "prepared", "shipped"]);

/**
 * Vérifie un lien de téléchargement de bout en bout. Ne jette que sur une
 * panne réelle (base injoignable) : tout le reste ressort en refus nommé, que
 * la page et la route traduisent en message honnête.
 */
export async function authorizeEbookDownload(
  secret: string,
  token: string,
): Promise<EbookDownloadGrant | { refus: EbookDownloadRefusal }> {
  const grant = verifyEbookToken(secret, token);
  if (!grant) return { refus: "lien-invalide" };

  const payload = await getPayload({ config });

  const order = await payload
    .findByID({
      collection: "orders",
      id: grant.orderId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  if (!order) return { refus: "introuvable" };
  if (!STATUTS_QUI_DONNENT_DROIT.has(order.status)) return { refus: "revoquee" };

  // `depth: 0` → `line.book` est l'id brut. La commande DOIT contenir le
  // livre du jeton : sans cette vérification, un jeton valide pour une
  // commande donnerait accès à n'importe quel titre.
  const ligne = (order.lines ?? []).find((line) =>
    typeof line.book === "number" ? line.book === grant.bookId : line.book?.id === grant.bookId,
  );
  if (!ligne) return { refus: "introuvable" };

  // Le fichier est rattaché au titre côté `ebooks` (`Ebooks.ts`), un seul par
  // titre (`unique`) — d'où `limit: 1` sans tri : il n'y a rien à départager.
  const { docs } = await payload.find({
    collection: "ebooks",
    where: { livre: { equals: grant.bookId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  });
  const fichier = docs[0];
  if (!fichier?.filename) return { refus: "introuvable" };

  return {
    // Titre TEL QU'ACHETÉ : le snapshot de la commande, comme l'e-mail de
    // confirmation — jamais une relecture de la fiche livre (qui a pu être
    // renommée, dépubliée, ou supprimée depuis l'achat).
    bookTitle: ligne.titleSnapshot,
    filename: fichier.filename,
    mimeType: fichier.mimeType ?? "application/octet-stream",
    filesize: typeof fichier.filesize === "number" ? fichier.filesize : null,
  };
}

/**
 * Hostname public du store Vercel Blob — dérivé du token, MÊME parsing que le
 * plugin `storage-vercel-blob` et que `next.config.ts` (qui l'épingle dans
 * `images.remotePatterns`). `null` sans token : stockage local (dev).
 */
function blobBaseUrl(): string | null {
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([a-z\d]+)_/i)?.[1];
  return storeId ? `https://${storeId}.public.blob.vercel-storage.com` : null;
}

/**
 * Relit les octets du fichier — Blob en prod, disque en dev (le dossier
 * `ebooks/` à la racine du dépôt, gitignoré : MÊME chemin que
 * `Ebooks.upload.staticDir`). `null` si le fichier a disparu du stockage
 * (fiche qui pointe dans le vide) : l'appelant rend un refus « introuvable »
 * plutôt qu'une réponse vide.
 *
 * `cache: "no-store"` : un fichier de plusieurs mégaoctets n'a rien à faire
 * dans le Data Cache de Next (limite de taille, et le trafic est rare).
 */
export async function readEbookFile(filename: string): Promise<Uint8Array | null> {
  const base = blobBaseUrl();
  if (base) {
    const res = await fetch(`${base}/${encodeURIComponent(filename)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  try {
    // `path.basename` : le nom vient de la base, mais il termine dans un
    // chemin de fichier — jamais de `../` qui remonterait hors du dossier.
    return await readFile(path.join(process.cwd(), "ebooks", path.basename(filename)));
  } catch {
    return null;
  }
}

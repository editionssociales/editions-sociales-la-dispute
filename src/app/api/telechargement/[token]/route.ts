import * as Sentry from "@sentry/nextjs";
import { authorizeEbookDownload, readEbookFile } from "@/lib/ebook-download";

/**
 * `GET /api/telechargement/[token]` — renvoie le fichier numérique d'un
 * achat (client 2026-08-24). Cible du bouton de la page
 * `/telechargement/[token]`, qui a déjà vérifié le même jeton pour
 * l'afficher : la vérification est REFAITE ici, intégralement — cette route
 * est publique, elle ne peut rien tenir pour acquis de la page qui y mène.
 *
 * Un refus renvoie vers la page, qui l'explique en français plutôt qu'en
 * code HTTP nu (lien à moitié recopié depuis un e-mail, commande remboursée).
 * Le fichier est renvoyé PAR NOUS : ni redirection vers le stockage, ni URL
 * signée exposée — l'adresse du fichier ne quitte jamais le serveur.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    // `env.ts` la rend obligatoire au boot : si elle manque ici, c'est une
    // panne de configuration, pas un lien invalide — jamais un 404 trompeur.
    Sentry.captureMessage("[telechargement] PAYLOAD_SECRET absente — lien de téléchargement invérifiable");
    return new Response("Téléchargement momentanément indisponible.", { status: 503 });
  }

  const grant = await authorizeEbookDownload(secret, token);
  if ("refus" in grant) {
    return Response.redirect(new URL(`/telechargement/${encodeURIComponent(token)}`, _req.url), 303);
  }

  const bytes = await readEbookFile(grant.filename);
  if (!bytes) {
    // Fiche qui pointe vers un fichier disparu du stockage : anomalie de
    // données, pas un droit refusé — tracée, et l'acheteur·euse retombe sur
    // la page qui donne l'adresse de contact.
    Sentry.captureMessage(`[telechargement] fichier introuvable au stockage : ${grant.filename}`);
    return Response.redirect(new URL(`/telechargement/${encodeURIComponent(token)}`, _req.url), 303);
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": grant.mimeType,
      "Content-Length": String(bytes.byteLength),
      // `filename*` (RFC 5987) : les titres sont accentués, un `filename=`
      // brut suffirait rarement. Le `filename=` ASCII reste en repli pour les
      // clients anciens.
      "Content-Disposition": `attachment; filename="${grant.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(grant.filename)}`,
      // Jamais dans un cache partagé : c'est le fichier d'UNE commande.
      "Cache-Control": "private, no-store",
    },
  });
}

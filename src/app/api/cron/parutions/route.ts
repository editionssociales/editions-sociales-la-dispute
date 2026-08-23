import { getAllBooks } from "@/lib/catalogue";
import { isoDayParis } from "@/lib/format";
import { findBookFichePaths } from "@/lib/order-source";
import { revalidateCatalogueNow } from "@/payload/hooks/revalidate.ts";

/**
 * Cron Vercel (`vercel.json` — 22 h 10 ET 23 h 10 UTC, pour tomber vers
 * 0 h 10 Paris été comme hiver) : la bascule « à paraître → paru » est
 * PUREMENT temporelle (`isUpcoming(publishedAt)` évalué au rendu — aucune
 * écriture ne la déclenche), or la fenêtre ISR n'est plus qu'un filet de 24 h
 * depuis l'audit coûts Vercel 2026-08-23. Sans cette purge planifiée, une
 * fiche rendue la veille afficherait « à paraître » presque toute sa journée
 * de parution — jour commercialement critique (précommandes).
 *
 * Purge sur-couvrante et idempotente à dessein : fiches dont `publishedAt`
 * est aujourd'hui OU hier (Paris) — la double exécution été/hiver et le
 * recouvrement d'un jour ne coûtent que quelques `revalidatePath` de plus.
 * `publishedAt` étant posé à l'avance sur la fiche, lire au travers du
 * data-cache (même périmé) suffit à identifier le lot.
 *
 * Gardé par `CRON_SECRET` (Vercel pose `Authorization: Bearer <CRON_SECRET>`
 * sur ses invocations quand la variable existe ; absente, tout est refusé) :
 * un appel public répété forcerait des re-rendus — précisément le coût que ce
 * cron sert à éviter.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const books = await getAllBooks();
  const today = isoDayParis(new Date());
  const yesterday = isoDayParis(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const justPublished = books.filter(
    (book) => book.publishedAt !== null && (book.publishedAt === today || book.publishedAt === yesterday),
  );

  const fichePaths = await findBookFichePaths(justPublished.map((book) => book.id));
  revalidateCatalogueNow(fichePaths);

  return Response.json({ revalidated: fichePaths.length });
}

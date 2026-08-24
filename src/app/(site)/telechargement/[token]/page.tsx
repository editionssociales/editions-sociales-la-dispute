import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { ContactLine } from "@/components/contact-line";
import { ACCENT_BG } from "@/lib/accents";
import { authorizeEbookDownload, type EbookDownloadRefusal } from "@/lib/ebook-download";

/**
 * Page `/telechargement/[token]` — la cible du lien envoyé dans l'e-mail de
 * confirmation quand la commande contient un titre à fichier numérique
 * (client 2026-08-24 : « pour les Notes sur Mill, on pouvait télécharger
 * l'epub après achat », arbitrage « un lien par mail » — le site n'a pas de
 * compte client).
 *
 * Une PAGE plutôt qu'un téléchargement direct depuis l'e-mail : un lien mort
 * (commande remboursée, lien recopié à moitié) doit dire ce qui se passe et à
 * qui écrire, pas rendre un code d'erreur nu au fond d'un client mail. Le
 * téléchargement lui-même est un clic de plus, sur
 * `/api/telechargement/[token]`, qui refait la même vérification.
 *
 * Jamais indexée (`robots`), jamais mise en cache : le contenu dépend d'un
 * droit qui peut être révoqué entre deux visites.
 */
export const metadata: Metadata = {
  title: "Votre exemplaire numérique",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Message honnête par cas de refus — jamais « une erreur est survenue », toujours ce qui s'est passé et la suite. */
const REFUS: Record<EbookDownloadRefusal, { titre: string; texte: string }> = {
  "lien-invalide": {
    titre: "Ce lien n’est pas valide",
    texte:
      "Le lien semble incomplet — certains logiciels de messagerie coupent les adresses longues. Réessayez en copiant l’adresse entière depuis votre e-mail de confirmation.",
  },
  introuvable: {
    titre: "Ce téléchargement n’est plus disponible",
    texte:
      "Nous ne retrouvons pas le fichier associé à cette commande. Écrivez-nous : nous vous le renverrons.",
  },
  revoquee: {
    titre: "Ce téléchargement n’est plus actif",
    texte:
      "La commande liée à ce lien a été annulée ou remboursée. Si c’est une erreur, écrivez-nous.",
  },
};

/** Taille lisible — un ePub se compte en Mo, jamais en octets bruts. */
function formatTaille(octets: number | null): string | null {
  if (octets === null || octets <= 0) return null;
  const mo = octets / (1024 * 1024);
  return mo >= 1
    ? `${mo.toFixed(mo >= 10 ? 0 : 1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** Extension en majuscules (« EPUB », « PDF ») — dit à l'acheteur·euse ce qu'il ou elle va recevoir. */
function formatType(filename: string): string {
  const ext = filename.split(".").pop();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "Fichier";
}

export default async function TelechargementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const secret = process.env.PAYLOAD_SECRET;
  const grant = secret ? await authorizeEbookDownload(secret, token) : { refus: "introuvable" as const };

  if ("refus" in grant) {
    const { titre, texte } = REFUS[grant.refus];
    return (
      <>
        <div aria-hidden="true" className={`h-1.5 ${ACCENT_BG.brick}`} />
        <section className="bg-paper">
          <Container width="prose" className="py-20 sm:py-28">
            <PageHero tone="system" title={titre} intro={texte} />
            <ContactLine
              subject="Téléchargement de mon exemplaire numérique"
              lead="Écrivez-nous"
              className="mt-10"
            />
          </Container>
        </section>
      </>
    );
  }

  const taille = formatTaille(grant.filesize);

  return (
    <>
      <div aria-hidden="true" className={`h-1.5 ${ACCENT_BG.bottle}`} />
      <section className="bg-paper">
        <Container width="prose" className="py-20 sm:py-28">
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center border-2 border-ink ${ACCENT_BG.bottle}`}
          >
            <span aria-hidden="true" className="font-sans text-2xl font-black text-paper">
              ↓
            </span>
          </div>
          <PageHero
            tone="system"
            title="Votre exemplaire numérique"
            intro={
              <>
                <strong className="font-bold text-ink">{grant.bookTitle}</strong> — le fichier est à
                vous, sans limite de nombre de téléchargements. Conservez cet e-mail : le lien
                reste valable.
              </>
            }
          />

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              href={`/api/telechargement/${encodeURIComponent(token)}`}
              variant="solid"
              className="px-6 py-3 text-sm tracking-[.03em]"
            >
              Télécharger
            </Button>
            <p className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
              {formatType(grant.filename)}
              {taille ? ` · ${taille}` : ""}
            </p>
          </div>

          <ContactLine
            subject="Téléchargement de mon exemplaire numérique"
            lead="Un problème pour ouvrir le fichier ?"
            className="mt-10"
          />
        </Container>
      </section>
    </>
  );
}

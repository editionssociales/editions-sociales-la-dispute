import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { NewTabMark } from "@/components/new-tab-mark";
import { PageHero } from "@/components/page-hero";
import { NAV_HOUSES } from "@/lib/nav";
import { getPageNosMaisons } from "@/lib/site-content";
import type { NosMaisonsLien } from "@/lib/site-content-core";
import { FOCUS_RING_DARK, FOCUS_RING_INVERTING, FOCUS_RING_LIGHT } from "@/lib/ui";
import { youTubeEmbedUrl } from "@/lib/video";

/**
 * Page d'auto-promo « Nos maisons » (remplace la cellule « La GEME » de la
 * nav, client 2026-11) : texte, vidéos (interventions dans les médias),
 * articles (avec leur image de couverture), puis les deux maisons. Titre,
 * texte, vidéos et articles viennent du global `page-nos-maisons`
 * (`getPageNosMaisons`), lu SANS `revalidate` propre — purge à la demande par
 * `revalidatePageNosMaisonsAfterChange`, comme `/contact`. Une section vide
 * n'est pas rendue ; la page vide reste présentable (titre + cartes maisons).
 *
 * Mise en page calquée sur `/souscription` (retour client 2026-11 : trop de
 * vide, titres de section laids et rarement utiles) : intertitre FACULTATIF
 * (aucun par défaut) — quand il est saisi, bandeau plein à l'accent de la
 * section (palette pop), texte ink en capitales —,
 * corps en prose sobre dans une colonne de lecture, rythme vertical serré
 * (`mt-10 sm:mt-12`), cartes encadrées qui commencent à gauche. Les vidéos
 * défilent dans un rail NATIF (scroll-snap, aucun JS) aligné à gauche : plus
 * de première carte centrée par script, donc plus de vide ni de saut à
 * l'hydratation.
 */
export const metadata: Metadata = {
  title: "Nos maisons",
  description:
    "Les Éditions sociales et La Dispute — nos interventions dans les médias, nos articles et nos deux maisons.",
  alternates: { canonical: "/nos-maisons" },
};

const LIEN_META = "font-sans text-xs font-bold uppercase tracking-[.05em] text-ink-soft";
const SECTION = "mt-10 sm:mt-12";

/**
 * Intertitre de section — FACULTATIF (retour client 2026-11 : « pas besoin de
 * titres de sections 90 % du temps »). Saisi au back-office, il s'affiche en
 * bandeau plein à l'accent de la section, comme `RecitSection` de
 * `/souscription` (colonne `max-w-2xl`) ; vide, la région reste NOMMÉE pour
 * les lecteurs d'écran (`sr-only`) sans rien afficher.
 */
function Intertitre({
  id,
  bg,
  titre,
  repli,
}: {
  id: string;
  bg: string;
  titre: string | null;
  repli: string;
}) {
  if (!titre) {
    return (
      <h2 id={id} className="sr-only">
        {repli}
      </h2>
    );
  }
  return (
    <h2
      id={id}
      className={`mb-5 w-full max-w-2xl ${bg} px-4 py-3 font-sans text-[clamp(20px,3vw,28px)] font-black uppercase leading-[1.1] text-ink sm:px-6`}
    >
      {titre}
    </h2>
  );
}

function Legende({ lien }: { lien: NosMaisonsLien }) {
  return (
    <div className="flex flex-1 flex-col gap-1 p-4">
      {lien.media && <p className={LIEN_META}>{lien.media}</p>}
      <p className="font-sans text-base font-extrabold leading-snug text-ink">{lien.titre}</p>
      {lien.date && <p className={LIEN_META}>{lien.date}</p>}
    </div>
  );
}

function VideoCard({ video }: { video: NosMaisonsLien }) {
  const embed = youTubeEmbedUrl(video.url);
  return (
    <li className="flex w-[min(85vw,26rem)] flex-none snap-start flex-col border-2 border-ink bg-paper">
      {embed ? (
        <iframe
          src={embed}
          title={video.titre}
          className="aspect-video w-full border-b-2 border-ink"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        // URL non reconnue comme YouTube : carte-lien, jamais d'iframe cassée.
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className={`flex aspect-video w-full items-center justify-center border-b-2 border-ink bg-ink px-4 text-center font-sans text-sm font-bold uppercase tracking-[.05em] text-paper hover:bg-ink-soft ${FOCUS_RING_DARK}`}
        >
          <span>
            Voir la vidéo
            <NewTabMark />
          </span>
        </a>
      )}
      <Legende lien={video} />
    </li>
  );
}

function ArticleCard({ article }: { article: NosMaisonsLien }) {
  const { image } = article;
  return (
    <li className="bg-paper">
      <a
        href={article.url}
        target="_blank"
        rel="noreferrer"
        className={`flex h-full flex-col hover:bg-paper-2 ${FOCUS_RING_LIGHT}`}
      >
        {image && (
          // Image de couverture de l'article : recadrée en 16:10 (les visuels
          // de presse n'ont pas tous le même format) ; alt vide si le média
          // n'en porte pas — le titre juste dessous, dans le même lien, fait foi.
          <span className="relative block aspect-[16/10] w-full overflow-hidden border-b-2 border-ink bg-paper-2">
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 352px, (min-width: 640px) 45vw, 90vw"
              className="object-cover"
            />
          </span>
        )}
        <span className="flex flex-1 flex-col gap-1 p-4">
          {article.media && <span className={LIEN_META}>{article.media}</span>}
          <span className="font-sans text-base font-extrabold leading-snug text-ink underline decoration-1 underline-offset-2">
            {article.titre}
            <NewTabMark />
          </span>
          {article.date && <span className={LIEN_META}>{article.date}</span>}
        </span>
      </a>
    </li>
  );
}

/** Carte maison : à l'accent de la maison (orange La Dispute, bleu clair Éditions sociales — `lib/editions.ts`), ink au survol. Classes littérales (contrat JIT). */
const MAISON_CARD: Record<string, string> = {
  "/editions/la-dispute": "bg-pop-orange",
  "/editions/editions-sociales": "bg-pop-teal",
};

export default async function NosMaisonsPage() {
  const { titre, paragraphes, videos, articles, titreVideos, titreArticles, titreMaisons } =
    await getPageNosMaisons();

  return (
    <Container className="bg-paper pb-16 pt-10 sm:pb-20 sm:pt-12">
      <PageHero title={titre} className="max-w-3xl" />

      {paragraphes.length > 0 && (
        <div className="mt-5 max-w-[52ch] space-y-4 font-sans text-lg font-medium leading-relaxed text-ink">
          {paragraphes.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <section aria-labelledby="nos-maisons-videos" className={SECTION}>
          <Intertitre id="nos-maisons-videos" bg="bg-pop-teal" titre={titreVideos} repli="Vidéos" />
          {/* Rail natif : défilement tactile/trackpad/molette, accroche carte
              par carte, première carte collée à gauche. Le bord de la carte
              suivante dépasse — c'est l'indice de défilement. */}
          <ul
            className="-mx-5 flex snap-x snap-proximity scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] sm:-mx-8 sm:scroll-px-8 sm:px-8"
            aria-label="Carrousel des vidéos"
          >
            {videos.map((video, i) => (
              <VideoCard key={`${i}-${video.url}`} video={video} />
            ))}
          </ul>
        </section>
      )}

      {articles.length > 0 && (
        <section aria-labelledby="nos-maisons-articles" className={SECTION}>
          <Intertitre id="nos-maisons-articles" bg="bg-pop-pink" titre={titreArticles} repli="Articles" />
          <FramedGrid as="ul" className="sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article, i) => (
              <ArticleCard key={`${i}-${article.url}`} article={article} />
            ))}
          </FramedGrid>
        </section>
      )}

      <section aria-labelledby="nos-maisons-maisons" className={SECTION}>
        <Intertitre id="nos-maisons-maisons" bg="bg-pop-yellow" titre={titreMaisons} repli="Les deux maisons" />
        <FramedGrid className="sm:grid-cols-2">
          {NAV_HOUSES.map((h) => (
            <Link
              key={h.href}
              href={h.href}
              className={`flex min-h-28 items-end p-5 font-sans text-xl font-black italic leading-tight text-ink hover:bg-ink hover:text-paper ${MAISON_CARD[h.href] ?? "bg-paper"} ${FOCUS_RING_INVERTING}`}
            >
              {h.label}
            </Link>
          ))}
        </FramedGrid>
      </section>
    </Container>
  );
}

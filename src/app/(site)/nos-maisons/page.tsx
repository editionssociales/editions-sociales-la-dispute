import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { NewTabMark } from "@/components/new-tab-mark";
import { PageHero } from "@/components/page-hero";
import { ScrollRail, type ScrollRailItem } from "@/components/scroll-rail";
import { NAV_HOUSES } from "@/lib/nav";
import { getPageNosMaisons } from "@/lib/site-content";
import type { NosMaisonsLien } from "@/lib/site-content-core";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import { youTubeEmbedUrl } from "@/lib/video";

/**
 * Page d'auto-promo « Nos maisons » (remplace la cellule « La GEME » de la
 * nav, client 2026-11) : texte, carrousel de vidéos (interventions dans les
 * médias), articles, puis les deux maisons. Titre, texte, vidéos et articles
 * viennent du global `page-nos-maisons` (`getPageNosMaisons`), lu SANS
 * `revalidate` propre — purge à la demande par
 * `revalidatePageNosMaisonsAfterChange`, comme `/contact`. Une section vide
 * n'est pas rendue ; la page vide reste présentable (titre + cartes maisons).
 */
export const metadata: Metadata = {
  title: "Nos maisons",
  description:
    "Les Éditions sociales et La Dispute — nos interventions dans les médias, nos articles et nos deux maisons.",
  alternates: { canonical: "/nos-maisons" },
};

const LIEN_META = "font-sans text-xs font-bold uppercase tracking-[.05em] text-ink/70";

function VideoLegende({ video }: { video: NosMaisonsLien }) {
  return (
    <div className="p-4">
      <p className="font-sans text-base font-extrabold leading-snug text-ink">{video.titre}</p>
      {(video.media || video.date) && (
        <p className={`mt-1 ${LIEN_META}`}>
          {[video.media, video.date].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function videoItem(video: NosMaisonsLien, index: number): ScrollRailItem {
  const embed = youTubeEmbedUrl(video.url);
  return {
    key: `${index}-${video.url}`,
    label: video.titre,
    node: (
      <div className="flex h-full flex-col border-2 border-ink bg-paper">
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
            className={`flex aspect-video w-full items-center justify-center border-b-2 border-ink bg-ink px-4 text-center font-sans text-sm font-bold uppercase tracking-[.05em] text-paper hover:bg-navy ${FOCUS_RING_LIGHT}`}
          >
            <span>
              Voir la vidéo
              <NewTabMark />
            </span>
          </a>
        )}
        <VideoLegende video={video} />
      </div>
    ),
  };
}

export default async function NosMaisonsPage() {
  const { titre, paragraphes, videos, articles } = await getPageNosMaisons();

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <PageHero title={titre} className="max-w-3xl" />

      {paragraphes.length > 0 && (
        <div className="mt-8 flex max-w-3xl flex-col gap-4 text-[15px] leading-relaxed text-ink/80 sm:text-base">
          {paragraphes.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <section aria-labelledby="nos-maisons-videos" className="mt-12 sm:mt-16">
          <h2
            id="nos-maisons-videos"
            className="font-sans text-2xl font-black italic leading-tight text-ink"
          >
            Vidéos
          </h2>
          <div className="mt-6">
            <ScrollRail
              items={videos.map(videoItem)}
              ariaLabel="Vidéos"
              showArrows
              prevAriaLabel="Vidéo précédente"
              nextAriaLabel="Vidéo suivante"
              trackClassName="flex items-stretch gap-4 overflow-x-auto pb-4 pt-12 [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              itemClassName="w-[min(85vw,28rem)] flex-none [scroll-snap-align:center]"
            />
          </div>
        </section>
      )}

      {articles.length > 0 && (
        <section aria-labelledby="nos-maisons-articles" className="mt-12 sm:mt-16">
          <h2
            id="nos-maisons-articles"
            className="font-sans text-2xl font-black italic leading-tight text-ink"
          >
            Articles
          </h2>
          <ul className="mt-6 flex max-w-3xl flex-col gap-[2px] bg-ink p-[2px]">
            {articles.map((a, i) => (
              <li key={`${i}-${a.url}`} className="bg-paper">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`block p-4 hover:bg-paper-2 ${FOCUS_RING_LIGHT}`}
                >
                  {a.media && <span className={`block ${LIEN_META}`}>{a.media}</span>}
                  <span className="mt-1 block font-sans text-base font-extrabold leading-snug text-ink underline decoration-1 underline-offset-2">
                    {a.titre}
                    <NewTabMark />
                  </span>
                  {a.date && <span className={`mt-1 block ${LIEN_META}`}>{a.date}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="nos-maisons-maisons" className="mt-12 sm:mt-16">
        <h2
          id="nos-maisons-maisons"
          className="font-sans text-2xl font-black italic leading-tight text-ink"
        >
          Les deux maisons
        </h2>
        <FramedGrid className="mt-6 sm:grid-cols-2">
          {NAV_HOUSES.map((h) => (
            <Link
              key={h.href}
              href={h.href}
              className={`flex min-h-32 items-end bg-paper p-6 font-sans text-xl font-black italic leading-tight text-ink hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
            >
              {h.label}
            </Link>
          ))}
        </FramedGrid>
      </section>
    </Container>
  );
}

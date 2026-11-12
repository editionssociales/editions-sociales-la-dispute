import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { NewTabMark } from "@/components/new-tab-mark";
import { PageHero } from "@/components/page-hero";
import { NAV_HOUSES } from "@/lib/nav";
import { getPageNosMaisons } from "@/lib/site-content";
import type { NosMaisonsCouleur, NosMaisonsLien, NosMaisonsSection } from "@/lib/site-content-core";
import { FOCUS_RING_DARK, FOCUS_RING_INVERTING, FOCUS_RING_LIGHT } from "@/lib/ui";
import { youTubeEmbedUrl } from "@/lib/video";

/**
 * Page d'auto-promo « Nos maisons » — ÉDITEUR DE SECTIONS LIBRE (client
 * 2026-11) : le titre et la suite de sections (texte, carrousel de vidéos,
 * carrousel d'articles avec photo, mise en avant, citation, cartes des deux
 * maisons) viennent du global `page-nos-maisons` (`getPageNosMaisons`), dans
 * l'ordre saisi au back-office. Lu SANS `revalidate` propre — purge à la
 * demande par `revalidatePageNosMaisonsAfterChange`, comme `/contact`. Sans
 * section exploitable, `mergePageNosMaisons` renvoie les cartes des deux
 * maisons seules : la page reste présentable.
 *
 * Mise en page calquée sur `/souscription` : intertitre FACULTATIF de chaque
 * section en bandeau plein à l'accent pop (aucun par défaut), corps en prose
 * sobre, rythme vertical serré (`mt-10 sm:mt-12`), cartes encadrées alignées à
 * gauche. Les carrousels sont des rails NATIFS (scroll-snap, aucun JS).
 */
export const metadata: Metadata = {
  title: "Nos maisons",
  description:
    "Les Éditions sociales et La Dispute — nos interventions dans les médias, nos articles et nos deux maisons.",
  alternates: { canonical: "/nos-maisons" },
};

const LIEN_META = "font-sans text-xs font-bold uppercase tracking-[.05em] text-ink-soft";
const SECTION = "mt-10 sm:mt-12";
const CORPS = "max-w-[52ch] space-y-4 font-sans text-lg font-medium leading-relaxed text-ink";

/** Fonds des intertitres, en rotation sur les sections TITRÉES (classes littérales — contrat JIT). */
const BANDEAUX = ["bg-pop-teal", "bg-pop-pink", "bg-pop-yellow", "bg-pop-orange"] as const;

/** Fond d'une mise en avant selon la couleur choisie au back-office. */
const FOND_COULEUR: Record<NosMaisonsCouleur, string> = {
  jaune: "bg-pop-yellow",
  rose: "bg-pop-pink",
  bleu: "bg-pop-teal",
  orange: "bg-pop-orange",
};

/**
 * Intertitre de section — FACULTATIF : saisi, il s'affiche en bandeau plein
 * (colonne `max-w-2xl`, comme `RecitSection` de `/souscription`) ; vide, la
 * région reste NOMMÉE pour les lecteurs d'écran (`sr-only`) sans rien afficher.
 */
function Intertitre({
  id,
  titre,
  repli,
  bg,
}: {
  id: string;
  titre: string | null;
  repli: string;
  bg: string;
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

/** Rail horizontal natif : accroche carte par carte, première carte collée à gauche, le bord de la suivante dépasse (indice de défilement). */
function Rail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      className="-mx-5 flex snap-x snap-proximity scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:thin] sm:-mx-8 sm:scroll-px-8 sm:px-8"
      aria-label={label}
    >
      {children}
    </ul>
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

/** Carte d'article du carrousel : la photo de l'article (recadrée 16:10 — les visuels de presse n'ont pas tous le même format) au-dessus du titre. Sans photo, la carte n'a que son texte. */
function ArticleCard({ article }: { article: NosMaisonsLien }) {
  const { image } = article;
  return (
    <li className="flex w-[min(80vw,20rem)] flex-none snap-start flex-col border-2 border-ink bg-paper">
      <a
        href={article.url}
        target="_blank"
        rel="noreferrer"
        className={`flex h-full flex-col hover:bg-paper-2 ${FOCUS_RING_LIGHT}`}
      >
        {image && (
          // Alt vide si le média n'en porte pas — le titre juste dessous, dans
          // le même lien, fait foi.
          <span className="relative block aspect-[16/10] w-full overflow-hidden border-b-2 border-ink bg-paper-2">
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes="(min-width: 640px) 320px, 80vw"
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

function Paragraphes({ paragraphes, className = CORPS }: { paragraphes: string[]; className?: string }) {
  return (
    <div className={className}>
      {paragraphes.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function SectionView({ section, bandeau }: { section: NosMaisonsSection; bandeau: string }) {
  const id = `nos-maisons-${section.id}`;
  switch (section.type) {
    case "texte":
      return (
        <section aria-labelledby={id} className={SECTION}>
          <Intertitre id={id} titre={section.titre} repli="Texte" bg={bandeau} />
          <Paragraphes paragraphes={section.paragraphes} />
        </section>
      );
    case "videos":
      return (
        <section aria-labelledby={id} className={SECTION}>
          <Intertitre id={id} titre={section.titre} repli="Vidéos" bg={bandeau} />
          <Rail label="Carrousel des vidéos">
            {section.videos.map((video, i) => (
              <VideoCard key={`${i}-${video.url}`} video={video} />
            ))}
          </Rail>
        </section>
      );
    case "articles":
      return (
        <section aria-labelledby={id} className={SECTION}>
          <Intertitre id={id} titre={section.titre} repli="Articles" bg={bandeau} />
          <Rail label="Carrousel des articles">
            {section.articles.map((article, i) => (
              <ArticleCard key={`${i}-${article.url}`} article={article} />
            ))}
          </Rail>
        </section>
      );
    case "miseEnAvant": {
      const externe = section.lien ? /^https?:\/\//.test(section.lien.href) : false;
      return (
        <section aria-labelledby={id} className={SECTION}>
          <div className={`border-2 border-ink ${FOND_COULEUR[section.couleur]} px-5 py-6 sm:px-8 sm:py-8`}>
            <h2
              id={id}
              className="max-w-2xl font-sans text-[clamp(22px,3.4vw,34px)] font-black uppercase leading-[1.05] text-ink"
            >
              {section.titre}
            </h2>
            {section.paragraphes.length > 0 && (
              <Paragraphes paragraphes={section.paragraphes} className={`mt-4 ${CORPS}`} />
            )}
            {section.lien && (
              <Button
                href={section.lien.href}
                className="mt-6 px-6 py-3 text-sm font-extrabold tracking-[.03em]"
                {...(externe ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {section.lien.libelle}
                {externe && <NewTabMark />}
              </Button>
            )}
          </div>
        </section>
      );
    }
    case "citation":
      return (
        <section className={SECTION} aria-label="Citation">
          <figure className="max-w-3xl border-l-[6px] border-ink pl-5 sm:pl-7">
            <blockquote className="font-sans text-[clamp(20px,3vw,30px)] font-black italic leading-snug text-ink">
              {section.texte}
            </blockquote>
            {(section.auteur || section.source) && (
              <figcaption className={`mt-3 ${LIEN_META}`}>
                {[section.auteur, section.source].filter(Boolean).join(" — ")}
              </figcaption>
            )}
          </figure>
        </section>
      );
    case "maisons":
      return (
        <section aria-labelledby={id} className={SECTION}>
          <Intertitre id={id} titre={section.titre} repli="Les deux maisons" bg={bandeau} />
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
      );
  }
}

/**
 * Fond de bandeau de chaque section : la rotation avance sur les sections
 * TITRÉES seulement (une mise en avant porte sa propre couleur), pour que deux
 * intertitres consécutifs n'aient jamais le même fond. Pur, calculé hors rendu.
 */
function bandeauxPourSections(sections: NosMaisonsSection[]): string[] {
  let titrees = 0;
  return sections.map((section) => {
    const bandeau = BANDEAUX[titrees % BANDEAUX.length];
    if ("titre" in section && section.titre && section.type !== "miseEnAvant") titrees += 1;
    return bandeau;
  });
}

export default async function NosMaisonsPage() {
  const { titre, sections } = await getPageNosMaisons();
  const bandeaux = bandeauxPourSections(sections);

  return (
    <Container className="bg-paper pb-16 pt-10 sm:pb-20 sm:pt-12">
      <PageHero title={titre} className="max-w-3xl" />
      {sections.map((section, i) => (
        <SectionView key={section.id} section={section} bandeau={bandeaux[i]} />
      ))}
    </Container>
  );
}

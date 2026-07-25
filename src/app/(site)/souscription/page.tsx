import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { formatInt } from "@/lib/format";
import { FOCUS_RING_DARK } from "@/lib/ui";
import { donationsEnabled } from "@/lib/stripe";
import { CAMPAIGN_2026_PALIERS, deriveCampaign2026 } from "@/lib/donation-tiers";
import { youTubeEmbedUrl } from "@/lib/video";
import { getCampaign2026 } from "@/lib/donations";
import { getNewReleases } from "@/lib/catalogue";
import { getPageSouscription } from "@/lib/site-content";
import { HeroShelf, MobileShelf } from "./_components/shelf";
import { OPENING_MICROCOPY, TiersRail } from "./_components/tiers-rail";

/**
 * Page /souscription — livraison définitive de la campagne 2026 (Clara,
 * 2026-07-24) : docx « Souscription - texte » (récit, slogan), xlsx +
 * PDF « contreparties dans l'ordre » (9 paliers, visuels), objectifs de
 * jauge. Consigne client explicite : ne garder AUCUNE section qui ne soit
 * pas un extrait de ces documents, rendu le plus épuré possible — zéro
 * métadonnée visible (pas d'eyebrow, pas de titre de section générique type
 * « Contreparties »/« FAQ », pas de mot-clé de navigation). Seuls les
 * intertitres du document client et la microcopie fonctionnelle (boutons,
 * mention d'ouverture) sont affichés.
 *
 * Refonte « Placard » (2026-07-25, maquette gagnante du panel de design —
 * affiche militante) : la COLONNE PRINCIPALE est recomposée en affiche,
 * texte client inchangé à l'octet. Compteur monumental sur bloc ink
 * d'ouverture, ask éclaté en trois échelles (le h1 reste UN SEUL <h1>,
 * spans stylés), récit en quatre sections-bandeaux full-bleed
 * (brick/navy/ocher/bottle — la seule bande hazard de la page coiffe
 * « danger maximal »), objectifs en escalier typographique sous ombre dure
 * (R8), CTA final en opposition d'échelle. Interdits d'arbitrage : aucun
 * texte ajouté (pas de numéros de section, pas de légende), pas de lettres
 * au trait (-webkit-text-stroke), pas de compression scaleX, pop réservé au
 * liseré final. Les displays géants sont en clamp() (variantes `lg:` : la
 * colonne perd 380px au profit du rail, la pente vw doit se resserrer).
 *
 * Sections de l'ancienne maquette (campagne Ulule 2024) supprimées à
 * dessein, aucune ne correspondant à un extrait des documents livrés :
 * rétrospective 2024 (héros + tuiles de stats + jauge 2024), « Cinq
 * chantiers pour la suite », « Des projets, on en a plein » (perspectives
 * des maisons), FAQ, aperçu catalogue. `lib/campaign.ts` reste intact
 * (`deriveGauge` est le socle commun 2024/2026), seul son usage sur cette
 * page disparaît. L'étagère 3D, elle, N'EST PAS un reliquat 2024 : elle est
 * réintégrée dans l'ask (voir plus bas), avec de vraies parutions 2026.
 *
 * Ce qui reste, dans l'ordre du DOM (retour client 2026-07-24) : colonne
 * principale — jauge de collecte en direct (TOUJOURS visible, CTA
 * « Contribuer » ancré vers `#paliers`), corps de texte ouvert par le slot
 * vidéo (placeholder tant qu'aucune vidéo n'est livrée) puis ask — h1, lien
 * d'ancre mobile vers `#paliers`, étagère 3D des dernières parutions
 * (preuve matérielle du slogan, 3D en lg+, repli en grille de couvertures
 * 2×4 sous `lg`) —, quatre sections narratives, objectifs de jauge, CTA
 * final — ; contreparties éditables en rail sticky à droite de la PAGE
 * ENTIÈRE (`#paliers`, hors du corps de texte), clôturé par la carte
 * « montant libre » (le formulaire ne vit plus ni dans l'ask ni dans le CTA
 * final).
 *
 * Découpage (routes fines, `src/app/CLAUDE.md`) : cette page garde la jauge,
 * le récit verbatim, les objectifs et la composition ; l'étagère 3D + son
 * repli mobile vivent dans `_components/shelf.tsx`, le rail des contreparties
 * complet (visuels, formulaires Stripe, état pré-ouverture) dans
 * `_components/tiers-rail.tsx` — modules colocalisés privés (préfixe `_`,
 * hors routing App Router), tous composants serveur. Seul le bloc
 * `contreparties` est éditable dans /admin (global `page-souscription`) :
 * lu via `getPageSouscription`, bloc vide = contenu par défaut de
 * `lib/site-content-core.ts`. Montant et intitulé des paliers restent
 * dérivés de `DONATION_TIERS` (la table qui pilote Stripe) : la présentation
 * est éditable, jamais le paiement.
 */

/**
 * Liseré du CTA final (R2/R3) : `POP_BG` ne sert que cette décoration
 * ponctuelle — les paliers du rail cyclent, eux, les 4 accents de marque,
 * jamais la palette pop (réservée nav/statut).
 */
const POP_BG = ["bg-pop-pink", "bg-pop-teal", "bg-pop-orange", "bg-pop-yellow"];

/**
 * Vidéo de présentation — ouvre le corps de texte (retour client
 * 2026-07-24). Aucune vidéo livrée à ce jour : renseigner ici l'URL YouTube
 * brute à réception (watch, youtu.be, shorts ou déjà embed —
 * `youTubeEmbedUrl` la normalise en youtube-nocookie, règle single-source de
 * `src/lib/video.ts` ; si la vidéo n'est pas YouTube, étendre `video.ts`
 * plutôt que d'inliner). En attendant, un placeholder au format vidéo tient
 * la place (jamais un vide).
 */
const CAMPAIGN_VIDEO_URL: string | null = null;

/**
 * Objectifs de la jauge — escalier typographique après le récit. Montants et
 * titres dérivés de `CAMPAIGN_2026_PALIERS` (la table qui pilote la jauge —
 * une révision client d'un palier ne se reporte qu'à un seul endroit) ;
 * seuls les descriptifs (docx client, VERBATIM) et la présentation vivent
 * ici. La progression sauver → résister → construire est portée par le
 * liseré d'accent (brick → ocher → bottle, même échelle que les sections du
 * récit) ET par le montant qui grossit d'une marche à l'autre (`display`,
 * classes clamp littérales — contrat JIT) ; la barre du sommet
 * (« On construit », l'objectif plein) est la seule inversée en ink.
 */
const OBJECTIF_EXTRAS: Record<
  number,
  { desc: string; accent: string; display: string; sommet?: boolean }
> = {
  50_000: {
    desc: "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
    accent: "bg-brick",
    display: "text-[clamp(32px,8vw,52px)]",
  },
  80_000: {
    desc: "Nous pouvons absorber l’essentiel de la perte, mener à bien les projets déjà engagés et confirmer l’arrivée de Nicolas Vieillescazes dans l’équipe.",
    accent: "bg-ocher",
    display: "text-[clamp(38px,9.5vw,68px)]",
  },
  100_000: {
    // TODO(contenu) : phrase possiblement tronquée dans le docx (le point
    // final manque) — conservée telle quelle.
    desc: "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    accent: "bg-bottle",
    display: "text-[clamp(44px,11vw,84px)]",
    sommet: true,
  },
};

const OBJECTIFS = CAMPAIGN_2026_PALIERS.map((p) => ({
  value: p.value,
  titre: p.label,
  ...OBJECTIF_EXTRAS[p.value],
}));

export const metadata: Metadata = {
  title: "Souscription",
  // ≤ 160 caractères (Google tronque au-delà) : crise + appel + fourchette.
  description:
    "La faillite de notre distributeur menace 100 ans d’édition marxiste indépendante. Soutenez Les Éditions sociales et La Dispute — contreparties de 15 à 1 000 €.",
  alternates: { canonical: "/souscription" },
  // Carte large : l'image vient du fichier `opengraph-image.jpg` colocalisé
  // (convention Next — og:image/twitter:image générées sans toucher l'objet
  // `openGraph` hérité du layout, cf. piège de fusion superficielle
  // documenté dans src/app/CLAUDE.md).
  twitter: { card: "summary_large_image" },
};

export const revalidate = 3600; // fenêtre ISR (contreparties lues dans Payload/Postgres)

/**
 * JSON-LD Organization + DonateAction — aide crawlers (et LLM-crawlers) à
 * qualifier la page pendant la campagne. Constante FIGÉE construite en code,
 * jamais de contenu CMS : hors de la règle SafeHtml (`src/app/CLAUDE.md`),
 * qui vise le HTML éditorial injecté.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr";
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Les Éditions sociales × La Dispute",
  url: SITE_URL,
  potentialAction: {
    "@type": "DonateAction",
    target: `${SITE_URL}/souscription`,
  },
});

/**
 * Bande hazard ink/brick — la SEULE de la page (arbitrage du panel), au
 * sommet du bandeau « danger maximal ». Hachures en repeating-linear-gradient
 * arbitrary (classe littérale, variables de thème — R1).
 */
const HAZARD_BG =
  "bg-[repeating-linear-gradient(-45deg,var(--color-ink)_0_12px,var(--color-brick)_12px_24px)]";

/**
 * Équivalent Container utilisable DANS un h1/h2 : les bandeaux full-bleed
 * sont portés par des <span> de titre (un <div> serait invalide dans un
 * heading), qui reprennent la géométrie de `Container` en classes littérales
 * pour garder tous les fers à gauche alignés.
 */
const SPAN_CONTAINER = "mx-auto block w-full max-w-6xl px-5 sm:px-8";

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (CTA honnêtement désactivés, R7).
  const enabled = donationsEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `donationsEnabled()`
  // est faux (elle jette avant tout fetch, absorbée en `null` — `lib/donations.ts`) :
  // gratuit à appeler inconditionnellement.
  const [campaign2026, content, releases] = await Promise.all([
    getCampaign2026(),
    getPageSouscription(),
    // Fail-open : une panne catalogue dégrade l'étagère de l'ask vers ses dos
    // placeholder colorés (HeroShelf/MobileShelf sans `book.cover`) — elle ne
    // fait JAMAIS tomber la page de dons.
    getNewReleases(18).catch(() => []),
  ]);
  // L'étagère de l'ask porte de vraies parutions : couverture + fiche interne
  // requises (les étagères re-vérifient et plafonnent elles-mêmes).
  const shelfBooks = releases.filter((b) => b.cover && b.edition);
  // Jauge 2026 TOUJOURS visible (point le plus urgent du site) : avant
  // l'ouverture des dons (pas de clé Stripe → `null`), ou juste après le
  // lancement (0 collecté), la jauge affiche honnêtement une campagne à 0
  // plutôt que de disparaître.
  const liveCampaign = campaign2026 ?? deriveCampaign2026({ collected: 0, contributors: 0 });
  // Embed dérivé de l'URL brute (null si absente OU non reconnue) : jamais
  // une iframe cassée en prod le jour où l'URL sera collée.
  const videoEmbed = CAMPAIGN_VIDEO_URL ? youTubeEmbedUrl(CAMPAIGN_VIDEO_URL) : null;
  // Panne Stripe EN campagne (clé posée mais relecture des charges en échec,
  // `getCampaign2026` → null) : ne jamais afficher un faux 0 — le compteur
  // laisse place à une mention neutre et la barre n'est pas rendue
  // (l'objectif, lui, reste vrai). L'ISR (1 h) peut prolonger cet état
  // quelques minutes après le retour de Stripe.
  const outage = enabled && campaign2026 === null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      {/* Colonne principale (jauge, corps de texte, CTA final) — le rail des
          contreparties vit en frère de DOM, sur la droite de la page entière. */}
      <div className="min-w-0">
        {/* 1 ▪ La collecte en direct OUVRE la page — compteur de lutte
            monumental sur bloc ink pleine largeur, jauge 2026 vivante,
            objectif + CTA d'ancre. N'affiche que ce qu'une campagne en cours
            peut honnêtement montrer (collecté net + contributeurs). Fenêtre
            de fraîcheur ~1–3 min, voir `src/app/CLAUDE.md`. */}
        <section className="bg-ink text-paper">
          <Container className="py-12 sm:py-16">
            <Reveal>
              {outage ? (
                <p className="max-w-md text-[15px] leading-relaxed text-paper/70">
                  La collecte est en cours — le total s’affichera de nouveau
                  dans quelques minutes.
                </p>
              ) : !enabled ? (
                /* Avant l'ouverture (E1), les CTA du rail sont désactivés :
                   annoncer la date plutôt qu'un « soyez les premier·ères »
                   contradictoire avec des boutons morts. */
                <p className="max-w-md text-[15px] leading-relaxed text-paper/70">
                  La souscription ouvre le 15 août — découvrez déjà les
                  contreparties.
                </p>
              ) : liveCampaign.collected > 0 ? (
                /* Les `{" "}` autour des <CountUp> sont porteurs : JSX
                   supprime les blancs contenant un retour à la ligne — sans
                   eux, AT/copier-coller lisent « Déjà11 014 €réunis ». Les
                   nœuds espace entre spans `block` ne sont pas rendus : zéro
                   impact visuel. La phrase reste UN SEUL <p> (ordre de
                   lecture intact), seuls les spans posent les échelles. */
                <p className="text-lg leading-snug text-paper/80">
                  <span className="block font-sans text-xs font-extrabold uppercase tracking-[.3em] text-paper/70">
                    Déjà
                  </span>{" "}
                  <span className="mt-3 block">
                    <CountUp
                      value={liveCampaign.collected}
                      suffix=" €"
                      className="font-sans text-[clamp(56px,18vw,128px)] font-black italic leading-[0.85] tracking-[-0.02em] text-paper lg:text-[clamp(56px,9vw,128px)]"
                    />
                  </span>{" "}
                  <span className="mt-4 block">
                    réunis auprès de{" "}
                    <CountUp
                      value={liveCampaign.contributors}
                      className="font-sans text-2xl font-black italic text-paper"
                    />{" "}
                    contributeur·rices.
                  </span>
                </p>
              ) : (
                <p className="max-w-md text-[15px] leading-relaxed text-paper/70">
                  Campagne tout juste lancée — soyez les premier·ères à
                  contribuer.
                </p>
              )}
              {!outage && (
                <Gauge
                  className="mt-10 sm:mt-12"
                  tone="dark"
                  value={liveCampaign.gauge.value}
                  max={liveCampaign.gauge.max}
                  markers={liveCampaign.gauge.markers}
                />
              )}
              <div className="mt-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-6 border-t-2 border-paper/30 pt-8">
                <div>
                  <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                    Objectif
                  </p>
                  <p className="mt-2 font-sans text-[clamp(36px,7vw,48px)] font-black italic leading-none">
                    {formatInt(liveCampaign.goal)}&nbsp;€
                  </p>
                </div>
                <div>
                  {/* CTA de la jauge (retour client 2026-07-24) : renvoie vers
                      la liste des contreparties, le paiement se joue là-bas. La
                      flèche « ↓ » distingue cette ancre de défilement des
                      boutons de PAIEMENT du rail (libellé « Contribuer » nu). */}
                  <Button
                    href="#paliers"
                    variant="invert"
                    aria-label="Contribuer — voir les contreparties"
                    className="px-6 py-3 text-sm font-extrabold tracking-[.03em]"
                  >
                    Contribuer&nbsp;↓
                  </Button>
                  {!enabled && (
                    <p className="mt-1.5 font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-paper/70">
                      {OPENING_MICROCOPY}
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* 2 ▪ Vidéo de présentation — OUVRE le corps de texte ; tant
            qu'aucune vidéo n'est livrée, un placeholder au même format tient
            la place (le bloc ne disparaît jamais). Cadre hachuré à ombre
            dure (R8, recette littérale). */}
        <section className="bg-paper">
          <Container className="pt-14 sm:pt-16">
            <Reveal>
              {videoEmbed ? (
                <div className="border-2 border-ink bg-ink shadow-[8px_8px_0_0_#17140f]">
                  <iframe
                    src={videoEmbed}
                    title="La vidéo de la souscription"
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 border-2 border-ink bg-[repeating-linear-gradient(-45deg,var(--color-paper-2)_0_14px,var(--color-paper)_14px_28px)] shadow-[8px_8px_0_0_#17140f] print:hidden">
                  {/* SVG plutôt que le caractère ▶ : Effra ne couvre pas les
                      glyphes géométriques, le rendu retombait sur la fonte
                      système (forme et centrage variables selon l'OS). */}
                  <span
                    aria-hidden="true"
                    className="flex h-16 w-16 items-center justify-center border-2 border-ink bg-paper text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                      <path d="M6 4 L20 12 L6 20 Z" />
                    </svg>
                  </span>
                  <p className="px-4 text-center font-sans text-xs font-extrabold uppercase tracking-[.22em] text-ink/70">
                    La vidéo de la souscription — bientôt
                  </p>
                </div>
              )}
            </Reveal>
          </Container>
        </section>

        {/* 3 ▪ L'ask 2026 — le slogan en trois échelles (affiche) : « 100
            ans » en aplat plein très grand, la qualification en capitales,
            la demande sur bandeau ink qui accueille l'étagère. Le h1 reste
            UN SEUL <h1> portant tout le slogan verbatim dans l'ordre — seuls
            des spans posent les échelles (jamais de duplication). Le
            formulaire montant libre n'est plus ici (il clôt la liste des
            contreparties), seule l'ancre y mène.
            TODO(contenu) : le docx s'intitule « Slogans » (pluriel) mais
            n'en livre qu'un — d'autres variantes pourraient arriver. */}
        {/* Ni ce bloc ni l'étagère qu'il contient ne doivent jamais être
            enveloppés dans <Reveal> : son `transform` (l'animation
            d'apparition) crée un containing block qui casse le pop-out
            3D des dos (position/transform absolus calés sur ce bloc).
            Pour la même raison, aucun `overflow-hidden` ne doit jamais
            être posé ici, sur les conteneurs internes ou sur la `section` :
            ça clipperait le livre déplié, qui déborde largement du bloc. */}
        <section className="bg-paper pt-16 sm:pt-20">
          <h1 className="font-sans font-black italic text-ink">
            <span
              className={`${SPAN_CONTAINER} text-[clamp(64px,17vw,180px)] leading-[0.8] tracking-[-0.03em] lg:text-[clamp(64px,12vw,180px)]`}
            >
              100 ans
            </span>{" "}
            <span
              className={`${SPAN_CONTAINER} mt-3 text-[clamp(24px,6vw,46px)] uppercase leading-[0.9] tracking-[-0.01em]`}
            >
              d’édition marxiste :
            </span>{" "}
            <span className="mt-8 block bg-ink pt-10 text-paper sm:mt-10 sm:pt-12">
              <span className={SPAN_CONTAINER}>
                <span className="block max-w-[16ch] text-[clamp(28px,7vw,54px)] leading-[0.95]">
                  aidez-nous à poursuivre l’histoire.
                </span>
              </span>
            </span>
          </h1>
          {/* Continuation du bandeau ink de l'ask : ancre mobile + étagère. */}
          <div className="bg-ink pb-12 text-paper sm:pb-14">
            <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
              {/* Chemin mobile uniquement : en lg+, le rail sticky des
                  contreparties est déjà visible, l'ancre est redondante. */}
              <a
                href="#paliers"
                className={`mt-8 inline-flex min-h-11 items-center font-sans text-xs font-bold uppercase tracking-[.04em] text-paper/60 underline decoration-1 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-paper lg:hidden ${FOCUS_RING_DARK}`}
              >
                Voir les contreparties ↓
              </a>

              {/* `hidden lg:block` : sous lg la HeroShelf qu'il contient est déjà
                  masquée — sans lui, un groupe nommé VIDE doublonnerait le
                  `aria-label` de MobileShelf dans l'arbre d'accessibilité. */}
              <div className="mt-14 hidden lg:block" role="group" aria-label="Dernières parutions">
                <HeroShelf books={shelfBooks} />
              </div>
              <MobileShelf books={shelfBooks} />
            </div>
          </div>
        </section>

        {/* 4 ▪ Récit — quatre sections-bandeaux (texte du docx VERBATIM,
            seule la composition varie) : chaque h2 reste UN SEUL <h2> —
            kicker en corps modéré sur paper, chute en display géant sur
            bandeau plein full-bleed à l'accent de la section — crise = brick
            (le langage d'alerte du site, cf. panier), bataille politique =
            navy, héritage centenaire = ocher (texte ink, AA ≈5,5:1), appel =
            bottle en crescendo. Le descriptif reste en corps 15-17px/ink-70,
            `max-w-[70ch]`. Jamais de palette pop ici (R2). */}

        {/* Section 1 — la crise : « danger maximal » crié sur bandeau brick
            coiffé de la bande hazard, le montant perdu en exergue inline
            (max 1.8em — jamais un display dans la ligne), la chute (« coup
            fatal ») en bandeau ink liseré brick. */}
        <section className="mt-16 sm:mt-24">
          <Reveal>
            <h2 className="font-sans font-black italic text-ink">
              <span
                className={`${SPAN_CONTAINER} text-xl uppercase leading-tight tracking-[.04em] sm:text-2xl`}
              >
                Édition indépendante et critique :
              </span>{" "}
              <span className="mt-5 block bg-brick text-paper">
                <span aria-hidden="true" className={`block h-3 ${HAZARD_BG}`} />
                <span
                  className={`${SPAN_CONTAINER} py-7 text-[clamp(44px,11vw,110px)] uppercase leading-[0.82] tracking-[-0.02em] sm:py-9 lg:text-[clamp(44px,8vw,110px)]`}
                >
                  <span className="block">danger</span>{" "}
                  <span className="block">maximal</span>
                </span>
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <div className="max-w-[70ch] space-y-5 text-[15px] leading-relaxed text-ink/70 sm:space-y-6 sm:text-[17px] sm:leading-[1.65]">
                <p>
                  En cette fin d’été 2026, l’édition de critique sociale fait
                  face à une des pires crises de son histoire. Des centaines de
                  maisons indépendantes sont menacées par la faillite de leur
                  distributeur Makassar qui disparaît avec des dettes importantes.
                </p>
                <p>
                  Pour Les éditions sociales et La Dispute, c’est plus de{" "}
                  <strong className="whitespace-nowrap font-sans text-[1.5em] font-black italic leading-none text-brick sm:text-[1.8em]">
                    130&nbsp;000&nbsp;€
                  </strong>{" "}
                  de ventes en librairie que nous ne toucherons jamais
                  pour des livres dont nous avons pourtant payé des frais
                  d’impression et de maquette, ainsi que des avances de droits
                  d’auteur.
                </p>
              </div>
            </Container>
            <p className="mt-10 border-l-[14px] border-brick bg-ink py-7 text-paper sm:mt-12 sm:py-9">
              <span
                className={`${SPAN_CONTAINER} font-sans text-[clamp(24px,5vw,36px)] font-black italic leading-[1.1]`}
              >
                Pour nos maisons, c’est le genre de coup qui peut être fatal.
              </span>
            </p>
          </Reveal>
        </section>

        {/* Section 2 — la bataille matérielle : la chute du titre sur
            bandeau navy, le 90 % en exergue inline, « la fin de la propriété
            privée… » et « un devoir politique » en marquages navy (padding
            vertical nul + leading du paragraphe hôte : le marqueur ne
            percute jamais la ligne précédente). */}
        <section className="mt-16 sm:mt-24">
          <Reveal>
            <h2 className="font-sans font-black italic text-ink">
              <span className={`${SPAN_CONTAINER} text-xl leading-tight sm:text-2xl`}>
                La guerre culturelle est aussi une
              </span>{" "}
              <span className="mt-5 block bg-navy text-paper">
                <span
                  className={`${SPAN_CONTAINER} py-7 text-[clamp(44px,11vw,110px)] uppercase leading-[0.82] tracking-[-0.02em] sm:py-9 lg:text-[clamp(44px,8vw,110px)]`}
                >
                  <span className="block">guerre</span>{" "}
                  <span className="block">matérielle</span>
                </span>
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <div className="max-w-[70ch] space-y-5 text-[15px] leading-relaxed text-ink/70 sm:space-y-6 sm:text-[17px] sm:leading-[1.65]">
                <p>
                  La faillite de Makassar est le résultat d’un marché de
                  l’édition où les grands groupes — Hachette, Editis,
                  Média-Participations, Madrigall — détiennent à eux seuls près de{" "}
                  <strong className="whitespace-nowrap font-sans text-[1.5em] font-black italic leading-none text-navy sm:text-[1.8em]">
                    90&nbsp;%
                  </strong>{" "}
                  de la production éditoriale et de la distribution. Ces
                  grands groupes font la course aux profits et imposent leur loi à
                  tous, avec des conséquences néfastes pour l’ensemble des
                  acteurs indépendants mais aussi des lecteurices.
                </p>
                <p>
                  C’est parce que ces groupes existent que leurs propriétaires
                  peuvent se permettre de les utiliser pour mener leurs guerres
                  idéologiques, comme on l’a vu récemment avec Vincent Bolloré.
                </p>
                <p>
                  Face à eux, nous devons aller à la racine en exigeant{" "}
                  <strong className="box-decoration-clone bg-navy px-1 font-semibold text-paper">
                    la fin de la propriété privée des moyens de production
                    culturelle et des infrastructures de distribution
                  </strong>
                  .
                </p>
              </div>
              {/* Punchline en carton « Spécimen » : boîte bordée sous ombre
                  dure navy (R8). */}
              <p className="mt-10 max-w-[38ch] border-2 border-ink bg-paper p-6 font-sans text-2xl font-black italic leading-[1.2] text-ink shadow-[8px_8px_0_0_#262a5c] sm:mt-12 sm:p-8 sm:text-3xl">
                Et, parce que la bataille des idées est aussi une guerre
                matérielle, soutenir les éditeurs indépendants est{" "}
                {/* `whitespace-nowrap` : un marqueur coupé en fin de ligne
                    serait illisible — le marqueur passe à la ligne entier
                    (token court). */}
                <span className="whitespace-nowrap bg-navy px-2 text-paper">
                  un devoir politique
                </span>
                .
              </p>
            </Container>
          </Reveal>
        </section>

        {/* Section 3 — les maisons, cent ans : le titre entier en display
            sur bandeau ocher (texte ink — AA ≈5,5:1), le « 100 ans » en
            tampon penché conservé, l'anaphore « Cent ans de… » en barres
            empilées séparées de hairlines ink ; le reste (chantiers, équipe)
            demeure descriptif. */}
        <section className="mt-16 sm:mt-24">
          <Reveal>
            <h2 className="bg-ocher font-sans font-black italic text-ink">
              <span
                className={`${SPAN_CONTAINER} py-6 text-[clamp(28px,6.5vw,64px)] uppercase leading-[0.95] sm:py-8`}
              >
                Les éditions sociales et La Dispute
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <p className="max-w-[30ch] font-sans text-xl font-bold leading-snug text-ink sm:text-2xl">
                En 2027, nos maisons fêteront leurs{" "}
                <span className="mx-1 my-2 inline-block -rotate-2 whitespace-nowrap border-4 border-ocher px-3 py-1 align-middle font-black italic text-[clamp(40px,10vw,64px)] leading-[0.9] text-ocher-text">
                  100 ans
                </span>{" "}
                d’existence.
              </p>
              <div className="mt-8 flex flex-col gap-[2px] border-2 border-ink bg-ink sm:mt-10">
                <p className="bg-ocher px-5 py-5 font-sans text-lg font-bold leading-snug text-ink sm:px-7 sm:py-6 sm:text-[22px]">
                  <span className="font-black italic uppercase">Cent ans</span> de
                  traductions de Marx et de livres marxistes et de formation
                  militante.
                </p>
                <p className="bg-paper-2 px-5 py-5 font-sans text-lg font-bold leading-snug text-ink sm:px-7 sm:py-6 sm:text-[22px]">
                  <span className="font-black italic uppercase text-ocher-text">Cent ans</span> de
                  publications exigeantes, pour éclairer les transformations du
                  capitalisme, des classes sociales, mener la critique féministe
                  et faire vivre le débat à gauche.
                </p>
              </div>
              <div className="mt-8 max-w-[70ch] space-y-5 text-[15px] leading-relaxed text-ink/70 sm:mt-10 sm:space-y-6 sm:text-[17px] sm:leading-[1.65]">
                <p>
                  Récemment, nous avons ouvert de nouveaux chantiers prometteurs
                  pour nos maisons en arrivant chez un nouveau
                  diffuseur-distributeur, BLDD ; en lançant de nouvelles
                  collections ; en partant à la rencontre des libraires partout
                  dans le pays.
                </p>
                <p>
                  Mais notre équipe s’agrandit aussi :{" "}
                  <strong className="font-semibold text-ink">
                    Nicolas Vieillescazes
                  </strong>
                  , ancien directeur éditorial d’Amsterdam, nous rejoint pour
                  renforcer les éditions sociales et La Dispute.
                </p>
                <p>
                  Tous ces choix portent leurs fruits mais la faillite de Makassar
                  nous frappe{" "}
                  <strong className="font-semibold text-ink">
                    au moment où nous construisons l’avenir
                  </strong>
                  .
                </p>
              </div>
            </Container>
          </Reveal>
        </section>

        {/* Section 4 — l'appel : tout le h2 sur bandeau bottle, en crescendo
            (« Nous avons besoin » modéré, « de vous » géant) ; le paragraphe
            unique agrandi (c'est l'ask du récit, pas un descriptif). */}
        <section className="mt-16 sm:mt-24">
          <Reveal>
            <h2 className="bg-bottle font-sans font-black italic text-paper">
              <span
                className={`${SPAN_CONTAINER} pt-8 text-[clamp(22px,5vw,44px)] uppercase leading-[0.9] sm:pt-10`}
              >
                Nous avons besoin
              </span>{" "}
              <span
                className={`${SPAN_CONTAINER} pb-8 text-[clamp(54px,14vw,140px)] uppercase leading-[0.85] tracking-[-0.02em] sm:pb-10 lg:text-[clamp(54px,10vw,140px)]`}
              >
                de vous
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <p className="max-w-[52ch] font-sans text-lg font-medium leading-relaxed text-ink sm:text-2xl sm:leading-[1.45]">
                Nous voulons que notre histoire se poursuive ; c’est pourquoi
                nous faisons appel à vous. En faisant un don, vous nous aiderez
                à surmonter cette crise, à{" "}
                <strong className="font-bold underline decoration-bottle decoration-4 underline-offset-4">
                  préserver notre indépendance
                </strong>{" "}
                et à poursuivre un travail éditorial engagé, exigeant et
                indispensable.
              </p>
            </Container>
          </Reveal>
        </section>

        {/* 5 ▪ Objectifs de la jauge — l'escalier typographique : trois
            barres pleine largeur empilées (hairlines ink) sous ombre dure
            (R8), montant qui grossit d'une marche à l'autre, sommet inversé
            ink. Pas de titre de section au-dessus, la jauge d'ouverture
            porte déjà « Objectif » : les barres parlent d'elles-mêmes. */}
        <section className="mt-16 sm:mt-24">
          <Container>
            <Reveal>
              <div className="flex flex-col gap-[2px] border-2 border-ink bg-ink shadow-[8px_8px_0_0_#17140f]">
                {OBJECTIFS.map((o) => (
                  <div
                    key={o.titre}
                    className={`grid grid-cols-[10px_1fr] sm:grid-cols-[14px_1fr] ${o.sommet ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  >
                    <span aria-hidden="true" className={`block ${o.accent}`} />
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-6 sm:px-7 sm:py-8">
                      {/* `{" "}` porteur (hérité de l'ancienne grille) : les
                          nœuds espace entre blocs ne sont pas rendus, mais
                          AT/copier-coller séparent bien « 50 000 € » de son
                          intitulé. */}
                      <p className={`font-sans font-black italic leading-none ${o.display}`}>
                        {formatInt(o.value)}&nbsp;€
                      </p>{" "}
                      <div className="min-w-0 flex-1 basis-[26ch]">
                        <p className="font-sans text-[15px] font-extrabold uppercase tracking-[.06em]">
                          {o.titre}
                        </p>
                        <p
                          className={`mt-1.5 text-sm leading-relaxed ${o.sommet ? "text-paper/70" : "text-ink/70"}`}
                        >
                          {o.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </Container>
        </section>

        {/* 6 ▪ CTA final — phrase de clôture du docx, verbatim, en
            opposition d'échelle pure (greffe « Spécimen ») : corps modéré
            paper/70, « la fin du capitalisme » seul en display géant au
            marqueur bottle. UN SEUL <h2>, spans stylés. Le montant libre
            vivant désormais en clôture du rail, le CTA y renvoie simplement. */}
        <section className="mt-16 bg-ink text-paper sm:mt-24">
          <div className="grid grid-cols-4" aria-hidden="true">
            {POP_BG.map((c) => (
              <div key={c} className={`h-1.5 ${c}`} />
            ))}
          </div>
          <Container className="py-16 sm:py-20">
            <h2 className="font-sans font-black italic">
              <span className="block max-w-[36ch] text-xl leading-snug text-paper/70 sm:text-2xl">
                Vous nous permettrez de continuer à publier les livres qui
                imaginent
              </span>{" "}
              {/* Pavé bloc (w-fit) plutôt que fond inline : le fond d'un span
                  inline se peint à la hauteur de la zone de contenu de la
                  fonte et déborde un leading serré — il mordait les deux
                  lignes voisines (constat harnais 2026-07-25). */}
              <span className="my-5 block w-fit bg-bottle px-3 py-1 text-[clamp(40px,10vw,96px)] leading-[1.05] lg:text-[clamp(40px,7vw,96px)]">
                la fin du capitalisme
              </span>{" "}
              <span className="block max-w-[36ch] text-xl leading-snug text-paper/70 sm:text-2xl">
                plutôt que la fin du monde.
              </span>
            </h2>
            <Button
              href="#paliers"
              variant="invert"
              aria-label="Contribuer — voir les contreparties"
              className="mt-10 px-7 py-3.5 text-sm font-extrabold tracking-[.03em] sm:mt-12"
            >
              Contribuer&nbsp;↓
            </Button>
          </Container>
        </section>
      </div>

      <TiersRail content={content} enabled={enabled} />
    </div>
  );
}

import type { Metadata } from "next";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
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
 * « Contribuer » ancré vers `#paliers`, sans séparation sous la jauge),
 * corps de texte ouvert par le slot vidéo (placeholder tant qu'aucune vidéo
 * n'est livrée) puis ask — h1, lien d'ancre mobile vers `#paliers`, étagère
 * 3D des dernières parutions (preuve matérielle du slogan, 3D en lg+, repli
 * en grille de couvertures 2×4 sous `lg`) —, quatre sections narratives,
 * objectifs de jauge, CTA final — ; contreparties éditables en rail sticky à
 * droite de la PAGE ENTIÈRE (`#paliers`, hors du corps de texte), clôturé
 * par la carte « montant libre » (le formulaire ne vit plus ni dans l'ask ni
 * dans le CTA final).
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
 * Objectifs de la jauge — cellules encadrées après le récit. Montants et
 * titres dérivés de `CAMPAIGN_2026_PALIERS` (la table qui pilote la jauge —
 * une révision client d'un palier ne se reporte qu'à un seul endroit) ;
 * seuls les descriptifs (docx client, VERBATIM) et la présentation vivent
 * ici. La progression sauver → résister → construire est portée par la barre
 * d'accent (brick → ocher → bottle, même échelle que les sections du récit) ;
 * la cellule du sommet (« On construit », l'objectif plein) est la seule
 * inversée en ink.
 */
const OBJECTIF_EXTRAS: Record<number, { desc: string; accent: string; sommet?: boolean }> = {
  50_000: {
    desc: "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
    accent: "bg-brick",
  },
  80_000: {
    desc: "Nous pouvons absorber l’essentiel de la perte, mener à bien les projets déjà engagés et confirmer l’arrivée de Nicolas Vieillescazes dans l’équipe.",
    accent: "bg-ocher",
  },
  100_000: {
    // TODO(contenu) : phrase possiblement tronquée dans le docx (le point
    // final manque) — conservée telle quelle.
    desc: "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    accent: "bg-bottle",
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
        {/* La collecte en direct OUVRE la page — jauge 2026 vivante + objectif.
            Pas de séparation horizontale sous la jauge (retour client
            2026-07-24) : elle enchaîne directement sur le corps. N'affiche que
            ce qu'une campagne en cours peut honnêtement montrer (collecté net +
            contributeurs). Fenêtre de fraîcheur ~1–3 min, voir `src/app/CLAUDE.md`. */}
        <section className="bg-paper">
          <Container className="py-12 sm:py-16">
            <Reveal>
              <div className="flex flex-col gap-[2px] bg-ink p-[2px] lg:flex-row">
                <div className="flex-1 bg-paper p-6 sm:p-8">
                  {outage ? (
                    <p className="max-w-md text-[15px] leading-relaxed text-ink/70">
                      La collecte est en cours — le total s’affichera de nouveau
                      dans quelques minutes.
                    </p>
                  ) : !enabled ? (
                    /* Avant l'ouverture (E1), les CTA du rail sont désactivés :
                       annoncer la date plutôt qu'un « soyez les premier·ères »
                       contradictoire avec des boutons morts. */
                    <p className="max-w-md text-[15px] leading-relaxed text-ink/70">
                      La souscription ouvre le 15 août — découvrez déjà les
                      contreparties.
                    </p>
                  ) : liveCampaign.collected > 0 ? (
                    /* Les `{" "}` autour des <CountUp> sont porteurs : JSX
                       supprime les blancs contenant un retour à la ligne — sans
                       eux, AT/copier-coller lisent « Déjà11 014 €réunis ». Les
                       nœuds espace entre items flex ne sont pas rendus : zéro
                       impact visuel. */
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-relaxed text-ink/70">
                      Déjà{" "}
                      <CountUp
                        value={liveCampaign.collected}
                        suffix=" €"
                        className="font-sans text-lg font-black italic text-ink"
                      />{" "}
                      réunis auprès de{" "}
                      <CountUp
                        value={liveCampaign.contributors}
                        className="font-sans text-lg font-black italic text-ink"
                      />{" "}
                      contributeur·rices.
                    </p>
                  ) : (
                    <p className="max-w-md text-[15px] leading-relaxed text-ink/70">
                      Campagne tout juste lancée — soyez les premier·ères à
                      contribuer.
                    </p>
                  )}
                  {!outage && (
                    <Gauge
                      className="mt-6"
                      value={liveCampaign.gauge.value}
                      max={liveCampaign.gauge.max}
                      markers={liveCampaign.gauge.markers}
                    />
                  )}
                </div>
                <div className="flex flex-col justify-center bg-ink p-6 text-paper sm:p-8 lg:w-64">
                  <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                    Objectif
                  </p>
                  <p className="mt-2 font-sans text-4xl font-black italic">
                    {formatInt(liveCampaign.goal)}&nbsp;€
                  </p>
                  {/* CTA de la jauge (retour client 2026-07-24) : renvoie vers
                      la liste des contreparties, le paiement se joue là-bas. La
                      flèche « ↓ » distingue cette ancre de défilement des
                      boutons de PAIEMENT du rail (libellé « Contribuer » nu). */}
                  <Button
                    href="#paliers"
                    variant="invert"
                    aria-label="Contribuer — voir les contreparties"
                    className="mt-5 self-start px-6 py-3 text-sm font-extrabold tracking-[.03em]"
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

        {/* Corps de texte — ouvert par le slot vidéo, puis l'ask 2026, le
            récit et les objectifs. Les contreparties n'y sont plus : elles
            vivent dans le rail `#paliers`, à droite de la page entière. */}
        <section className="border-b-2 border-ink bg-paper">
          <Container className="py-16 sm:py-20">
            <div className="flex flex-col gap-14">
              {/* Vidéo de présentation — OUVRE le corps de texte ; tant
                  qu'aucune vidéo n'est livrée, un placeholder au même format
                  tient la place (le bloc ne disparaît jamais). */}
              <Reveal>
                {videoEmbed ? (
                  <div className="border-2 border-ink bg-ink">
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
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 border-2 border-ink bg-ink text-paper print:hidden">
                    {/* SVG plutôt que le caractère ▶ : Effra ne couvre pas les
                        glyphes géométriques, le rendu retombait sur la fonte
                        système (forme et centrage variables selon l'OS). */}
                    <span
                      aria-hidden="true"
                      className="flex h-16 w-16 items-center justify-center border-2 border-paper"
                    >
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                        <path d="M6 4 L20 12 L6 20 Z" />
                      </svg>
                    </span>
                    <p className="px-4 text-center font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                      La vidéo de la souscription — bientôt
                    </p>
                  </div>
                )}
              </Reveal>

              {/* L'ask 2026 — même traitement typographique que l'ancien h1
                  (précédent acté sur cette page) : Effra, italique, gras.
                  Le formulaire montant libre n'est plus ici (il clôt la liste
                  des contreparties), seule l'ancre y mène.
                  TODO(contenu) : le docx s'intitule « Slogans » (pluriel)
                  mais n'en livre qu'un — d'autres variantes pourraient
                  arriver. */}
              {/* Ni ce bloc ni l'étagère qu'il contient ne doivent jamais être
                  enveloppés dans <Reveal> : son `transform` (l'animation
                  d'apparition) crée un containing block qui casse le pop-out
                  3D des dos (position/transform absolus calés sur ce bloc).
                  Pour la même raison, aucun `overflow-hidden` ne doit jamais
                  être posé ici, sur la `Container` ou sur la `section` : ça
                  clipperait le livre déplié, qui déborde largement du bloc. */}
              <div className="bg-ink p-7 text-paper sm:p-9">
                <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-paper sm:text-5xl">
                  100 ans d’édition marxiste : <span className="text-pop-yellow">aidez-nous à poursuivre l’histoire.</span>
                </h1>
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

              {/* Récit — mise en forme par registre (texte du docx VERBATIM,
                  seule la composition varie) : chaque section porte un accent
                  de marque selon son contenu — crise = brick (le langage
                  d'alerte du site, cf. panier), bataille politique = navy,
                  héritage centenaire = ocher (`text-ocher-text`, la variante
                  lisible sur paper), appel = bottle. Les phrases-slogans du
                  docx passent en display Effra black italic ; le descriptif
                  reste en corps 15px/ink-70. Jamais de palette pop ici (R2). */}

              {/* Section 1 — la crise : « danger maximal » crié en brick,
                  le montant perdu scalé dans la phrase, la chute (« coup
                  fatal ») en punchline bordée. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Édition indépendante et critique :{" "}
                  <span className="uppercase tracking-[.02em] text-brick">danger maximal</span>
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    En cette fin d’été 2026, l’édition de critique sociale fait
                    face à une des pires crises de son histoire. Des centaines de
                    maisons indépendantes sont menacées par la faillite de leur
                    distributeur Makassar qui disparaît avec des dettes importantes.
                  </p>
                  <p>
                    Pour Les éditions sociales et La Dispute, c’est plus de{" "}
                    <strong className="whitespace-nowrap font-sans text-[1.45em] font-black italic leading-none text-brick">
                      130&nbsp;000&nbsp;€
                    </strong>{" "}
                    de ventes en librairie que nous ne toucherons jamais
                    pour des livres dont nous avons pourtant payé des frais
                    d’impression et de maquette, ainsi que des avances de droits
                    d’auteur.
                  </p>
                  <p className="border-l-4 border-brick pl-4 font-sans text-xl font-black italic leading-tight text-ink sm:text-2xl">
                    Pour nos maisons, c’est le genre de coup qui peut être fatal.
                  </p>
                </div>
              </Reveal>

              {/* Section 2 — la bataille matérielle : le titre EST un slogan
                  (« guerre matérielle » souligné navy), le 90 % des groupes
                  scalé dans la phrase, la chute — « un devoir politique » —
                  surlignée au marqueur navy inversé. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  La guerre culturelle est aussi une{" "}
                  <span className="underline decoration-navy decoration-4 underline-offset-4">
                    guerre matérielle
                  </span>
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    La faillite de Makassar est le résultat d’un marché de
                    l’édition où les grands groupes — Hachette, Editis,
                    Média-Participations, Madrigall — détiennent à eux seuls près de{" "}
                    <strong className="whitespace-nowrap font-sans text-[1.45em] font-black italic leading-none text-navy">
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
                    <strong className="font-semibold text-ink">
                      la fin de la propriété privée des moyens de production
                      culturelle et des infrastructures de distribution
                    </strong>
                    .
                  </p>
                  <p className="font-sans text-xl font-black italic leading-snug text-ink sm:text-2xl">
                    Et, parce que la bataille des idées est aussi une guerre
                    matérielle, soutenir les éditeurs indépendants est{" "}
                    {/* `whitespace-nowrap` : un marqueur coupé en fin de ligne
                        chevaucherait la ligne du dessus (leading serré des
                        displays) — le marqueur passe à la ligne entier. */}
                    <span className="whitespace-nowrap bg-navy px-2 text-paper">
                      un devoir politique
                    </span>
                    .
                  </p>
                </div>
              </Reveal>

              {/* Section 3 — les maisons, cent ans : le « 100 ans » géant et
                  légèrement penché (énergie affiche/sticker de la campagne),
                  l'anaphore « Cent ans de… » composée en litanie bordée
                  ocher ; le reste (chantiers, équipe) demeure descriptif. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Les éditions sociales et La Dispute
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p className="font-sans text-xl font-bold leading-snug text-ink">
                    En 2027, nos maisons fêteront leurs{" "}
                    <span className="my-1 inline-block -rotate-2 whitespace-nowrap font-black italic text-5xl leading-[0.9] text-ocher-text sm:text-6xl">
                      100 ans
                    </span>{" "}
                    d’existence.
                  </p>
                  <p className="border-l-4 border-ocher pl-4 font-sans text-lg font-bold leading-snug text-ink">
                    Cent ans de traductions de Marx et de livres marxistes et de
                    formation militante.
                  </p>
                  <p className="border-l-4 border-ocher pl-4 font-sans text-lg font-bold leading-snug text-ink">
                    Cent ans de publications exigeantes, pour éclairer les
                    transformations du capitalisme, des classes sociales, mener la
                    critique féministe et faire vivre le débat à gauche.
                  </p>
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
              </Reveal>

              {/* Section 4 — l'appel : adresse directe, donc tout en display —
                  titre scalé avec « de vous » au marqueur bottle, paragraphe
                  unique agrandi (c'est l'ask du récit, pas un descriptif). */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
                  Nous avons besoin{" "}
                  <span className="whitespace-nowrap bg-bottle px-2 text-paper">
                    de vous
                  </span>
                </h2>
                <div className="mt-4 max-w-[62ch]">
                  <p className="font-sans text-lg font-medium leading-relaxed text-ink sm:text-xl">
                    Nous voulons que notre histoire se poursuive ; c’est pourquoi
                    nous faisons appel à vous. En faisant un don, vous nous aiderez
                    à surmonter cette crise, à{" "}
                    <strong className="font-bold underline decoration-bottle decoration-4 underline-offset-4">
                      préserver notre indépendance
                    </strong>{" "}
                    et à poursuivre un travail éditorial engagé, exigeant et
                    indispensable.
                  </p>
                </div>
              </Reveal>

              {/* Objectifs de la jauge — pas de titre de section au-dessus,
                  la jauge d'ouverture porte déjà « Objectif » : les cellules
                  parlent d'elles-mêmes. */}
              <FramedGrid className="grid-cols-1 sm:grid-cols-3">
                {OBJECTIFS.map((o) => (
                  <Reveal key={o.titre} className="h-full">
                    <div
                      className={`flex h-full flex-col ${o.sommet ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                    >
                      <div aria-hidden="true" className={`h-2 ${o.accent}`} />
                      <div className="flex flex-1 flex-col gap-2 p-6">
                        <span className="font-sans text-3xl font-black italic">
                          {formatInt(o.value)}&nbsp;€
                        </span>{" "}
                        <span className="font-sans text-base font-extrabold uppercase tracking-[.02em]">
                          {o.titre}
                        </span>
                        <p
                          className={`mt-1 text-sm leading-relaxed ${o.sommet ? "text-paper/70" : "text-ink/70"}`}
                        >
                          {o.desc}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </FramedGrid>
            </div>
          </Container>
        </section>

        {/* CTA final — phrase de clôture du docx, verbatim. Le montant libre
            vivant désormais en clôture du rail, le CTA y renvoie simplement. */}
        <section className="bg-ink text-paper">
          <div className="grid grid-cols-4" aria-hidden="true">
            {POP_BG.map((c) => (
              <div key={c} className={`h-1.5 ${c}`} />
            ))}
          </div>
          <Container className="flex flex-col items-start gap-6 py-16 sm:py-20 md:flex-row md:items-center md:justify-between">
            <h2 className="max-w-2xl font-sans text-3xl font-black italic leading-[1.05] sm:text-4xl">
              Vous nous permettrez de continuer à publier les livres qui
              imaginent la fin du capitalisme plutôt que la fin du monde.
            </h2>
            <Button
              href="#paliers"
              variant="invert"
              aria-label="Contribuer — voir les contreparties"
              className="shrink-0 px-7 py-3.5 text-sm font-extrabold tracking-[.03em]"
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

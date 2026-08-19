import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { ImpactFrame } from "@/components/impact-frame";
import { Reveal } from "@/components/reveal";
import { formatInt } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { CAMPAIGN_2026_PALIERS, deriveCampaign2026 } from "@/lib/donation-tiers";
import { RAIL_GRID_CLASS, RAIL_GRID_TRANSITION_CLASS } from "@/components/rail-inset";
import { POP_BG, POP_ORDER } from "@/components/pop-palette";
import { youTubeEmbedUrl } from "@/lib/video";
import { getCampaign2026 } from "@/lib/donations";
import { getNewReleases } from "@/lib/catalogue";
import { getPageSouscription } from "@/lib/site-content";
import { CollecteTicker } from "./_components/collecte-ticker";
import { HeroShelf, MobileShelf } from "./_components/shelf";
import { BottomSheet } from "@/components/bottom-sheet";
import { OPENING_MICROCOPY, TiersRail } from "./_components/tiers-rail";
import { TiersDrawer } from "./_components/tiers-drawer";

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
 * texte client inchangé à l'octet. Compteur monumental sur bloc paper
 * d'ouverture (l'aplat ink a glissé sur le bloc vidéo qui suit, retour Youri
 * 26/07 — l'affiche s'ouvre clair et bascule au noir sur la vidéo), ask
 * éclaté en trois échelles (le h1 reste UN SEUL <h1>, spans stylés), récit en quatre sections-bandeaux full-bleed
 * (orange/bleu/jaune/rose — la seule bande hazard de la page coiffe
 * « danger maximal »), objectifs en escalier typographique sous ombre dure
 * (R8) clos par la chute du docx et le CTA final (sur paper, sans bandeau —
 * retour Youri 25/07). Interdits d'arbitrage : aucun texte ajouté (pas de
 * numéros de section, pas de légende), pas de lettres au trait
 * (-webkit-text-stroke), pas de compression scaleX. Les displays géants sont en clamp() (variantes `lg:` : la
 * colonne perd 380px au profit du rail, la pente vw doit se resserrer).
 *
 * Palette (retour Clara 2026-08-07, « attention à bien utiliser les couleurs
 * du site : le bleu, le rose, le jaune et l'orange ») : TOUTE la page est
 * passée des accents de couverture (navy/bottle/ocher/brick) aux quatre
 * couleurs du site — `pop-palette.ts`. Elles sont claires : rien n'y porte
 * plus `text-paper`, et seul l'orange sert de couleur de texte sur paper (AA
 * large). Restent hors palette, à dessein, les pages d'état du parcours
 * (`/souscription/merci`, `/souscription/erreur`), où bottle/ocher/brick sont
 * la SÉMANTIQUE succès/attente/échec partagée avec le panier (R3).
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
 * principale — jauge de collecte en direct (TOUJOURS visible, paliers
 * réinscrits sous la barre et gros CTA orange à droite du compteur — retour
 * Youri, soir du 26/07 ; rail et feuille mobile restent les entrées
 * principales vers le paiement), corps de texte ouvert par le slot
 * vidéo (placeholder tant qu'aucune vidéo n'est livrée) puis ask — h1, lien
 * d'ancre mobile vers `#paliers`, étagère 3D des dernières parutions
 * (preuve matérielle du slogan, 3D en lg+, repli en grille de couvertures
 * 2×4 sous `lg`) —, quatre sections narratives, objectifs de jauge, CTA
 * final — ; contreparties éditables en rail sticky à droite de la PAGE
 * ENTIÈRE (`#paliers`, hors du corps de texte), clôturé par la carte
 * « montant libre » (le formulaire ne vit plus ni dans l'ask ni dans le CTA
 * final). Sous `lg`, ce même rail devient une FEUILLE DE BAS D'ÉCRAN
 * (`BottomSheet`) : repliée en bandeau « Contribuer », elle se déroule seule
 * 1 s après le chargement et se replie au glissé du doigt ; les CTA d'ancre
 * `#paliers`/`#montant-libre` la redéploient (`anchors`).
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
 * Liseré multicolore qui clôt le bloc de collecte : les quatre couleurs du
 * site dans leur ordre canonique (`POP_ORDER`, `pop-palette.ts`) — depuis le
 * retour Clara du 2026-08-07, cette palette n'est plus l'exception de la page
 * mais SA palette (bandeaux du récit, escalier des objectifs, cartes du rail,
 * jauge et liseré de collecte) : les accents de couverture navy/bottle/ocher/
 * brick ont quitté /souscription.
 *
 * Ses coupes ne sont plus quatre parts égales mais les ABSCISSES DE LA JAUGE,
 * sur l'empan total de la demi-droite (120 k€ = objectif × 1,2) : 0-50 k
 * (41,666 %), 50-80 k (25 %), 80-100 k (16,667 %), puis le dépassement
 * 100-120 k (16,667 %) — d'où `POP_COLS`, mêmes nombres en `fr`. Rime
 * STRUCTURELLE : le liseré répète la géométrie de la barre, jamais sa donnée
 * vivante (il reste décoratif — R2, aria-hidden — et ne bouge pas d'un pixel
 * avec la collecte). En `fr` plutôt qu'en pourcentages : la grille répartit
 * l'arrondi elle-même, quatre largeurs en % laisseraient un jour sous-pixel
 * au bout du liseré.
 *
 * La queue en pointillés de la jauge n'a PAS d'écho ici : elle ne commence
 * qu'à 105 k€ (87,5 % de l'empan), pas au palier — un dernier segment tireté
 * copierait une coupe qui n'existe pas.
 */
const POP_LISERE = POP_ORDER.map((c) => POP_BG[c]);
const POP_COLS = "grid-cols-[41.666fr_25fr_16.667fr_16.667fr]";

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
 * liseré d'accent (orange → jaune → rose, même échelle que les sections du
 * récit) ET par le montant qui grossit d'une marche à l'autre (`display`,
 * classes clamp littérales — contrat JIT) ; la barre du sommet
 * (« On construit », l'objectif plein) est la seule inversée en ink.
 */
/**
 * Union littérale des montants de palier 2026 — dérivée À LA MAIN de
 * `CAMPAIGN_2026_PALIERS` (`src/lib/donation-tiers.ts`, table « docx client,
 * définitifs »), et non automatiquement : cette table y est annotée
 * `Palier[]` (pas `as const`), donc son `value` est déjà `number` au moment
 * où ce module l'importe — aucun littéral ne survit à cette annotation
 * (`src/lib/donation-tiers.ts` n'appartient pas à ce périmètre). Cette union
 * fait au moins refuser au compilateur toute clé INCONNUE ou MANQUANTE dans
 * `OBJECTIF_EXTRAS` ci-dessous ; l'invariant juste après couvre l'autre sens
 * (un montant qui change côté source) en le faisant échouer bruyamment au
 * lieu de fusionner silencieusement des extras `undefined`.
 */
type PalierAmount = 50_000 | 80_000 | 100_000;

const OBJECTIF_EXTRAS: Record<
  PalierAmount,
  { desc: string; accent: string; display: string; sommet?: boolean }
> = {
  50_000: {
    desc: "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
    accent: POP_BG.orange,
    display: "text-[clamp(32px,8vw,52px)]",
  },
  80_000: {
    desc: "Nous pouvons absorber l’essentiel de la perte, mener à bien les projets déjà engagés et confirmer l’arrivée de Nicolas Vieillescazes dans l’équipe.",
    accent: POP_BG.yellow,
    display: "text-[clamp(38px,9.5vw,68px)]",
  },
  100_000: {
    // TODO(contenu) : phrase possiblement tronquée dans le docx (le point
    // final manque) — conservée telle quelle.
    desc: "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    accent: POP_BG.pink,
    display: "text-[clamp(44px,11vw,84px)]",
    sommet: true,
  },
};

// Invariant de synchronisation : si `CAMPAIGN_2026_PALIERS` gagne, perd ou
// modifie un montant sans que `PalierAmount`/`OBJECTIF_EXTRAS` suivent (le
// cas EN SILENCE visé plus haut), ce module lève au premier rendu/à la
// génération statique plutôt que de laisser l'escalier des objectifs se
// composer avec des extras manquants.
for (const p of CAMPAIGN_2026_PALIERS) {
  if (!(p.value in OBJECTIF_EXTRAS)) {
    throw new Error(
      `souscription/page.tsx : OBJECTIF_EXTRAS ne couvre pas le palier ${p.value} de CAMPAIGN_2026_PALIERS — mettre à jour PalierAmount et OBJECTIF_EXTRAS.`,
    );
  }
}

const OBJECTIFS = CAMPAIGN_2026_PALIERS.map((p) => ({
  value: p.value,
  titre: p.label,
  ...OBJECTIF_EXTRAS[p.value as PalierAmount],
}));

export const metadata: Metadata = {
  title: "Souscription",
  // ≤ 160 caractères (Google tronque au-delà) : crise + appel + fourchette.
  description:
    "La faillite de notre distributeur menace 100 ans d’édition marxiste indépendante. Soutenez Les Éditions sociales et La Dispute — contreparties de 15 à 1 000 €.",
  alternates: { canonical: "/souscription" },
  // Issue #87a : `opengraph-image.jpg` colocalisé est un fichier de
  // convention Next DISTINCT de `twitter-image` (aucun des deux ne se
  // déduit de l'autre — pas de repli automatique) ; sans `twitter-image`
  // colocalisé, aucun `twitter:image` n'est jamais émis pour cette page.
  // `summary_large_image` déclarait donc une carte large sans image réelle.
  // `summary` reflète ce que le crawler Twitter/X reçoit effectivement ; si
  // un `twitter-image.jpg` est un jour ajouté ici, ce champ redevient
  // `summary_large_image` (aucun autre changement requis).
  twitter: { card: "summary" },
};

export const revalidate = 3600; // fenêtre ISR (contreparties lues dans Payload/Postgres)

/**
 * JSON-LD Organization + DonateAction — aide crawlers (et LLM-crawlers) à
 * qualifier la page pendant la campagne. Constante FIGÉE construite en code,
 * jamais de contenu CMS : hors de la règle SafeHtml (`src/app/CLAUDE.md`),
 * qui vise le HTML éditorial injecté.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr";
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
 * Bande hazard ink/orange — la SEULE de la page (arbitrage du panel), au
 * sommet du bandeau « danger maximal ». Hachures en repeating-linear-gradient
 * arbitrary (classe littérale, variables de thème — R1). Noir/orange est le
 * couple de danger canonique : l'ex-brick s'y lisait mal contre l'ink.
 */
const HAZARD_BG =
  "bg-[repeating-linear-gradient(-45deg,var(--color-ink)_0_12px,var(--color-pop-orange)_12px_24px)]";

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
  const enabled = stripeEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `stripeEnabled()`
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
  // CTA « Contribuer » du bloc collecte : une seule définition PARAMÉTRÉE par
  // sa cible, rendue à plusieurs endroits — jamais deux en même temps
  // (`hidden`/`lg:hidden` s'excluent), donc aucun doublon dans l'arbre a11y.
  const contribuerCta = (href: string) => (
    <div className="text-center">
      <Button
        href={href}
        variant="alarm"
        aria-label="Contribuer — voir les contreparties"
        className="px-10 py-5 text-lg tracking-[.04em] sm:px-14 sm:py-7 sm:text-3xl"
      >
        Contribuer
      </Button>
      {/* Avant l'ouverture, le rail garde ses CTA morts : la date sous le
          bouton évite la promesse en l'air (même microcopie que `ClosedCta`,
          source unique). */}
      {!enabled && (
        <p className="mt-1.5 font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-ink-soft">
          {OPENING_MICROCOPY}
        </p>
      )}
    </div>
  );
  /**
   * Cible UNIQUE de tous les CTA d'ancre de la page. Elle l'est redevenue le
   * 2026-08-19 : le rail est un TIROIR dans les deux régimes — feuille de bas
   * d'écran sous `lg`, panneau latéral au-dessus — et `#paliers` le DÉPLOIE
   * partout. C'était tout l'objet du retour Clara du 2026-08-07 (« le bouton
   * ne marche pas ») : à l'époque le rail desktop était toujours ouvert, le
   * saut n'avait nulle part où aller et le clic ne produisait rien ; on visait
   * alors `#montant-libre` en `lg+` pour au moins faire défiler la boîte du
   * rail, d'où deux cibles et un rendu des CTA en deux exemplaires exclusifs.
   * Les deux ont disparu : un CTA, une cible, un geste.
   *
   * Ouvert, le tiroir répond quand même (liseré d'appel + retour en haut de la
   * liste) — cf. `_components/tiers-drawer.tsx`. `#montant-libre` reste une
   * ancre VALIDE (elle arrive encore par lien externe) : les deux régimes la
   * déclarent dans leurs `anchors`.
   */
  const PALIERS_CTA = "#paliers";

  return (
    /* La colonne du rail EST le panneau du tiroir (`_components/tiers-drawer.tsx`) :
       elle vaut 380px ouverte, 0 fermée, et sa course vit ICI, sur
       `grid-template-columns` — la même que celle de la réserve du header
       (`site-header.tsx`) et des commandes fixées au bord droit. Les trois
       partent et arrivent ensemble ; une seule qui sauterait suffirait à
       casser le geste. */
    <div className={`lg:grid ${RAIL_GRID_CLASS} ${RAIL_GRID_TRANSITION_CLASS} lg:items-start`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      {/* Liseré de collecte fixé en haut du viewport (10px, prototype validé
          client — variante V2 « lecture = lutte ») : le remplissage progresse
          avec le scroll, rescalé pour que le bas de page coïncide avec le
          niveau réel de la collecte. Il double la jauge du héros à l'échelle de
          la page entière ; le header lui réserve sa hauteur (`railInset`,
          `site-header.tsx`). Jamais monté en panne Stripe — pas de total
          honnête à afficher. */}
      {!outage && (
        <CollecteTicker value={liveCampaign.gauge.value} max={liveCampaign.gauge.max} />
      )}
      {/* Colonne principale (jauge, corps de texte, CTA final) — le rail des
          contreparties vit en frère de DOM, sur la droite de la page entière,
          et monte jusqu'en haut de page en lg+ (`lg:-mt-24` dans TiersRail,
          navbar resserrée à gauche via `railInset` — largeur de colonne 380px
          à garder en phase avec `site-header.tsx`). */}
      <div className="min-w-0">
        {/* 1 ▪ La collecte en direct OUVRE la page — compteur de lutte
            monumental sur bloc paper pleine largeur (inversion paper↔ink avec
            le bloc vidéo, retour Youri 26/07), gros CTA orange sur son flanc
            droit et jauge 2026 vivante en demi-droite, paliers réinscrits
            sous la barre (retour Youri, soir du 26/07 — la barre nue et la
            suppression du CTA du matin sont revenues en arrière ; le module
            « Objectif », lui, reste supprimé). N'affiche que ce qu'une
            campagne en cours peut honnêtement montrer (collecté net +
            contributeurs). Fenêtre de fraîcheur ~1–3 min, voir
            `src/app/CLAUDE.md`. */}
        <section className="bg-paper text-ink">
          <Container className="py-12 sm:py-16">
            <Reveal>
              {/* Frame d'impact : compteur et jauge courent 1600 ms sur le
                  même easeOutCubic — encore faut-il qu'ils PARTENT ensemble.
                  `ImpactFrame` hisse le déclencheur au bloc entier ; le total
                  et la barre se posent alors sur la même frame. Le fondu du
                  `Reveal` garde, lui, son propre seuil. */}
              <ImpactFrame>
                {/* Compteur à gauche, gros CTA orange à droite : le CTA d'ancre
                    revient (retour Youri — « comble le vide à droite du
                    montant ») en variante `alarm` (orange bordé d'ink, seul
                    rouge qui tienne sur paper) et en corps d'affiche. Il
                    DOUBLE l'entrée vers le paiement que portent déjà le rail
                    et la feuille mobile ; sous `lg`, la feuille intercepte
                    l'ancre `#paliers` et se redéploie. Sa cellule ABSORBE le
                    flanc droit (`grow`) et le centre dans les DEUX axes face
                    au compteur (retour Youri — collé bas-droite, il n'était
                    « pas du tout centré »). Repli en DEUX rendus du MÊME
                    `contribuerCta` plutôt qu'un `flex-wrap` sans borne
                    (retour Youri 26/07 : un simple flex-wrap laissait le
                    bouton chevaucher le chiffre au lieu de se replier
                    proprement, et de toute façon son repli passait entre le
                    montant et la barre, ce qui n'est jamais permis) : le seuil
                    est `xl`, PAS `lg` — mesuré en direct (constat client
                    26/07), le rail de 380px rétrécit déjà la colonne à `lg`,
                    où montant + bouton ne rentrent PAS encore (chevauchement
                    vérifié jusqu'à ~1150px, marge saine à partir de `xl`,
                    1280px). Dès `xl` le bouton rejoint le montant dans UNE
                    rangée flex (`flex-wrap` gardé en garde-fou si le montant
                    grossit un jour au-delà de cette marge) ; sous `xl` cette
                    cellule est masquée et un second rendu du même CTA prend
                    place APRÈS la jauge, jamais entre elle et le montant.
                    Rendu dans les quatre états du bloc (panne comprise : le
                    paiement, lui, fonctionne — seul le total est muet).
                    L'ex-module « Objectif » reste supprimé. */}
                <div className="flex flex-col gap-6 xl:flex-row xl:flex-wrap xl:gap-x-8 xl:gap-y-6">
                  <div className="min-w-0">
                    {outage ? (
                      <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
                        La collecte est en cours — le total s’affichera de nouveau
                        dans quelques minutes.
                      </p>
                    ) : !enabled ? (
                      /* Avant l'ouverture (E1), les CTA du rail sont désactivés :
                         annoncer la date plutôt qu'un « soyez les premier·ères »
                         contradictoire avec des boutons morts. */
                      <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
                        La souscription ouvre le 20 août — découvrez déjà les
                        contreparties.
                      </p>
                    ) : (
                      /* Le montant monumental est TOUJOURS rendu, 0 EUR compris
                         (arbitrage client 2026-08-19) : le placeholder de
                         lancement qui prenait sa place sous 1 € est supprimé —
                         il tenait la place du chiffre au lieu de le montrer.
                         Seules les DEUX branches d'honnêteté au-dessus (panne
                         Stripe, dons pas encore ouverts) remplacent encore le
                         compteur — ce sont des garde-fous, pas des
                         placeholders (`counter.test.tsx` le verrouille).
                         Les `{" "}` autour des <CountUp> sont porteurs : JSX
                         supprime les blancs contenant un retour à la ligne — sans
                         eux, AT/copier-coller lisent « 11 014 €réunis ». Les
                         nœuds espace entre spans `block` ne sont pas rendus : zéro
                         impact visuel. La phrase reste UN SEUL <p> (ordre de
                         lecture intact), seuls les spans posent les échelles.
                         Le surtitre « Déjà » est supprimé (25/07, retour Youri) :
                         le compteur ouvre directement le bloc. */
                      <p className="text-lg leading-snug text-ink-soft">
                        <span className="block">
                          <CountUp
                            value={liveCampaign.collected}
                            suffix=" €"
                            className="font-sans text-[clamp(56px,18vw,128px)] font-black italic leading-[0.85] tracking-[-0.02em] text-ink lg:text-[clamp(56px,9vw,128px)]"
                          />
                        </span>{" "}
                        {/* Sous-ligne rendue seulement À PARTIR DE 1
                            contributeur·rice : « réunis auprès de 0
                            contributeur·rices » serait la même phrase creuse que
                            le placeholder supprimé. */}
                        {liveCampaign.contributors > 0 && (
                          <span className="mt-4 block">
                            réunis auprès de{" "}
                            <CountUp
                              value={liveCampaign.contributors}
                              className="font-sans text-2xl font-black italic text-ink"
                            />{" "}
                            contributeur·rices.
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {/* CTA en position « à côté du montant » : UNIQUEMENT dès
                      `xl` (marge saine mesurée, cf. commentaire plus haut),
                      masqué en dessous — le second rendu, après la jauge,
                      prend le relais (cf. plus bas). */}
                  <div className="hidden xl:flex xl:grow xl:items-center xl:justify-center">
                    {contribuerCta(PALIERS_CTA)}
                  </div>
                </div>
                {/* La barre SOULIGNE le bloc du compteur au lieu de flotter
                    sous lui : elle appartient au chiffre — sibling de la
                    rangée montant/bouton, TOUJOURS pleine largeur (jamais
                    contrainte par la colonne du montant ni par celle du
                    bouton). La jauge a repris sa réserve HAUTE (l'inscription
                    80 k€ vit au-dessus de la barre) : curseur et inscriptions
                    logent dans le composant, ce `mt-4` n'est qu'un cran d'air
                    entre le compteur et la bande. */}
                {!outage && (
                  <Gauge
                    className="mt-4"
                    tone="light"
                    value={liveCampaign.gauge.value}
                    max={liveCampaign.gauge.max}
                    markers={liveCampaign.gauge.markers}
                  />
                )}
                {/* CTA en position de repli : sous `xl` SEULEMENT (exclusif
                    avec le rendu ci-dessus), toujours APRÈS la jauge — jamais
                    entre elle et le montant. Cette position couvre les DEUX
                    régimes (feuille sous `lg`, rail de `lg` à `xl`) : d'où
                    deux rendus exclusifs, chacun avec sa cible. */}
                <div className="mt-6 flex justify-center xl:hidden">
                  {contribuerCta(PALIERS_CTA)}
                </div>
              </ImpactFrame>
            </Reveal>
          </Container>
          {/* Liseré des quatre couleurs du site en pied de bloc, posé sur la
              couture paper → ink. Décoratif pur (aria-hidden). Coupé aux
              abscisses des paliers (cf. POP_COLS) : le pied du bloc rime avec
              la barre qui le surmonte. */}
          <div className={`grid ${POP_COLS}`} aria-hidden="true">
            {POP_LISERE.map((c) => (
              <div key={c} className={`h-1.5 ${c}`} />
            ))}
          </div>
        </section>

        {/* 2 ▪ Vidéo de présentation — OUVRE le corps de texte ; tant
            qu'aucune vidéo n'est livrée, un placeholder au même format tient
            la place (le bloc ne disparaît jamais). Cadre hachuré à ombre
            dure (R8, recette littérale), INVERSÉ : depuis l'échange des fonds
            avec le bloc de collecte (retour Youri 26/07) la vidéo est posée
            sur ink — bordure et ombre passent donc en paper, et la hachure du
            placeholder en ink/bleu. Le bloc porte sa propre gouttière basse
            (un aplat de couleur ne peut pas s'appuyer sur le padding de la
            section suivante, restée sur paper). */}
        <section className="bg-ink text-paper">
          <Container className="py-14 sm:py-16">
            <Reveal>
              {videoEmbed ? (
                <div className="border-2 border-paper bg-ink shadow-[8px_8px_0_0_var(--color-paper)]">
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
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 border-2 border-paper bg-[repeating-linear-gradient(-45deg,var(--color-ink)_0_14px,var(--color-pop-teal)_14px_28px)] shadow-[8px_8px_0_0_var(--color-paper)] print:hidden">
                  {/* SVG plutôt que le caractère ▶ : Effra ne couvre pas les
                      glyphes géométriques, le rendu retombait sur la fonte
                      système (forme et centrage variables selon l'OS). */}
                  <span
                    aria-hidden="true"
                    className="flex h-16 w-16 items-center justify-center border-2 border-paper bg-paper text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                      <path d="M6 4 L20 12 L6 20 Z" />
                    </svg>
                  </span>
                  <p className="px-4 text-center font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/80">
                    La vidéo de la souscription — bientôt
                  </p>
                </div>
              )}
            </Reveal>
          </Container>
        </section>

        {/* 3 ▪ L'ask 2026 — le slogan en trois échelles (affiche) : « 100
            ans » en aplat plein très grand, la qualification en capitales,
            puis l'étagère des dernières parutions SOUS le titre (maquette
            25/07). En lg+, la demande (« aidez-nous… ») est posée SUR le
            rayon, dans l'espace vide à droite du dernier dos — la place des
            prochains livres ; sous lg elle suit la grille de couvertures dans
            le même conteneur, sur paper. Le h1 reste UN SEUL <h1> portant tout le
            slogan verbatim dans l'ordre : la demande y vit en sr-only, ses
            deux rendus visibles (rayon lg / bandeau mobile) sont
            aria-hidden — une seule lecture SR, zéro duplication dans
            l'arbre a11y. L'étagère ne vit JAMAIS sous un Reveal (son
            transform crée un containing block qui casse le pop-out 3D) ni
            sous un overflow-hidden (clipperait le livre déplié).
            Le formulaire montant libre n'est plus ici non plus (il clôt la
            liste des contreparties), seule l'ancre y mène.
            TODO(contenu) : le docx s'intitule « Slogans » (pluriel) mais
            n'en livre qu'un — d'autres variantes pourraient arriver. */}
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
            <span className="sr-only">aidez-nous à poursuivre l’histoire.</span>
          </h1>
          {/* lg+ : l'étagère sous le titre, la demande posée sur le rayon. */}
          <div className="mx-auto mt-10 hidden w-full max-w-6xl px-5 sm:px-8 lg:block">
            <div role="group" aria-label="Dernières parutions">
              <HeroShelf
                books={shelfBooks}
                trailing={
                  // Trois points médians AVANT la demande (retour Youri
                  // 25/07) : les livres à venir, posés sur le rayon — ils
                  // décalent d'autant le texte vers la droite.
                  <span aria-hidden="true" className="flex items-end gap-6 pb-2 pl-6">
                    <span className="block font-sans text-[clamp(30px,3.4vw,46px)] font-black leading-[0.7] tracking-[.12em] text-ink/40">
                      ···
                    </span>
                    <span className="block max-w-[15ch] font-sans text-[clamp(30px,3.4vw,46px)] font-black italic leading-[0.95] text-ink">
                      aidez-nous à poursuivre l’histoire.
                    </span>
                  </span>
                }
              />
            </div>
          </div>
          {/* Sous lg : le repli 2×4 de l'étagère (R7), puis la demande + son
              CTA sur UNE SEULE ligne, dans le MÊME conteneur que la grille de
              couvertures (retour Youri 25/07) : la demande est le pendant
              mobile du texte posé sur le rayon en lg+, elle se lit donc dans
              la foulée des couvertures — plus de bandeau ink pleine largeur,
              qui creusait un gap et un changement de fond pour deux lignes.
              Le bouton « Contribuer » est centré verticalement à DROITE du
              texte. La demande reste `aria-hidden` (le h1 la porte en
              sr-only) mais le bouton, lui, doit rester dans l'arbre a11y :
              d'où l'attribut sur le seul <p>, jamais sur la rangée. */}
          <div className="mx-auto mt-8 w-full max-w-6xl px-5 sm:px-8 lg:hidden">
            <MobileShelf books={shelfBooks} />
            <div className="mt-6 flex items-center gap-4 sm:mt-8 sm:gap-6">
              <p
                aria-hidden="true"
                className="min-w-0 flex-1 font-sans text-[clamp(22px,6vw,54px)] font-black italic leading-[0.95] text-ink"
              >
                aidez-nous à poursuivre l’histoire.
              </p>
              {/* Bloc `lg:hidden` : ce CTA n'existe qu'en régime feuille. */}
              <Button
                href={PALIERS_CTA}
                aria-label="Contribuer — voir les contreparties"
                className="shrink-0 px-4 py-3 text-[13px] font-extrabold tracking-[.03em] sm:px-6 sm:py-3.5 sm:text-sm"
              >
                Contribuer
              </Button>
            </div>
          </div>
        </section>

        {/* 4 ▪ Récit — quatre sections-bandeaux (texte du docx VERBATIM,
            seule la composition varie) : chaque h2 reste UN SEUL <h2> —
            kicker en corps modéré ET chute en display géant DANS le même
            bandeau plein full-bleed à l'accent de la section. Les quatre
            accents sont désormais LES COULEURS DU SITE (retour Clara
            2026-08-07) : crise = orange (le plus proche du brick d'alerte),
            bataille politique = bleu, héritage centenaire = jaune, appel =
            rose en crescendo. Elles sont toutes CLAIRES : le texte des
            bandeaux est en `ink` (l'ancien `text-paper` des aplats sombres
            tombe avec eux) et aucune ne sert de couleur de TEXTE sur paper,
            sauf l'orange (AA large seulement) — cf. `pop-palette.ts`.
            Les descriptifs partagent tous la MÊME recette de corps de texte
            (retour Youri 25/07, alignée sur le paragraphe de l'appel), d'un
            cran plus petite depuis le 2026-08-07 (« les textes sont trop
            gros ? On doit scroller pas mal » — Clara) : `max-w-[52ch]
            font-sans text-lg font-medium text-ink sm:text-xl
            sm:leading-[1.55]`. Le plancher de 18px posé le 25/07 tient — le
            corps 15-17px reste banni. */}

        {/* Section 1 — la crise : « danger maximal » crié sur bandeau orange
            coiffé de la bande hazard, le montant perdu en exergue inline
            (max 1.8em — jamais un display dans la ligne), la chute (« coup
            fatal ») en display liseré orange au pied du descriptif, dans la
            colonne de texte. Marge réduite au minimum
            (25/07, retour Youri) : seule cette occurrence — juste après
            l'ask/étagère — perd le rythme mt-16/mt-24 commun aux autres
            transitions de section. */}
        <section className="mt-4 sm:mt-6">
          <Reveal>
            <h2 className="font-sans font-black italic text-ink">
              <span className={`block ${POP_BG.orange}`}>
                <span aria-hidden="true" className={`block h-3 ${HAZARD_BG}`} />
                <span className={`${SPAN_CONTAINER} py-7 sm:py-9`}>
                  <span className="block text-xl uppercase leading-tight tracking-[.04em] sm:text-2xl">
                    Édition indépendante et critique :
                  </span>{" "}
                  <span className="mt-4 block text-[clamp(44px,11vw,110px)] uppercase leading-[0.82] tracking-[-0.02em] sm:mt-5 lg:text-[clamp(44px,8vw,110px)]">
                    <span className="block">danger</span>{" "}
                    <span className="block">maximal</span>
                  </span>
                </span>
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <div className="max-w-[52ch] space-y-6 font-sans text-lg font-medium leading-relaxed text-ink sm:space-y-8 sm:text-xl sm:leading-[1.55]">
                <p>
                  En cette fin d’été 2026, l’édition de critique sociale fait
                  face à une des pires crises de son histoire. Des centaines de
                  maisons indépendantes sont menacées par la faillite de leur
                  distributeur Makassar qui disparaît avec des dettes importantes.
                </p>
                <p>
                  Pour Les éditions sociales et La Dispute, c’est plus de{" "}
                  <strong className="whitespace-nowrap font-sans text-[1.5em] font-black italic leading-none text-pop-orange sm:text-[1.8em]">
                    130&nbsp;000&nbsp;€
                  </strong>{" "}
                  de ventes en librairie que nous ne toucherons jamais
                  pour des livres dont nous avons pourtant payé des frais
                  d’impression et de maquette, ainsi que des avances de droits
                  d’auteur.
                </p>
              </div>
              {/* La chute clôt le descriptif DANS la colonne de texte (retour
                  Youri 25/07) : plus de bandeau ink pleine largeur, qui
                  ouvrait un gap et un second changement de fond dans la même
                  section. Le liseré orange reste le seul marqueur d'accent. */}
              <p className="mt-8 max-w-[70ch] border-l-[14px] border-pop-orange pl-5 font-sans text-[clamp(24px,5vw,36px)] font-black italic leading-[1.1] text-ink sm:mt-10 sm:pl-7">
                Pour nos maisons, c’est le genre de coup qui peut être fatal.
              </p>
            </Container>
          </Reveal>
        </section>

        {/* Section 2 — la bataille matérielle : tout le titre (kicker
            compris) sur bandeau bleu, le 90 % en marquage inline (le bleu ne
            tient pas en couleur de texte sur paper — cf. `pop-palette.ts` —,
            l'exergue devient donc un aplat, comme « la fin de la propriété
            privée… »), « un devoir politique » en soulignement ORANGE (padding
            vertical nul + leading du paragraphe hôte : le marqueur ne
            percute jamais la ligne précédente). Orange et non bleu : sur
            paper, seule cette teinte de la palette passe 3:1 en TRAIT
            (3,38:1 ; le bleu tombe à 1,74:1) — cf. `pop-palette.ts`. */}
        <section className="mt-12 sm:mt-16">
          <Reveal>
            <h2 className="font-sans font-black italic text-ink">
              <span className={`block ${POP_BG.teal}`}>
                <span className={`${SPAN_CONTAINER} py-7 sm:py-9`}>
                  <span className="block text-xl leading-tight sm:text-2xl">
                    La guerre culturelle est aussi une
                  </span>{" "}
                  <span className="mt-4 block text-[clamp(44px,11vw,110px)] uppercase leading-[0.82] tracking-[-0.02em] sm:mt-5 lg:text-[clamp(44px,8vw,110px)]">
                    <span className="block">guerre</span>{" "}
                    <span className="block">matérielle</span>
                  </span>
                </span>
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <div className="max-w-[52ch] space-y-6 font-sans text-lg font-medium leading-relaxed text-ink sm:space-y-8 sm:text-xl sm:leading-[1.55]">
                <p>
                  La faillite de Makassar est le résultat d’un marché de
                  l’édition où les grands groupes — Hachette, Editis,
                  Média-Participations, Madrigall — détiennent à eux seuls près de{" "}
                  <strong className="whitespace-nowrap box-decoration-clone bg-pop-teal px-1.5 font-sans text-[1.5em] font-black italic leading-none text-ink sm:text-[1.8em]">
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
                  <strong className="box-decoration-clone bg-pop-teal px-1 font-semibold text-ink">
                    la fin de la propriété privée des moyens de production
                    culturelle et des infrastructures de distribution
                  </strong>
                  .
                </p>
              </div>
              {/* Punchline en carton « Spécimen » : boîte bordée sous ombre
                  dure bleue (R8). */}
              <p className="mt-10 max-w-[38ch] border-2 border-ink bg-paper p-6 font-sans text-xl font-black italic leading-[1.2] text-ink shadow-[8px_8px_0_0_var(--color-pop-teal)] sm:mt-12 sm:p-8 sm:text-2xl">
                Et, parce que la bataille des idées est aussi une guerre
                matérielle, soutenir les éditeurs indépendants est{" "}
                {/* Soulignement (retour Youri 25/07, remplace le marqueur à
                    fond bleu) — même recette que « préserver notre
                    indépendance » plus bas, en ORANGE : seule teinte de la
                    palette qui tienne en trait sur paper (`pop-palette.ts`). */}
                <span className="underline decoration-pop-orange decoration-4 underline-offset-4">
                  un devoir politique
                </span>
                .
              </p>
            </Container>
          </Reveal>
        </section>

        {/* Section 3 — les maisons, cent ans : le titre entier en display
            sur bandeau jaune, le « 100 ans » en tampon penché conservé —
            REMPLI en jaune bordé d'ink depuis le passage à la palette du site
            (un filet jaune sur paper serait invisible, ≈1,1:1 — cf.
            `pop-palette.ts`) —, l'anaphore « Cent ans de… » en barres
            empilées séparées de hairlines ink. Reveal en deux blocs frères —
            héritage de l'ex-étagère-séparatrice (remontée sous le titre de
            l'ask le 25/07) ; sans coût, chaque bloc se révèle
            indépendamment. */}
        <section className="mt-12 sm:mt-16">
          <Reveal>
            <h2 className={`${POP_BG.yellow} font-sans font-black italic text-ink`}>
              <span
                className={`${SPAN_CONTAINER} py-6 text-[clamp(28px,6.5vw,64px)] uppercase leading-[0.95] sm:py-8`}
              >
                Les éditions sociales et La Dispute
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <p className="max-w-[30ch] font-sans text-lg font-bold leading-snug text-ink sm:text-xl">
                En 2027, nos maisons fêteront leurs{" "}
                <span className="mx-1 my-2 inline-block -rotate-2 whitespace-nowrap border-4 border-ink bg-pop-yellow px-3 py-1 align-middle font-black italic text-[clamp(40px,10vw,64px)] leading-[0.9] text-ink">
                  100 ans
                </span>{" "}
                d’existence.
              </p>
              <div className="mt-8 flex flex-col gap-[2px] border-2 border-ink bg-ink sm:mt-10">
                <p className="bg-pop-yellow px-5 py-5 font-sans text-base font-bold leading-snug text-ink sm:px-7 sm:py-6 sm:text-lg">
                  <span className="font-black italic uppercase">Cent ans</span> de
                  traductions de Marx et de livres marxistes et de formation
                  militante.
                </p>
                <p className="bg-paper-2 px-5 py-5 font-sans text-base font-bold leading-snug text-ink sm:px-7 sm:py-6 sm:text-lg">
                  <span className="box-decoration-clone bg-pop-yellow px-1.5 font-black italic uppercase text-ink">Cent ans</span> de
                  publications exigeantes, pour éclairer les transformations du
                  capitalisme, des classes sociales, mener la critique féministe
                  et faire vivre le débat à gauche.
                </p>
              </div>
            </Container>
          </Reveal>

          <Reveal>
            <Container>
              <div className="mt-10 max-w-[52ch] space-y-6 font-sans text-lg font-medium leading-relaxed text-ink sm:mt-12 sm:space-y-8 sm:text-2xl sm:leading-[1.45]">
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

        {/* Section 4 — l'appel : tout le h2 sur bandeau rose, en crescendo
            (« Nous avons besoin » modéré, « de vous » géant), clos par un
            POINT D'EXCLAMATION à la hauteur des deux lignes (retour Youri
            25/07) — seul ajout de texte au verbatim du docx, assumé comme
            ponctuation de l'ask. Les deux lignes passent en colonne flex pour
            que le « ! » se pose à leur droite : le corps du « ! » est calé
            sur la SOMME des deux hauteurs de ligne (≈16,4vw ÷ 0,72 de hauteur
            de glyphe), et son `leading` serré l'empêche de dicter la hauteur
            de la rangée. Le paragraphe unique reste agrandi (c'est l'ask du
            récit, pas un descriptif). */}
        <section className="mt-12 sm:mt-16">
          <Reveal>
            <h2 className={`${POP_BG.pink} font-sans font-black italic text-ink`}>
              <span className="mx-auto flex w-full max-w-6xl items-center gap-2 px-5 pb-8 pt-8 sm:gap-5 sm:px-8 sm:pb-10 sm:pt-10">
                <span className="block min-w-0 flex-1">
                  <span className="block text-[clamp(22px,5vw,44px)] uppercase leading-[0.9]">
                    Nous avons besoin
                  </span>{" "}
                  <span className="block text-[clamp(54px,14vw,140px)] uppercase leading-[0.85] tracking-[-0.02em] lg:text-[clamp(54px,10vw,140px)]">
                    de vous
                  </span>
                </span>
                <span className="block shrink-0 text-[clamp(92px,22vw,210px)] leading-[0.72] lg:text-[clamp(92px,17.5vw,210px)]">
                  !
                </span>
              </span>
            </h2>
            <Container className="pt-8 sm:pt-10">
              <p className="max-w-[52ch] font-sans text-lg font-medium leading-relaxed text-ink sm:text-xl sm:leading-[1.55]">
                Nous voulons que notre histoire se poursuive ; c’est pourquoi
                nous faisons appel à vous. En faisant un don, vous nous aiderez
                à surmonter cette crise, à{" "}
                <strong className="font-bold underline decoration-pop-orange decoration-4 underline-offset-4">
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
            porte déjà « Objectif » : les barres parlent d'elles-mêmes. La
            section se clôt sur la chute du récit et le CTA final — d'où le
            `pb-` : dernière section de la colonne, le CTA butait sinon
            directement sur le pied de page (zéro pixel sous le bouton). */}
        <section className="mt-12 pb-16 sm:mt-16 sm:pb-24">
          <Container>
            <Reveal>
              <div className="flex flex-col gap-[2px] border-2 border-ink bg-ink shadow-[8px_8px_0_0_var(--color-ink)]">
                {OBJECTIFS.map((o) => (
                  <div
                    key={o.titre}
                    className={`grid grid-cols-[10px_1fr] sm:grid-cols-[14px_1fr] ${o.sommet ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  >
                    <span aria-hidden="true" className={`block ${o.accent}`} />
                    {/* Corps agrandi sous `sm` (retour Youri 25/07) : sur
                        mobile, l'intitulé et le descriptif du palier passaient
                        en 15/14px sur une colonne pleine largeur — ils y sont
                        la seule explication de l'objectif, pas une légende. */}
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-7 sm:gap-y-3 sm:px-7 sm:py-8">
                      {/* `{" "}` porteur (hérité de l'ancienne grille) : les
                          nœuds espace entre blocs ne sont pas rendus, mais
                          AT/copier-coller séparent bien « 50 000 € » de son
                          intitulé. */}
                      <p className={`font-sans font-black italic leading-none ${o.display}`}>
                        {formatInt(o.value)}&nbsp;€
                      </p>{" "}
                      <div className="min-w-0 flex-1 basis-[26ch]">
                        <p className="font-sans text-base font-extrabold uppercase tracking-[.06em] sm:text-[15px]">
                          {o.titre}
                        </p>
                        <p
                          className={`mt-2 text-[15px] leading-relaxed sm:mt-1.5 sm:text-sm ${o.sommet ? "text-paper/80 sm:text-paper/70" : "text-ink/80 sm:text-ink/70"}`}
                        >
                          {o.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Chute du docx (verbatim) + CTA final : ils closent la section
                des objectifs (retour Youri 25/07) — plus de section propre à
                bandeau ink liseré pop, plus de changement de fond ni de gap.
                La phrase coule d'un seul trait (aucun span `block` : les
                retours à la ligne forcés de l'ancienne opposition d'échelle
                sont retirés) et « la fin du capitalisme » n'est plus qu'un
                SOULIGNEMENT orange (la seule teinte de la palette lisible en
                trait sur paper, cf. `pop-palette.ts`) — plus de surlignage,
                plus de display géant. UN SEUL <h2>. Le montant libre vivant en clôture du
                rail, le CTA y renvoie simplement. */}
            <Reveal>
              <h2 className="mt-12 max-w-[38ch] font-sans text-[clamp(24px,5vw,40px)] font-black italic leading-[1.15] text-ink sm:mt-16">
                Vous nous permettrez de continuer à publier les livres qui
                imaginent{" "}
                <span className="underline decoration-pop-orange decoration-4 underline-offset-4">
                  la fin du capitalisme
                </span>{" "}
                plutôt que la fin du monde.
              </h2>
              {/* UN SEUL rendu depuis que la cible est unique : l'ancre
                  déploie la feuille sous `lg`, le tiroir au-dessus. Les deux
                  `<span>` exclusifs qui portaient les deux cibles ont disparu
                  avec elles. */}
              <Button
                href={PALIERS_CTA}
                aria-label="Contribuer — voir les contreparties"
                className="mt-8 px-7 py-3.5 text-sm font-extrabold tracking-[.03em] sm:mt-10"
              >
                Contribuer&nbsp;↓
              </Button>
            </Reveal>
          </Container>
        </section>

      </div>

      {/* Téléphone : le rail devient une feuille de bas d'écran, déroulée au
          chargement, repliable au glissé en bandeau « Contribuer » (les CTA
          d'ancre `#paliers`/`#montant-libre` la redéploient). À `lg+`,
          `BottomSheet` est transparent : le rail redevient l'item de grille
          sticky de la colonne 380px. */}
      <BottomSheet
        label="Contribuer"
        anchors={["paliers", "montant-libre"]}
        autoOpenDelayMs={1000}
      >
        <TiersDrawer anchors={["paliers", "montant-libre"]}>
          <TiersRail content={content} enabled={enabled} />
        </TiersDrawer>
      </BottomSheet>
    </div>
  );
}

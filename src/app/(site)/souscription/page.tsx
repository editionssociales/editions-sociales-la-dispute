import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import type { SafeHtml } from "@/lib/cms-html";
import { getCampaign2026 } from "@/lib/donations";
import { getPageSouscription } from "@/lib/site-content";
import { BottomSheet } from "@/components/bottom-sheet";
import { OPENING_MICROCOPY, TiersRail } from "./_components/tiers-rail";
import { TiersDrawer } from "./_components/tiers-drawer";

/**
 * Page /souscription — refonte SOBRE (maquette client PDF, 2026-08-21,
 * retouche le docx de juillet — la maquette fait foi). Retour client
 * verbatim : « Faut qu'on simplifie la page souscription. […] que le texte
 * apparaisse de façon plus sobre, pas avec plein de polices et de style de
 * titre, juste à la rigueur avec des trucs surlignés. Là je pense ça se lit
 * mal. » Remplace la refonte « Placard » du 2026-07-25 (displays clamp()
 * multiples, étagère 3D, bande hazard, tampon penché, crescendo
 * typographique, escalier des objectifs) — supprimée en bloc.
 *
 * Ordre du DOM, inchangé dans son principe (retour client 2026-07-24, la
 * colonne principale garde jauge → récit → objectifs → CTA, le rail des
 * contreparties reste hors du corps de texte) : héros de collecte en direct
 * (INCHANGÉ À L'OCTET, cf. plus bas) → titre de l'ask (« 100 ans », motif
 * décoratif, demande) → quatre sections narratives (UN SEUL pattern répété :
 * bandeau de titre à l'accent de la section + corps en prose sobre — gras et
 * surlignage inline pour toute emphase, aucun autre effet) → trois cartes de
 * paliers de jauge (remplacent l'escalier typographique) → CTA final →
 * rail sticky des contreparties (`#paliers`, hors du corps de texte, cf.
 * `_components/tiers-rail.tsx`/`tiers-drawer.tsx`, INCHANGÉS).
 *
 * Ce qui disparaît avec la refonte : l'étagère 3D des dernières parutions
 * (`_components/shelf.tsx`, `components/shelf-lock.tsx`/`shelf-cover.tsx` —
 * supprimés, plus aucun autre appelant) et son motif CSS `.book3d*`
 * (`globals.css`) ; la section vidéo conditionnelle (`CAMPAIGN_VIDEO_URL`
 * n'a jamais cessé d'être `null` — `src/lib/video.ts` reste en place,
 * toujours utilisé par la fiche livre) ; la bande hazard, le tampon penché
 * « 100 ans », le crescendo du bandeau d'appel (dont le « ! » ajouté en
 * juillet, absent de la maquette), les exergues `text-[1.5em]`/`[1.8em]`, et
 * la duplication `OBJECTIF_EXTRAS` keyée par montant (avec son invariant de
 * synchronisation) : les trois cartes de paliers dérivent désormais
 * UNIQUEMENT de `CAMPAIGN_2026_PALIERS` (montant, intitulé) zippé
 * POSITIONNELLEMENT à une présentation FIXE (couleur, inversion — cf.
 * `OBJECTIF_PRESENTATION` plus bas) et aux descriptions éditables
 * (`content.objectifs`, cf. Payload ci-dessous).
 *
 * Palette (INCHANGÉE) : les quatre couleurs du site (`pop-palette.ts`) —
 * orange = section 1 (crise), bleu = section 2 (bataille politique), jaune =
 * section 3 (héritage centenaire), rose = section 4 (appel) — même
 * assignation que l'ancienne maquette, la seule à survivre à la refonte.
 * Effra (`font-sans`) reste l'unique famille.
 *
 * Récit éditable (Payload, `global page-souscription`) : titre de l'ask et
 * quatre sections NOMMÉES ET FIXES (`danger`/`guerre`/`maisons`/`appel` — pas
 * un tableau, couleurs et ordre figés par le design) sont désormais
 * éditables, en plus des neuf cartes de contreparties (INCHANGÉES). Contrat
 * inchangé : champ vide = texte actuel du site (`getPageSouscription`,
 * fusion pure dans `src/lib/site-content-core.ts` — jamais de seed en base).
 * `corps` (richText) vide fait retomber CHAQUE section sur SES PROPRES
 * paragraphes JSX verbatim ci-dessous (`RecitSection`, `corps ?? children`) —
 * pas de fusion partielle paragraphe par paragraphe. Montants et intitulés
 * des paliers restent dérivés de `DONATION_TIERS`/`CAMPAIGN_2026_PALIERS`
 * (jamais du CMS) : la présentation est éditable, jamais le paiement.
 */

/**
 * Recette du corps de récit (INCHANGÉE depuis la maquette « Placard ») :
 * texte lisible, un cran plus grand que le corps courant du site — retour
 * Youri/Clara 25/07 et 07/08, toujours valable pour la refonte sobre.
 * Partagée par le rendu CMS (richText) et les paragraphes par défaut : les
 * deux doivent avoir la même densité de lecture.
 */
const RECIT_CORPS_CLASS =
  "mt-6 space-y-6 font-sans text-lg font-medium leading-relaxed text-ink sm:space-y-8 sm:text-xl sm:leading-[1.55]";

/**
 * Surlignage inline (verbatim maquette) — UNIQUE effet d'emphase avec le gras
 * (consigne client : « juste à la rigueur avec des trucs surlignés »).
 * `box-decoration-clone` évite un rectangle en escalier quand le surlignage
 * franchit un retour à la ligne. Une classe littérale par couleur de section
 * (contrat JIT — jamais `bg-pop-${couleur}` assemblée dynamiquement).
 */
const HL_ORANGE = "box-decoration-clone bg-pop-orange px-1";
const HL_TEAL = "box-decoration-clone bg-pop-teal px-1";
const HL_YELLOW = "box-decoration-clone bg-pop-yellow px-1";
const HL_PINK = "box-decoration-clone bg-pop-pink px-1";

/**
 * Une section du récit — UN SEUL pattern répété (consigne client) : bandeau
 * de titre plein à l'accent de la section (2ᵉ ligne italique optionnelle),
 * corps en prose sobre juste dessous, dans la MÊME colonne `max-w-[52ch]`
 * (le bandeau n'est plus plein-bleed comme dans l'ancienne maquette — ce
 * n'est plus un objet d'affiche, juste un intertitre en aplat de couleur).
 * `corps` (SafeHtml CMS) prime sur `children` (paragraphes JSX par défaut) —
 * jamais les deux à la fois.
 */
function RecitSection({
  bg,
  titre,
  titreItalique,
  corps,
  children,
}: {
  bg: string;
  titre: string;
  titreItalique: string | null;
  corps: SafeHtml | null;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 sm:mt-16">
      <Reveal>
        <Container>
          <div className="max-w-[52ch]">
            <h2
              className={`w-full ${bg} px-4 py-3 font-sans text-[clamp(20px,4vw,30px)] font-black uppercase leading-[1.05] text-ink sm:px-6`}
            >
              <span className="block">{titre}</span>
              {titreItalique && <span className="mt-1 block italic">{titreItalique}</span>}
            </h2>
            {corps ? (
              <div className={RECIT_CORPS_CLASS} dangerouslySetInnerHTML={{ __html: corps }} />
            ) : (
              <div className={RECIT_CORPS_CLASS}>{children}</div>
            )}
          </div>
        </Container>
      </Reveal>
    </section>
  );
}

/**
 * Motif décoratif « équaliseur » du titre de l'ask (maquette) — hauteurs en
 * px, aucune image (divs littéraux). `aria-hidden` : purement ornemental, la
 * demande qu'il précède est déjà portée par le h1 (`sr-only`) et son rendu
 * visible juste après.
 */
const EQUALIZER_BARS = [18, 34, 48, 26, 56, 30, 44, 22, 38, 28, 46] as const;

export const metadata: Metadata = {
  title: "Souscription",
  // ≤ 160 caractères (Google tronque au-delà) : crise + appel + fourchette.
  description:
    "La faillite de notre distributeur menace 100 ans d’édition marxiste indépendante. Soutenez Les Éditions sociales et La Dispute — contreparties de 15 à 1 000 €.",
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

export const revalidate = 3600; // fenêtre ISR (contreparties/récit lus dans Payload/Postgres)

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

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (CTA honnêtement désactivés, R7).
  const enabled = stripeEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `stripeEnabled()`
  // est faux (elle jette avant tout fetch, absorbée en `null` — `lib/donations.ts`) :
  // gratuit à appeler inconditionnellement.
  const [campaign2026, content] = await Promise.all([
    getCampaign2026(),
    getPageSouscription(),
  ]);
  // Jauge 2026 TOUJOURS visible (point le plus urgent du site) : avant
  // l'ouverture des dons (pas de clé Stripe → `null`), ou juste après le
  // lancement (0 collecté), la jauge affiche honnêtement une campagne à 0
  // plutôt que de disparaître.
  const liveCampaign = campaign2026 ?? deriveCampaign2026({ collected: 0, contributors: 0 });
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

  /**
   * Cartes de paliers — présentation FIGÉE par la maquette (couleur, ordre,
   * inversion du sommet), zippée POSITIONNELLEMENT avec
   * `CAMPAIGN_2026_PALIERS` (déjà triée par montant croissant, 3 entrées —
   * la table qui pilote la jauge, jamais retouchée sans revue de ce zip).
   * Les descriptions viennent du CMS (`content.objectifs`, vide = défaut
   * dur) ; montant et intitulé restent dérivés de la table, jamais du CMS.
   */
  const OBJECTIF_PRESENTATION = [
    { border: "border-l-pop-orange", sommet: false },
    { border: "border-l-pop-yellow", sommet: false },
    { border: "border-l-pop-pink", sommet: true },
  ] as const;
  const objectifDescriptions = [
    content.objectifs.descriptif50,
    content.objectifs.descriptif80,
    content.objectifs.descriptif100,
  ];
  const OBJECTIFS = CAMPAIGN_2026_PALIERS.map((p, i) => ({
    value: p.value,
    titre: p.label,
    desc: objectifDescriptions[i],
    ...OBJECTIF_PRESENTATION[i],
  }));

  return (
    /* La colonne du rail EST le panneau du tiroir (`_components/tiers-drawer.tsx`) :
       elle vaut 380px ouverte, 0 fermée, et sa course vit ICI, sur
       `grid-template-columns` — la même que celle de la réserve du header
       (`site-header.tsx`) et des commandes fixées au bord droit. Les trois
       partent et arrivent ensemble ; une seule qui sauterait suffirait à
       casser le geste. */
    <div className={`lg:grid ${RAIL_GRID_CLASS} ${RAIL_GRID_TRANSITION_CLASS} lg:items-start`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      {/* Colonne principale (jauge, corps de texte, CTA final) — le rail des
          contreparties vit en frère de DOM, sur la droite de la page entière,
          et monte jusqu'en haut de page en lg+ (`lg:-mt-24` dans TiersRail,
          navbar resserrée à gauche via `railInset` — largeur de colonne 380px
          à garder en phase avec `site-header.tsx`). */}
      <div className="min-w-0">
        {/* 1 ▪ La collecte en direct OUVRE la page (INCHANGÉE À L'OCTET,
            consigne mission) — compteur de lutte monumental sur bloc paper
            pleine largeur, gros CTA orange sur son flanc droit et jauge 2026
            vivante en demi-droite, paliers réinscrits sous la barre. N'affiche
            que ce qu'une campagne en cours peut honnêtement montrer (collecté
            net + contributeurs). Fenêtre de fraîcheur ~1–3 min, voir
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
                            suffix=" €"
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
        </section>

        {/* 2 ▪ Titre de l'ask — « 100 ans » en très grand (apaisé : une seule
            échelle géante au lieu du crescendo à trois échelles de l'ancienne
            maquette), qualification en capitales, motif décoratif
            « équaliseur » (aucune image) puis la demande. Le h1 reste UN SEUL
            <h1> portant tout le slogan verbatim dans l'ordre : la demande y
            vit en sr-only, son rendu visible sous le motif est aria-hidden —
            une seule lecture SR, zéro duplication dans l'arbre a11y. Plus
            d'étagère 3D sous le titre (supprimée avec la refonte, cf. doc de
            module) : le formulaire montant libre reste au rail, seule l'ancre
            y mène. */}
        <section className="bg-paper pt-16 sm:pt-20">
          <Container>
            <h1 className="font-sans font-black text-ink">
              <span className="block italic text-[clamp(56px,12vw,120px)] leading-[0.85] tracking-[-0.02em]">
                {content.titre.titre}
              </span>
              <span className="mt-2 block text-[clamp(24px,5vw,44px)] uppercase leading-[0.95] tracking-[-0.01em]">
                {content.titre.sousTitre}
              </span>
              <span className="sr-only">{content.titre.demande}</span>
            </h1>
            {/* Motif + demande visible : dupliquent le sr-only du h1, donc
                entièrement aria-hidden. Barres cyclées dans l'ordre canonique
                de la palette (`POP_ORDER`). */}
            <div aria-hidden="true" className="mt-6 flex flex-wrap items-end gap-4 sm:gap-6">
              <div className="flex items-end gap-[3px]">
                {EQUALIZER_BARS.map((h, i) => (
                  <span
                    key={i}
                    className={`block w-2 sm:w-2.5 ${POP_BG[POP_ORDER[i % 4]]}`}
                    style={{ height: h }}
                  />
                ))}
              </div>
              <span className="pb-1 font-sans text-2xl font-black leading-none text-ink/40">
                ···
              </span>
              <p className="min-w-0 flex-1 font-sans text-[clamp(22px,4vw,40px)] font-black italic leading-[0.95] text-ink">
                {content.titre.demande}
              </p>
            </div>
          </Container>
        </section>

        {/* 3 ▪ Récit — quatre sections-bandeaux, UN SEUL pattern répété
            (`RecitSection`) : bandeau de titre à l'accent de la section
            (orange/bleu/jaune/rose, dans l'ordre — même assignation que
            l'ancienne maquette), corps en prose sobre juste dessous. Chaque
            paragraphe par défaut est le texte VERBATIM de la maquette client
            (2026-08-21) ; gras (`<strong>`) et surlignage inline
            (`box-decoration-clone bg-pop-*`) sont les SEULS marqueurs
            d'emphase — aucune rotation, aucune ombre dure, aucun display
            géant dans le corps. */}
        <RecitSection
          bg={POP_BG.orange}
          titre={content.recit.danger.titre}
          titreItalique={content.recit.danger.titreItalique}
          corps={content.recit.danger.corps}
        >
          <p>
            En cette fin d’été 2026,{" "}
            <strong className="font-bold">
              l’édition de critique sociale fait face à l’une des pires crises de son
              histoire
            </strong>
            . Des centaines de maisons indépendantes sont menacées par la faillite de leur
            ancien distributeur Makassar qui disparaît avec des dettes importantes.
          </p>
          <p>
            Pour Les éditions sociales et La Dispute, c’est plus de{" "}
            <span className={HL_ORANGE}>130&nbsp;000&nbsp;€</span> de ventes en librairie que
            nous ne toucherons jamais pour des livres sur lesquels nous avons pourtant payé
            des frais d’impression et de maquette, ainsi que des avances de droits d’auteur.
          </p>
          <p>
            <strong className="font-bold">
              Pour nos maisons, c’est le genre de coup qui peut être fatal.
            </strong>
          </p>
        </RecitSection>

        <RecitSection
          bg={POP_BG.teal}
          titre={content.recit.guerre.titre}
          titreItalique={content.recit.guerre.titreItalique}
          corps={content.recit.guerre.corps}
        >
          <p>
            La faillite de Makassar est le résultat d’un marché de l’édition où les grands
            groupes – Hachette, Editis, Média-Participations, Madrigall – détiennent à eux
            seuls près de{" "}
            <span className={HL_TEAL}>90&nbsp;% de la production éditoriale</span> et de la
            distribution en France. Ces grands groupes font la course aux profits et
            imposent leur loi à tous,{" "}
            <strong className="font-bold">
              avec des conséquences néfastes pour l’ensemble des acteurs indépendants mais
              aussi des lecteurices.
            </strong>
          </p>
          <p>
            C’est parce que ces groupes existent que leurs propriétaires peuvent se
            permettre de les utiliser pour mener leurs guerres idéologiques, comme on le
            voit avec Vincent Bolloré.
          </p>
          <p>
            <strong className="font-bold">
              Parce que la bataille des idées est aussi une guerre matérielle,
            </strong>{" "}
            <span className={HL_TEAL}>soutenir les éditeurs indépendants est un devoir politique.</span>
          </p>
        </RecitSection>

        <RecitSection
          bg={POP_BG.yellow}
          titre={content.recit.maisons.titre}
          titreItalique={content.recit.maisons.titreItalique}
          corps={content.recit.maisons.corps}
        >
          <p>
            <strong className="font-bold">En 2027,</strong>{" "}
            <span className={HL_YELLOW}>nos maisons fêteront leurs 100 ans d’existence.</span>
          </p>
          <p>
            Cent ans de{" "}
            <strong className="font-bold">
              traductions de Marx, de livres marxistes et de formation militante.
            </strong>
          </p>
          <p>
            Cent ans de publications exigeantes, pour{" "}
            <strong className="font-bold">
              éclairer les transformations du capitalisme, des classes sociales, mener la
              critique féministe
            </strong>{" "}
            et <span className={HL_YELLOW}>faire vivre le débat à gauche.</span>
          </p>
          <p>
            Récemment, nous avons ouvert de nouveaux chantiers prometteurs pour nos maisons
            en arrivant{" "}
            <strong className="font-bold">
              chez un nouveau diffuseur-distributeur, BLDD ; en lançant de nouvelles
              collections ; en partant à la rencontre des libraires partout dans le pays.
            </strong>
          </p>
          <p>
            Mais notre équipe s’agrandit aussi : Nicolas Vieillescazes, ancien directeur
            éditorial d’Amsterdam, nous rejoint pour renforcer les éditions sociales et La
            Dispute.
          </p>
          <p>
            <strong className="font-bold">
              Tous ces choix portent leurs fruits mais la faillite de Makassar nous frappe au
              moment où nous construisons l’avenir.
            </strong>
          </p>
        </RecitSection>

        <RecitSection
          bg={POP_BG.pink}
          titre={content.recit.appel.titre}
          titreItalique={content.recit.appel.titreItalique}
          corps={content.recit.appel.corps}
        >
          <p>
            <strong className="font-bold">Nous voulons que notre histoire se poursuive ;</strong>{" "}
            <span className={HL_PINK}>c’est pourquoi nous faisons appel à vous.</span>
          </p>
          <p>
            En faisant un don, vous nous aiderez à surmonter cette crise, à préserver notre
            indépendance et à poursuivre un travail éditorial engagé, exigeant et
            indispensable.
          </p>
          <p>
            <strong className="font-bold">
              Vous nous permettrez de continuer à publier les livres qui
            </strong>{" "}
            <span className={HL_PINK}>
              imaginent la fin du capitalisme plutôt que la fin du monde.
            </span>
          </p>
        </RecitSection>

        {/* 4 ▪ Objectifs de la jauge — trois cartes UNIFORMES (remplacent
            l'escalier typographique) : liseré gauche épais à l'accent de
            palier, montant à la MÊME taille pour les trois, sommet (100k)
            seul inversé (`bg-ink text-paper`). Pas de titre de section
            au-dessus, la jauge d'ouverture porte déjà « Objectif ». Clôt la
            section : dernière de la colonne, le CTA final butait sinon
            directement sur le pied de page. */}
        <section className="mt-12 pb-16 sm:mt-16 sm:pb-24">
          <Container>
            <Reveal>
              <div className="flex flex-col gap-6 sm:gap-8">
                {OBJECTIFS.map((o) => (
                  <div
                    key={o.value}
                    className={`border-2 border-ink ${o.border} border-l-[12px] p-6 sm:p-8 ${
                      o.sommet ? "bg-ink text-paper" : "bg-paper text-ink"
                    }`}
                  >
                    <p className="font-sans text-[clamp(32px,7vw,48px)] font-black italic leading-none">
                      {formatInt(o.value)}&nbsp;€
                    </p>
                    <p className="mt-3 font-sans text-sm font-extrabold uppercase tracking-[.06em] sm:text-[15px]">
                      {o.titre}
                    </p>
                    <p
                      className={`mt-2 text-sm leading-relaxed sm:text-base ${
                        o.sommet ? "text-paper/80" : "text-ink/80"
                      }`}
                    >
                      {o.desc}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* CTA final : renvoie simplement à l'ancre unique du rail — le
                montant libre vit en clôture du rail, pas ici. */}
            <Reveal>
              <Button
                href={PALIERS_CTA}
                aria-label="Contribuer — voir les contreparties"
                className="mt-10 px-7 py-3.5 text-sm font-extrabold tracking-[.03em] sm:mt-12"
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

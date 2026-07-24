import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Button, INVERT } from "@/components/button";
import { SubmitButton } from "@/components/submit-button";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { formatInt } from "@/lib/format";
import { ACCENTS, ACCENT_BG as BG } from "@/lib/accents";
import { FOCUS_RING_DARK } from "@/lib/ui";
import { donationsEnabled } from "@/lib/stripe";
import { FREE_AMOUNT, deriveCampaign2026 } from "@/lib/donation-tiers";
import { getCampaign2026 } from "@/lib/donations";
import { getPageSouscription } from "@/lib/site-content";
import { createDonationCheckout } from "./actions";

// Visuels de contreparties (9 montages produits, fond blanc, sans texte) —
// assets de campagne pilotés par la table `DONATION_TIERS` (code), donc
// versionnés dans le repo et importés STATIQUEMENT plutôt que via la
// collection Media : le pattern « bloc CMS vide = défaut en code » interdit
// de faire dépendre le rendu par défaut d'uploads en base. `next/image`
// optimise à la volée depuis l'import statique (`StaticImageData`).
import coupDePouceImg from "./_contreparties/coup-de-pouce.jpg";
import coupDeMainImg from "./_contreparties/coup-de-main.jpg";
import camaradeDeLectureImg from "./_contreparties/camarade-de-lecture.jpg";
import camaradeFideleImg from "./_contreparties/camarade-fidele.jpg";
import camaradeDeLutteImg from "./_contreparties/camarade-de-lutte.jpg";
import camaradeDeLaPremiereHeureImg from "./_contreparties/camarade-de-la-premiere-heure.jpg";
import camaradeInfatigableImg from "./_contreparties/camarade-infatigable.jpg";
import camaradeDHonneurImg from "./_contreparties/camarade-d-honneur.jpg";
import camaradePourLaVieImg from "./_contreparties/camarade-pour-la-vie.jpg";

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
 * des maisons), FAQ, aperçu catalogue, étagère 3D. `lib/campaign.ts` reste
 * intact (`deriveGauge` est le socle commun 2024/2026), seul son usage sur
 * cette page disparaît.
 *
 * Ce qui reste, dans l'ordre du DOM : jauge de collecte en direct (pleine
 * largeur, TOUJOURS visible) ; slot vidéo masqué tant qu'aucune vidéo n'est
 * livrée ; corps deux colonnes — récit figé en code à gauche (ask, quatre
 * sections narratives, objectifs de jauge), contreparties éditables en
 * aside sticky à droite (`#paliers`), récit premier dans le DOM (mobile :
 * h1 et pitch au-dessus des cartes) ; CTA final pleine largeur. Seul le bloc
 * `contreparties` est éditable dans /admin (global `page-souscription`) :
 * lu via `getPageSouscription`, bloc vide = contenu par défaut de
 * `lib/site-content-core.ts`. Montant et intitulé des paliers restent
 * dérivés de `DONATION_TIERS` (la table qui pilote Stripe) : la présentation
 * est éditable, jamais le paiement.
 */

/**
 * Contreparties (R2/R3) : cycle des 4 accents de marque, jamais la palette
 * pop (réservée nav/statut). `POP_BG` ne reste ici que pour le liseré de
 * statut du CTA final (décoration ponctuelle, hors paliers).
 */
const POP_BG = ["bg-pop-pink", "bg-pop-teal", "bg-pop-orange", "bg-pop-yellow"];

/** Microcopie honnête (R7) : le paiement n'ouvre qu'à cette date, jamais un CTA muet. */
const OPENING_MICROCOPY = "Ouverture le 15 août";

/**
 * Vidéo de campagne — le bloc pleine largeur de la maquette 2026-07. Aucune
 * vidéo livrée à ce jour : renseigner ici l'URL d'embed à réception ; le
 * bloc reste masqué tant que `null`.
 */
const CAMPAIGN_VIDEO_URL: string | null = null;

/**
 * Visuel par palier (PDF client, montages produits fond blanc) — keyé par
 * id de `DONATION_TIERS`.
 *
 * TODO(visuel) : le visuel « coup de pouce » (et la planche de stickers
 * présente dans tous les montages) est un rectangle crème VIDE — la planche
 * n'est pas encore dessinée ; visuels à re-livrer par Clara.
 */
const TIER_IMAGES: Record<string, StaticImageData> = {
  "palier-15": coupDePouceImg,
  "palier-35": coupDeMainImg,
  "palier-50": camaradeDeLectureImg,
  "palier-75": camaradeFideleImg,
  "palier-100": camaradeDeLutteImg,
  "palier-200": camaradeDeLaPremiereHeureImg,
  "palier-300": camaradeInfatigableImg,
  "palier-500": camaradeDHonneurImg,
  "palier-1000": camaradePourLaVieImg,
};

/** Objectifs de la jauge (docx client, définitifs) — cellules encadrées après le récit. */
const OBJECTIFS: { montant: string; titre: string; desc: string }[] = [
  {
    montant: "50 000 €",
    titre: "On sauve les meubles",
    desc: "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
  },
  {
    montant: "80 000 €",
    titre: "On résiste",
    desc: "Nous pouvons absorber l'essentiel de la perte, mener à bien les projets déjà engagés et confirmer l'arrivée de Nicolas Vieillescazes dans l'équipe.",
  },
  {
    montant: "100 000 €",
    titre: "On construit",
    // TODO(contenu) : phrase possiblement tronquée dans le docx (le point
    // final manque) — conservée telle quelle.
    desc: "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
  },
];

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "En 2027, Les Éditions sociales et La Dispute fêteront cent ans d'édition marxiste et critique — mais la faillite de leur distributeur Makassar menace leur activité. Une souscription pour traverser la crise et préserver notre indépendance, avec des contreparties de 15 à 1 000 €.",
  alternates: { canonical: "/souscription" },
};

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

/**
 * Formulaire « montant libre » — rendu deux fois (bloc d'ask, CTA final) avec
 * le même comportement (R7) : avant ouverture, CTA réellement `disabled` +
 * microcopie « Ouverture le 15 août » (jamais un bouton mort qui a l'air
 * cliquable) ; une fois ouvert, `SubmitButton` (`useFormStatus`) distingue
 * l'état pendant la redirection Stripe de l'état bloqué.
 */
function FreeAmountForm({ enabled, idSuffix }: { enabled: boolean; idSuffix: string }) {
  if (!enabled) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          variant="invert"
          disabled
          aria-disabled="true"
          className="shrink-0 gap-2 px-7 py-3.5 text-sm font-extrabold tracking-[.03em]"
        >
          Contribuer
        </Button>
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-paper/60">
          {OPENING_MICROCOPY}
        </p>
      </div>
    );
  }
  const inputId = `amount-${idSuffix}`;
  return (
    <form action={createDonationCheckout} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label htmlFor={inputId} className="sr-only">
        Montant libre, en euros
      </label>
      <input
        id={inputId}
        name="amount"
        type="number"
        min={FREE_AMOUNT.min}
        max={FREE_AMOUNT.max}
        step={1}
        inputMode="numeric"
        placeholder="Montant en €"
        required
        className={`w-36 border-2 border-paper bg-ink px-4 py-3.5 font-sans text-sm font-semibold text-paper placeholder:text-paper/50 ${FOCUS_RING_DARK}`}
      />
      <SubmitButton
        tone="light"
        pendingLabel="Redirection…"
        className={`inline-flex shrink-0 items-center gap-2 border-2 px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] transition-colors motion-reduce:transition-none ${INVERT}`}
      >
        Contribuer
      </SubmitButton>
    </form>
  );
}

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (CTA honnêtement désactivés, R7).
  const enabled = donationsEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `donationsEnabled()`
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

  return (
    <>
      {/* La collecte en direct OUVRE la page — jauge 2026 vivante + objectif,
          pleine largeur. N'affiche que ce qu'une campagne en cours peut
          honnêtement montrer (collecté net + contributeurs). Fenêtre de
          fraîcheur ~1–3 min, voir `src/app/CLAUDE.md`. */}
      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="flex flex-col gap-[2px] bg-ink p-[2px] lg:flex-row">
              <div className="flex-1 bg-paper p-6 sm:p-8">
                {liveCampaign.collected > 0 ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-relaxed text-ink/70">
                    Déjà
                    <CountUp
                      value={liveCampaign.collected}
                      suffix=" €"
                      className="font-sans text-lg font-black italic text-ink"
                    />
                    réunis auprès de
                    <CountUp
                      value={liveCampaign.contributors}
                      className="font-sans text-lg font-black italic text-ink"
                    />
                    contributeur·rices.
                  </p>
                ) : (
                  <p className="max-w-md text-[15px] leading-relaxed text-ink/70">
                    Campagne tout juste lancée — soyez les premier·ères à
                    contribuer.
                  </p>
                )}
                <Gauge
                  className="mt-6"
                  value={liveCampaign.gauge.value}
                  max={liveCampaign.gauge.max}
                  markers={liveCampaign.gauge.markers}
                />
              </div>
              <div className="flex flex-col justify-center bg-ink p-6 text-paper sm:p-8 lg:w-64">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                  Objectif
                </p>
                <p className="mt-2 font-sans text-4xl font-black italic">
                  {formatInt(liveCampaign.goal)}&nbsp;€
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Vidéo de campagne — le bloc pleine largeur de la maquette ; absent
          tant qu'aucune vidéo n'est livrée. */}
      {CAMPAIGN_VIDEO_URL && (
        <section className="border-b-2 border-ink bg-paper">
          <Container className="py-12 sm:py-16">
            <Reveal>
              <div className="border-2 border-ink bg-ink">
                <iframe
                  src={CAMPAIGN_VIDEO_URL}
                  title="La vidéo de la souscription"
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </Reveal>
          </Container>
        </section>
      )}

      {/* Corps en deux colonnes : récit à gauche — ouvert par l'ask 2026 —,
          contreparties empilées à droite. Le récit est premier dans le DOM :
          sur mobile, h1 et pitch restent au-dessus des cartes de paliers. */}
      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* Colonne récit : l'ask, le récit, les objectifs */}
            <div className="flex flex-col gap-14">
              {/* L'ask 2026 — même traitement typographique que l'ancien h1
                  (précédent acté sur cette page) : Effra, italique, gras.
                  TODO(contenu) : le docx s'intitule « Slogans » (pluriel)
                  mais n'en livre qu'un — d'autres variantes pourraient
                  arriver. */}
              <div className="bg-ink p-7 text-paper sm:p-9">
                <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-paper">
                  100 ans d&apos;édition marxiste : <span className="text-pop-yellow">aidez-nous à poursuivre l&apos;histoire.</span>
                </h1>
                <div className="mt-8">
                  <FreeAmountForm enabled={enabled} idSuffix="hero" />
                  <a
                    href="#paliers"
                    className={`mt-3 inline-block font-sans text-xs font-bold uppercase tracking-[.04em] text-paper/60 underline decoration-1 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-paper ${FOCUS_RING_DARK}`}
                  >
                    Voir les contreparties ↓
                  </a>
                </div>
              </div>

              {/* Section 1 — la crise */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Édition indépendante et critique : danger maximal
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    En cette fin d&apos;été 2026, l&apos;édition de critique sociale fait
                    face à une des pires crises de son histoire. Des centaines de
                    maisons indépendantes sont menacées par la faillite de leur
                    distributeur Makassar qui disparaît avec des dettes importantes.
                  </p>
                  <p>
                    Pour Les éditions sociales et La Dispute, c&apos;est plus de
                    130 000 € de ventes en librairie que nous ne toucherons jamais
                    pour des livres dont nous avons pourtant payé des frais
                    d&apos;impression et de maquette, ainsi que des avances de droits
                    d&apos;auteur.
                  </p>
                  <p>Pour nos maisons, c&apos;est le genre de coup qui peut être fatal.</p>
                </div>
              </Reveal>

              {/* Section 2 — la bataille matérielle */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  La guerre culturelle est aussi une guerre matérielle
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    La faillite de Makassar est le résultat d&apos;un marché de
                    l&apos;édition où les grands groupes – Hachette, Editis,
                    Média-Participations, Madrigall – détiennent à eux seuls près de
                    90 % de la production éditoriale et de la distribution. Ces
                    grands groupes font la course aux profits et imposent leur loi à
                    tous, avec des conséquences néfastes pour l&apos;ensemble des
                    acteurs indépendants mais aussi des lecteurices.
                  </p>
                  <p>
                    C&apos;est parce que ces groupes existent que leurs propriétaires
                    peuvent se permettre de les utiliser pour mener leurs guerres
                    idéologiques, comme on l&apos;a vu récemment avec Vincent Bolloré.
                  </p>
                  <p>
                    Face à eux, nous devons aller à la racine en exigeant la fin de
                    la propriété privée des moyens de production culturelle et des
                    infrastructures de distribution.
                  </p>
                  <p>
                    Et, parce que la bataille des idées est aussi une guerre
                    matérielle, soutenir les éditeurs indépendants est un devoir
                    politique.
                  </p>
                </div>
              </Reveal>

              {/* Section 3 — les maisons, cent ans */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Les éditions sociales et La Dispute
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>En 2027, nos maisons fêteront leurs 100 ans d&apos;existence.</p>
                  <p>
                    Cent ans de traductions de Marx et de livres marxistes et de
                    formation militante.
                  </p>
                  <p>
                    Cent ans de publications exigeantes, pour éclairer les
                    transformations du capitalisme, des classes sociales, mener la
                    critique féministe et faire vivre le débat à gauche.
                  </p>
                  <p>
                    Récemment, nous avons ouvert de nouveaux chantiers prometteurs
                    pour nos maisons en arrivant chez un nouveau
                    diffuseur-distributeur, BLDD ; en lançant de nouvelles
                    collections ; en partant à la rencontre des libraires partout
                    dans le pays.
                  </p>
                  <p>
                    Mais notre équipe s&apos;agrandit aussi : Nicolas Vieillescazes,
                    ancien directeur éditorial d&apos;Amsterdam, nous rejoint pour
                    renforcer les éditions sociales et La Dispute.
                  </p>
                  <p>
                    Tous ces choix portent leurs fruits mais la faillite de Makassar
                    nous frappe au moment où nous construisons l&apos;avenir.
                  </p>
                </div>
              </Reveal>

              {/* Section 4 — l'appel */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Nous avons besoin de vous
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    Nous voulons que notre histoire se poursuive ; c&apos;est pourquoi
                    nous faisons appel à vous. En faisant un don, vous nous aiderez
                    à surmonter cette crise, à préserver notre indépendance et à
                    poursuivre un travail éditorial engagé, exigeant et
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
                    <div className="flex h-full flex-col gap-2 bg-paper p-6">
                      <span className="font-sans text-3xl font-black italic text-ink">
                        {o.montant}
                      </span>
                      <span className="font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                        {o.titre}
                      </span>
                      <p className="mt-1 text-sm leading-relaxed text-ink/70">{o.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </FramedGrid>
            </div>

            {/* Colonne contreparties — ancrée au défilement, bornée à la
                hauteur du viewport sous le header, avec sa propre barre de
                scroll pour parcourir les paliers sans quitter le récit de
                gauche. Les 9 cartes sont uniformes (plus de carte inversée
                pour les grands paliers). */}
            <aside
              id="paliers"
              className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
            >
              <FramedGrid className="grid-cols-1">
                {content.contreparties.map((p, i) => {
                  // Paliers de don : les 4 accents de marque, jamais le cycle pop (R2/R3).
                  const accentBg = BG[ACCENTS[i % 4]];
                  return (
                    <Reveal key={p.tier.id} className="h-full">
                      <div className="relative flex h-full flex-col bg-paper">
                        <div aria-hidden="true" className={`h-2 ${accentBg}`} />
                        {/* Montage produit sur fond blanc pur — `mix-blend-multiply`
                            fond le blanc dans le `bg-paper` (blanc cassé) du site,
                            les ombres portées restent correctes. Décoratif : la
                            liste textuelle des items porte l'information (alt vide). */}
                        <Image
                          src={TIER_IMAGES[p.tier.id]}
                          alt=""
                          sizes="(min-width: 1024px) 380px, 100vw"
                          className="block h-auto w-full mix-blend-multiply"
                        />
                        <div className="flex flex-1 flex-col p-6">
                          <span className="font-sans text-4xl font-black italic text-ink">
                            {p.tier.amount}&nbsp;€
                          </span>
                          <span className="mt-1 font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                            {p.tier.title}
                          </span>
                          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink/70">
                            {p.items.map((item) => (
                              <li key={item} className="flex gap-2.5">
                                <span
                                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 ${accentBg}`}
                                />
                                {item}
                              </li>
                            ))}
                          </ul>
                          {enabled ? (
                            <form
                              action={createDonationCheckout}
                              className="contents"
                            >
                              <input type="hidden" name="tierId" value={p.tier.id} />
                              <SubmitButton
                                tone="dark"
                                pendingLabel="Redirection…"
                                ariaLabel={`Contribuer ${p.tier.amount} € — ${p.tier.title}`}
                                className={`mt-3 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK}`}
                              >
                                Contribuer
                              </SubmitButton>
                            </form>
                          ) : (
                            <div className="mt-3 flex flex-col items-start gap-1.5">
                              <Button
                                type="button"
                                variant="solid"
                                disabled
                                aria-disabled="true"
                                className="px-4 py-2.5 text-sm tracking-[.03em]"
                              >
                                Contribuer
                              </Button>
                              <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
                                {OPENING_MICROCOPY}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </FramedGrid>
            </aside>
          </div>
        </Container>
      </section>

      {/* CTA final — phrase de clôture du docx, verbatim. */}
      <section className="bg-ink text-paper">
        <div className="grid grid-cols-4" aria-hidden="true">
          {POP_BG.map((c) => (
            <div key={c} className={`h-1.5 ${c}`} />
          ))}
        </div>
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-2xl font-sans text-2xl font-black italic leading-[1.05] sm:text-3xl">
            Vous nous permettrez de continuer à publier les livres qui
            imaginent la fin du capitalisme plutôt que la fin du monde.
          </h2>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <FreeAmountForm enabled={enabled} idSuffix="final" />
            <Button
              href="#paliers"
              variant="invert"
              className="shrink-0 px-7 py-3.5 text-sm font-extrabold tracking-[.03em]"
            >
              Choisir un palier
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

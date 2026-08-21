import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { SubmitButton } from "@/components/submit-button";
import { formatInt } from "@/lib/format";
import { POP_BG, POP_ORDER } from "@/components/pop-palette";
import { FOCUS_RING_DARK, FOCUS_RING_HOVER_LIGHT, FOCUS_RING_LIGHT } from "@/lib/ui";
import {
  RAIL_CONTENT_WIDTH_CLASS,
  RAIL_MAX_HEIGHT_CLASS,
  RAIL_PULSE_CLASS,
} from "@/components/rail-inset";
import { type DonationTierId, FREE_AMOUNT } from "@/lib/donation-tiers";
import { tierHasChoices } from "@/lib/contreparties-core";
import type { PageSouscriptionContent } from "@/lib/site-content-core";
import { createDonationCheckout } from "../actions";

// Visuels de contreparties (9 montages produits, fond blanc, sans texte) —
// assets de campagne pilotés par la table `DONATION_TIERS` (code), donc
// versionnés dans le repo et importés STATIQUEMENT plutôt que via la
// collection Media : le pattern « bloc CMS vide = défaut en code » interdit
// de faire dépendre le rendu par défaut d'uploads en base. `next/image`
// optimise à la volée depuis l'import statique (`StaticImageData`).
import coupDePouceImg from "../_contreparties/coup-de-pouce.jpg";
import coupDeMainImg from "../_contreparties/coup-de-main.jpg";
import camaradeDeLectureImg from "../_contreparties/camarade-de-lecture.jpg";
import camaradeFideleImg from "../_contreparties/camarade-fidele.jpg";
import camaradeDeLutteImg from "../_contreparties/camarade-de-lutte.jpg";
import camaradeDeLaPremiereHeureImg from "../_contreparties/camarade-de-la-premiere-heure.jpg";
import camaradeInfatigableImg from "../_contreparties/camarade-infatigable.jpg";
import camaradeDHonneurImg from "../_contreparties/camarade-d-honneur.jpg";
import camaradePourLaVieImg from "../_contreparties/camarade-pour-la-vie.jpg";

/**
 * Rail des contreparties `#paliers` de `/souscription` — module colocalisé
 * privé (`_components`, hors routing App Router), composants serveur
 * uniquement (le seul îlot client est `SubmitButton`, importé). Porte tout le
 * module de conversion : 9 cartes de paliers + carte « montant libre » de
 * clôture, formulaires Stripe (`createDonationCheckout`) et l'état
 * pré-ouverture (`ClosedCta`).
 */

/** Microcopie honnête (R7) : le paiement n'ouvre qu'à cette date, jamais un CTA muet. */
export const OPENING_MICROCOPY = "Ouverture le 20 août";

/**
 * Recette du CTA de soumission (solid ink sur fond paper) — partagée par le
 * formulaire montant libre et les cartes de paliers, même esprit qu'`INVERT`
 * (`button.tsx`) : les CTA en `<form action>` ne recopient jamais la recette
 * à la main. Le padding/marge propres à chaque emplacement restent chez
 * l'appelant.
 */
const SUBMIT_CTA = `min-h-11 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink active:brightness-90 ${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT}`;

/**
 * Visuel par palier (montages produits fond blanc) — keyé par id de
 * `DONATION_TIERS`. Livraison Clara du 2026-08-19 : la planche de stickers,
 * rectangle crème vide dans la livraison de juillet, est désormais dessinée
 * dans les 9 montages (« coup de pouce » EST cette planche). Recette de
 * fabrication des assets depuis le zip client, rejouable :
 * `scripts/contreparties-visuels.mjs`.
 */
const TIER_IMAGES: Record<DonationTierId, StaticImageData> = {
  // Les deux premiers visuels sont recadrés à la source (trim sharp des
  // marges blanches du montage, l'ombre portée fait partie du cadrage) :
  // ils s'affichent en variante compacte, cf. `COMPACT_TIERS`.
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

/**
 * Cartes compactes (retour client 2026-07-24) : les petits lots (un sticker,
 * un livre) n'ont pas à occuper la même hauteur que les grands montages —
 * l'illustration, réduite, vient se loger à droite du montant/intitulé pour
 * combler le vide, au lieu d'un bandeau pleine largeur.
 */
const COMPACT_TIERS: ReadonlySet<string> = new Set<DonationTierId>(["palier-15", "palier-35"]);

/**
 * Vue de `TIER_IMAGES` indexable par chaîne (les ids venus du CMS sont des
 * `string`) — fail-open conservé : un palier ajouté à `DONATION_TIERS` sans
 * visuel rend une carte sans image, jamais un crash ; les typos de clés,
 * elles, sont désormais bloquées à la compilation par `DonationTierId`.
 */
const TIER_IMAGE_LOOKUP: Partial<Record<string, StaticImageData>> = TIER_IMAGES;

/**
 * Bouton Contribuer désactivé + microcopie d'ouverture — partagé par
 * `FreeAmountForm` et les cartes de paliers avant l'ouverture des dons
 * (comportement R7 : CTA réellement `disabled`, jamais un bouton mort qui a
 * l'air cliquable). `className` porte la seule variation entre appelants (la
 * marge au-dessus de l'ensemble : `mt-3` en carte de palier, `mt-4` dans
 * `FreeAmountForm`) ; `noteId`, unique par appelant, relie programmatiquement
 * la microcopie au bouton désactivé (`aria-describedby` — un AT qui inspecte
 * le bouton apprend pourquoi il l'est).
 */
function ClosedCta({ className, noteId }: { className: string; noteId: string }) {
  return (
    <div className={`flex flex-col items-start gap-1.5 ${className}`}>
      <Button
        type="button"
        variant="solid"
        disabled
        aria-describedby={noteId}
        className="min-h-11 px-4 py-2.5 text-sm tracking-[.03em]"
      >
        Contribuer
      </Button>
      <p
        id={noteId}
        className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-muted"
      >
        {OPENING_MICROCOPY}
      </p>
    </div>
  );
}

/**
 * Formulaire « montant libre » — rendu une seule fois, dans la carte qui
 * clôt la liste des contreparties (retour client 2026-07-24 : plus ni dans
 * l'ask ni dans le CTA final). Avant ouverture, `ClosedCta` porte le
 * comportement R7 ; une fois ouvert, `SubmitButton` (`useFormStatus`)
 * distingue l'état pendant la redirection Stripe de l'état bloqué. Recette
 * visuelle alignée sur les cartes de paliers (fond paper, bouton solid).
 */
function FreeAmountForm({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return <ClosedCta className="mt-4" noteId="ouverture-libre" />;
  }
  return (
    <form action={createDonationCheckout} className="mt-4 flex flex-col gap-3">
      <label htmlFor="amount-libre" className="sr-only">
        Montant libre, en euros
      </label>
      {/* Don en euros ENTIERS côté UI (step=1 + inputMode numeric) — choix
          assumé : la tolérance décimale de `parseDonation` (virgule acceptée)
          ne sert que les POST sans JS, jamais ce champ. */}
      <input
        id="amount-libre"
        name="amount"
        type="number"
        min={FREE_AMOUNT.min}
        max={FREE_AMOUNT.max}
        step={1}
        inputMode="numeric"
        autoComplete="transaction-amount"
        aria-describedby="amount-libre-hint"
        placeholder="Montant en €"
        required
        className={`min-h-11 w-full border-2 border-ink bg-paper px-4 py-3 font-sans text-sm font-semibold text-ink placeholder:text-muted ${FOCUS_RING_LIGHT}`}
      />
      {/* Bornes visibles ET reliées au champ (WCAG 1.3.5 / UX) : sans elles,
          la contrainte ne se découvre qu'au message de validation natif. */}
      <p id="amount-libre-hint" className="font-sans text-xs text-muted">
        De {FREE_AMOUNT.min} à {formatInt(FREE_AMOUNT.max)}&nbsp;€
      </p>
      <SubmitButton
        tone="dark"
        pendingLabel="Redirection…"
        ariaLabel="Contribuer — montant libre"
        className={SUBMIT_CTA}
      >
        Contribuer
      </SubmitButton>
    </form>
  );
}

/**
 * Rail contreparties — module autonome sur la droite de la PAGE ENTIÈRE
 * (retour client 2026-07-24), plus une colonne du corps de texte : ancré au
 * défilement, avec sa propre barre de scroll — fine et TOUJOURS visible (les
 * overlay scrollbars macOS masquaient toute affordance sur ~10 cartes de
 * profondeur), sans `overscroll-contain` pour laisser le scroll chaîner vers
 * la page en butée. En lg+, le rail monte JUSQU'EN HAUT DE PAGE (maquette
 * 25/07 — priorité maximale aux contreparties) : la navbar se resserre à
 * gauche et lui cède la colonne (cf. `site-header.tsx`, `railInset`), l'aside
 * remonte de la hauteur du header compact (`lg:-mt-24`, même constante 6rem
 * que `scroll-mt-24`) et colle au haut du viewport (`lg:top-0` — le liseré de
 * collecte qui imposait un décalage de 10px a été retiré le 2026-08-20), sur
 * la hauteur du viewport. `RAIL_MAX_HEIGHT_CLASS` vient de
 * `@/components/rail-inset` — source unique partagée avec `site-header.tsx`
 * (`railInset`) et `souscription/page.tsx` (grille) pour que les 380px ne se
 * désynchronisent plus entre les trois arbres.
 * Les 9 cartes sont uniformes ; la carte « montant libre » clôt la liste.
 * Sur mobile, le rail suit toute la colonne principale (l'ancre `#paliers` y
 * mène — `scroll-mt-24` à tous les breakpoints, le header mobile fait ~96px).
 * À l'impression : rail statique déplié, jamais tronqué — porté par
 * `globals.css` (`@media print`) et non par des variantes `lg:print:*`, qui
 * ne matchent pas quand la largeur de PAGE tombe sous `lg`, et qui de toute
 * façon ne rouvriraient pas la colonne du tiroir.
 *
 * C'est cet aside qui porte l'INDICE D'APPEL (`RAIL_PULSE_CLASS`) : il est la
 * surface VISIBLE du tiroir (opaque, pleine largeur de colonne, pleine
 * hauteur de viewport), et tout liseré peint derrière lui est perdu.
 */
export function TiersRail({
  content,
  enabled,
}: {
  content: PageSouscriptionContent;
  enabled: boolean;
}) {
  return (
    <aside
      id="paliers"
      aria-label="Contreparties"
      className={`border-t-2 border-ink bg-paper scroll-mt-24 lg:sticky lg:top-0 lg:-mt-24 ${RAIL_CONTENT_WIDTH_CLASS} ${RAIL_MAX_HEIGHT_CLASS} lg:self-start lg:overflow-y-auto lg:border-l-2 lg:border-t-0 [scrollbar-width:thin] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-ink [&::-webkit-scrollbar-track]:bg-paper-2 ${RAIL_PULSE_CLASS}`}
    >
      {/* `lg:pt-14` : réserve du bouton de fermeture du tiroir, fixé au coin
          haut-droit du panneau (`tiers-drawer.tsx`) — sans elle, il couvrirait
          le coin de la première carte au repos. */}
      <div className="px-5 py-4 sm:px-8 sm:py-6 lg:pt-14">
        {/* Plus d'ancre « Ou donnez un montant libre ↓ » en tête (retirée
            25/07) : la carte montant libre reste en CLÔTURE du rail, seuls le
            CTA final et l'ancre externe `#montant-libre` y mènent. */}
        <FramedGrid className="grid-cols-1">
          {content.contreparties.map((p, i) => {
            // Paliers de don : les quatre couleurs du site, dans leur ordre
            // canonique (retour Clara 2026-08-07 — la page entière a quitté les
            // accents de couverture navy/bottle/ocher/brick).
            const accentBg = POP_BG[POP_ORDER[i % 4]];
            // Un palier ajouté à DONATION_TIERS sans visuel dans
            // TIER_IMAGES rend une carte sans image, jamais un crash.
            const img = TIER_IMAGE_LOOKUP[p.tier.id];
            const compact = COMPACT_TIERS.has(p.tier.id);
            // Même <h3> dans les deux variantes de carte (seule l'enveloppe
            // flex diffère) : hissé hors du ternaire.
            const heading = (
              <h3>
                <span className="block font-sans text-4xl font-black italic text-ink">
                  {formatInt(p.tier.amount)}&nbsp;€
                </span>{" "}
                <span className="mt-1 block font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                  {p.tier.title}
                </span>
              </h3>
            );
            return (
              <div key={p.tier.id} className="h-full">
                <div className="relative flex h-full flex-col bg-paper">
                  <div aria-hidden="true" className={`h-2 ${accentBg}`} />
                  {/* Montage produit sur fond blanc pur — `mix-blend-multiply`
                      fond le blanc dans le `bg-paper` (blanc cassé) du site,
                      les ombres portées restent correctes. Décoratif : la
                      liste textuelle des items porte l'information (alt vide).

                      `loading="eager"` (retour Youri 26/07) : sous `lg` ces
                      cartes vivent dans la feuille de bas d'écran, qui se
                      déroule 1 s après le chargement — en `lazy`, les visuels
                      ne partaient qu'à leur entrée dans le viewport et
                      apparaissaient APRÈS l'ouverture. Ils sont donc chargés
                      d'emblée ; pas de `priority` en revanche, qui les
                      ferait précharger contre le héros de la page. */}
                  {img && !compact && (
                    <Image
                      src={img}
                      alt=""
                      sizes="(min-width: 1024px) 380px, 100vw"
                      placeholder="blur"
                      loading="eager"
                      className="block h-auto w-full mix-blend-multiply"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    {compact ? (
                      /* Variante compacte : l'illustration réduite se loge à
                         droite du montant/intitulé (léger débord vers le
                         cadre, `-mr-2`), pas de bandeau. */
                      <div className="flex items-center justify-between gap-3">
                        {heading}
                        {img && (
                          <Image
                            src={img}
                            alt=""
                            sizes="(min-width: 1024px) 140px, 35vw"
                            placeholder="blur"
                            loading="eager"
                            className="-mr-2 block h-auto w-[35%] shrink-0 mix-blend-multiply"
                          />
                        )}
                      </div>
                    ) : (
                      heading
                    )}
                    {/* Lot en bandes pleine largeur (maquette PDF client) :
                        cadre ink 2px, une bande par ligne, séparateurs
                        porteurs d'un « + » (le lot s'additionne). Une ligne
                        `alternative` (règle « ou » de `site-content-core`)
                        s'accroche à la précédente SANS séparateur : un « ou »
                        centré dans l'écart entre les deux lignes — un choix,
                        pas un ajout. */}
                    <ul role="list" className="mt-4 flex-1 self-start w-full border-2 border-ink">
                      {p.items.map((item, j) => (
                        // Index en clé : deux lignes au texte identique sont
                        // saisissables dans /admin, et la liste serveur n'est
                        // jamais réordonnée.
                        <li key={j}>
                          {j > 0 &&
                            (item.alternative ? (
                              <p className="-my-1.5 text-center font-sans text-sm font-medium italic leading-none text-ink">
                                ou
                              </p>
                            ) : (
                              <div aria-hidden="true" className="relative h-[2px] bg-ink">
                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-paper px-1.5 font-sans text-sm font-black leading-none text-ink">
                                  +
                                </span>
                              </div>
                            ))}
                          <p className="px-3 py-2.5 text-center font-sans text-sm font-bold leading-snug text-ink">
                            {item.texte}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {enabled ? (
                      // Palier À CHOIX (client 2026-08-21) : le CTA n'encaisse
                      // plus directement — il mène à l'étape de sélection
                      // dédiée (`/souscription/contrepartie/<id>`), un LIEN
                      // stylé à l'identique du `SubmitButton` (même libellé,
                      // même nom accessible), jamais le `<form>` Stripe direct
                      // des paliers fixes. `tierHasChoices` lit
                      // `CONTREPARTIES_2026` (`contreparties-core.ts`), pas ce
                      // contenu éditorial — la SEULE source de la règle.
                      tierHasChoices(p.tier.id as DonationTierId) ? (
                        <Link
                          href={`/souscription/contrepartie/${p.tier.id}`}
                          aria-label={`Contribuer ${formatInt(p.tier.amount)} € — ${p.tier.title}`}
                          className={`mt-3 ${SUBMIT_CTA}`}
                        >
                          Contribuer
                        </Link>
                      ) : (
                        <form action={createDonationCheckout} className="contents">
                          <input type="hidden" name="tierId" value={p.tier.id} />
                          <SubmitButton
                            tone="dark"
                            pendingLabel="Redirection…"
                            ariaLabel={`Contribuer ${formatInt(p.tier.amount)} € — ${p.tier.title}`}
                            className={`mt-3 ${SUBMIT_CTA}`}
                          >
                            Contribuer
                          </SubmitButton>
                        </form>
                      )
                    ) : (
                      <ClosedCta className="mt-3" noteId={`ouverture-${p.tier.id}`} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Carte de clôture — montant libre (retour client 2026-07-24) : le
              formulaire à montant personnalisé vit tout en bas de la liste,
              après les 9 paliers, et poursuit le cycle des 4 couleurs du
              site. */}
          <div className="h-full">
            <div id="montant-libre" className="flex h-full flex-col bg-paper">
              <div
                aria-hidden="true"
                className={`h-2 ${POP_BG[POP_ORDER[content.contreparties.length % 4]]}`}
              />
              <div className="flex flex-1 flex-col p-6">
                <h3>
                  <span className="block font-sans text-3xl font-black italic text-ink">
                    Montant libre
                  </span>{" "}
                  <span className="mt-1 block font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                    Contribuez à hauteur de votre choix
                  </span>
                </h3>
                <FreeAmountForm enabled={enabled} />
              </div>
            </div>
          </div>
        </FramedGrid>
      </div>
    </aside>
  );
}

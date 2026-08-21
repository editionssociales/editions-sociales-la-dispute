import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Button } from "@/components/button";
import { SubmitButton } from "@/components/submit-button";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { FramedGrid } from "@/components/framed-grid";
import { formatInt } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { DONATION_TIERS } from "@/lib/donation-tiers";
import { contrepartieForTier, tierHasChoices } from "@/lib/contreparties-core";
import { getContrepartieDisplay, type ContrepartieDisplayItem } from "@/lib/contreparties";
import { FOCUS_RING_DARK, FOCUS_RING_HOVER_LIGHT } from "@/lib/ui";
import { OPENING_MICROCOPY } from "../../_components/tiers-rail";
import { createDonationCheckout } from "../../actions";

/**
 * Étape « catalogue restreint » de la souscription (client 2026-08-21) — les
 * 4 paliers à choix (50/100/200/1000 €, `tierHasChoices`) passent par ici
 * AVANT Stripe ; les 5 paliers fixes n'y mènent jamais (leur `<form>` du rail
 * poste directement `createDonationCheckout`, cf. `_components/tiers-rail.tsx`).
 * `[tierId]` invalide OU palier SANS choix → `notFound()` : cette route
 * n'existe que pour les 4 ids concernés, jamais un alias des paliers fixes.
 *
 * Rendu serveur, même DA que `/souscription` (Container/PageHero/Reveal) —
 * page fonctionnelle du tunnel de paiement, jamais indexée (comme `/merci`,
 * `/erreur`). Le `<form>` reposte tel quel vers `createDonationCheckout`
 * (`../../actions.ts`) : `tierId` cachée + un radio `choix.<sectionId>` par
 * section à choix — la même server action résout la composition ET refait le
 * tour ici en cas de sélection incomplète (`?erreur=choix`, jamais un aller
 * simple qui perdrait la main).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tierId: string }>;
}): Promise<Metadata> {
  const { tierId } = await params;
  const tier = DONATION_TIERS.find((t) => t.id === tierId);
  if (!tier || !tierHasChoices(tier.id)) return {};
  return {
    title: `Choisissez votre contrepartie — ${tier.title}`,
    robots: { index: false, follow: false },
  };
}

/** Même recette que `SUBMIT_CTA` de `_components/tiers-rail.tsx` — pas exportée de là (privée au module), reproduite ici plutôt que couplée à un import cross-page. */
const SUBMIT_CTA =
  `min-h-11 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-6 py-3 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink active:brightness-90 ${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT}`;

/** Visuel d'un item de contrepartie — couverture réelle, ou repli sobre (titre) pour un pack/brouillon sans image. */
function ItemVisual({ item, className }: { item: ContrepartieDisplayItem; className: string }) {
  if (item.coverUrl) {
    return (
      <span className={`relative block overflow-hidden border-2 border-ink bg-paper-2 ${className}`}>
        <Image src={item.coverUrl} alt="" fill sizes="200px" className="object-contain p-2" />
      </span>
    );
  }
  return (
    <span
      className={`flex items-center justify-center overflow-hidden border-2 border-ink bg-paper-2 px-1 py-2 text-center font-sans text-[10px] font-bold uppercase leading-tight text-ink ${className}`}
    >
      <span className="break-words">{item.title}</span>
    </span>
  );
}

export default async function ContrepartieChoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ tierId: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { tierId } = await params;
  const tier = DONATION_TIERS.find((t) => t.id === tierId);
  if (!tier || !tierHasChoices(tier.id)) notFound();
  const { erreur } = await searchParams;

  const composition = contrepartieForTier(tier.id);
  const sections = await getContrepartieDisplay(composition);
  const enabled = stripeEnabled();

  return (
    <section className="bg-paper">
      <Container className="py-16 sm:py-20">
        <PageHero
          title={`${tier.title} — ${formatInt(tier.amount)} €`}
          intro="Choisissez votre contrepartie avant de continuer vers le paiement."
        />

        {erreur === "choix" && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-6 max-w-3xl border-2 border-brick bg-paper px-4 py-3 font-sans text-sm font-semibold text-brick"
          >
            Merci de sélectionner une option dans chaque section ci-dessous avant de continuer.
          </p>
        )}

        <form action={createDonationCheckout} className="mt-10 max-w-3xl space-y-10">
          <input type="hidden" name="tierId" value={tier.id} />
          {sections.map((section, i) => {
            const n = i + 1;
            return (
              <Reveal key={section.kind === "choix" ? section.id : `inclus-${n}`}>
                {section.kind === "choix" ? (
                  <fieldset>
                    <legend className="font-sans text-lg font-black italic text-ink sm:text-xl">
                      {n}. {section.label}
                    </legend>
                    <FramedGrid className="mt-4 grid-cols-1 sm:grid-cols-2">
                      {section.options.map((option) => (
                        <label
                          key={option.id}
                          className="group relative flex cursor-pointer flex-col gap-3 bg-paper p-4 transition-colors has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-ink"
                        >
                          {/* Radio natif masqué visuellement (jamais `hidden` :
                              il reste focalisable et lu par les AT) — la carte
                              entière est le libellé cliquable, la sélection se
                              lit sur le fond (`has-[:checked]`), zéro JS. */}
                          <input
                            type="radio"
                            name={`choix.${section.id}`}
                            value={option.id}
                            required
                            className="sr-only"
                          />
                          <span className="flex flex-wrap justify-center gap-2">
                            {option.items.map((item) => (
                              <ItemVisual key={item.slug} item={item} className="h-36 w-24 shrink-0" />
                            ))}
                          </span>
                          <span className="text-center font-sans text-sm font-bold leading-snug">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </FramedGrid>
                  </fieldset>
                ) : (
                  <div>
                    <h2 className="font-sans text-lg font-black italic text-ink sm:text-xl">
                      {n}. {section.label}
                    </h2>
                    <ul
                      role="list"
                      className="mt-4 flex flex-wrap gap-[2px] border-2 border-ink bg-ink p-[2px]"
                    >
                      {section.items.map((item) => (
                        <li key={item.slug} className="flex items-center gap-3 bg-paper p-3">
                          <ItemVisual item={item} className="h-28 w-20 shrink-0" />
                          <span className="font-sans text-sm font-bold text-ink">
                            {item.title}
                            {item.qty > 1 ? ` × ${item.qty}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Reveal>
            );
          })}

          <div>
            {enabled ? (
              <SubmitButton
                tone="dark"
                pendingLabel="Redirection…"
                ariaLabel="Continuer vers le paiement"
                className={SUBMIT_CTA}
              >
                Continuer vers le paiement
              </SubmitButton>
            ) : (
              // Même comportement R7 que le rail (`ClosedCta`) : CTA
              // réellement désactivé, jamais un bouton mort qui a l'air
              // cliquable — même microcopie d'ouverture, source unique.
              <div className="flex flex-col items-start gap-1.5">
                <Button
                  type="button"
                  variant="solid"
                  disabled
                  aria-describedby="ouverture-contrepartie"
                  className="min-h-11 px-6 py-3 text-sm tracking-[.03em]"
                >
                  Continuer vers le paiement
                </Button>
                <p
                  id="ouverture-contrepartie"
                  className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-muted"
                >
                  {OPENING_MICROCOPY}
                </p>
              </div>
            )}
          </div>
        </form>

        <div className="mt-10">
          <Button href="/souscription#paliers" variant="outline" className="px-6 py-3 text-sm tracking-[.03em]">
            ← Retour aux contreparties
          </Button>
        </div>
      </Container>
    </section>
  );
}

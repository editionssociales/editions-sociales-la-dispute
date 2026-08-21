import type { CollectionBeforeChangeHook } from 'payload'

import { planBuyLinksAutofill } from './buy-links-core.ts'
import type { BuyLinksNeed, ResolvedBuyLinks } from './buy-links-resolve.ts'

/**
 * Hook `beforeChange` de `Books` : remplit `buy.parislibrairies`/
 * `buy.lalibrairie` depuis l'ISBN quand ils sont vides (ou obsolètes après
 * changement d'ISBN, cf. `planBuyLinksAutofill`). Résolveur INJECTÉ — le hook
 * branché en prod (`Books.ts`) est `makeAutofillBuyLinks(resolveBuyLinks)` ;
 * `buy-links-autofill.test.ts` injecte un résolveur factice pour rester sans
 * réseau.
 *
 * Garde `context.migration` en tête, même contrat que `setContentTouched`
 * (`Books.ts`) : le script de backfill et l'import stock passent ce flag et
 * ne doivent jamais déclencher de réseau depuis un hook déclenché par leurs
 * propres écritures.
 *
 * Fail-open total : un échec de résolution (site tiers en carafe, timeout —
 * `resolveBuyLinks` renvoie déjà `null` dans ce cas) laisse le champ tel
 * quel, retenté au prochain enregistrement ; le try/catch englobant couvre
 * en plus tout résolveur qui jetterait au lieu de renvoyer `null` — dans les
 * deux cas, l'enregistrement de la fiche ne doit JAMAIS échouer à cause d'un
 * site tiers.
 */
export function makeAutofillBuyLinks(
  resolver: (ean13: string, need: BuyLinksNeed) => Promise<ResolvedBuyLinks>,
): CollectionBeforeChangeHook {
  return async ({ data, req, originalDoc }) => {
    if (req.context?.migration) {
      return data
    }

    const isbn = typeof data?.isbn === 'string' ? data.isbn : (originalDoc?.isbn ?? null)
    const previousIsbn = originalDoc?.isbn ?? null
    // Fusion — `data.buy` peut être partiel (PATCH REST) : la valeur courante
    // d'un champ non touché par cette requête reste celle de la fiche.
    const currentBuy = { ...(originalDoc?.buy ?? {}), ...(data?.buy ?? {}) }

    const plan = planBuyLinksAutofill({
      isbn,
      previousIsbn,
      parislibrairies: currentBuy.parislibrairies ?? null,
      lalibrairie: currentBuy.lalibrairie ?? null,
    })

    if (plan.ean13 == null || (!plan.needParis && !plan.needLalibrairie)) {
      return data
    }

    try {
      const resolved = await resolver(plan.ean13, {
        needParis: plan.needParis,
        needLalibrairie: plan.needLalibrairie,
      })

      const nextBuy = { ...currentBuy }
      // Uniquement les champs du plan, et seulement si résolus (jamais
      // d'écrasement d'une valeur non vide par un échec de résolution).
      if (plan.needParis && resolved.parislibrairies) {
        nextBuy.parislibrairies = resolved.parislibrairies
      }
      if (plan.needLalibrairie && resolved.lalibrairie) {
        nextBuy.lalibrairie = resolved.lalibrairie
      }

      return { ...data, buy: nextBuy }
    } catch (err) {
      req.payload.logger.error(
        `[buy-links-autofill] échec de résolution (ISBN ${plan.ean13}) : ${err instanceof Error ? err.message : String(err)}`,
      )
      return data
    }
  }
}

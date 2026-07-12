/**
 * Domaine « paliers de don » — pur, sans I/O (convention `src/lib/CLAUDE.md`).
 *
 * Table de référence des contreparties/mécènes de la souscription 2026 (reprise
 * des données en dur de `souscription/page.tsx`) + validation serveur d'un don :
 * un palier voit son montant **dérivé de cette table**, jamais du client ; un
 * montant libre est borné et converti en centimes ici, une fois pour toutes.
 */

import { deriveGauge, type CampaignGauge, type Palier } from "./campaign";

/**
 * Valeur de `metadata.campaign` posée sur chaque session/paiement Stripe — le
 * contrat exact que la jauge recherche. À NE PLUS JAMAIS CHANGER après le
 * premier don encaissé : la jauge et les exports en dépendent.
 */
export const CAMPAIGN_KEY = "souscription-2026";

/** Un palier de don : montant fixe, intitulé, et présence d'une contrepartie physique. */
export interface DonationTier {
  id: string;
  amount: number;
  title: string;
  physical: boolean;
}

/**
 * Paliers de la souscription 2026 — 8 contreparties (15→300 €, envoi postal)
 * + 2 mécènes (500/1000 €, contact direct, pas d'envoi). Provisoires : reprise
 * des montants/titres 2024 actuellement en dur dans `souscription/page.tsx`,
 * remplacés à réception des contenus définitifs (E10).
 */
export const DONATION_TIERS: DonationTier[] = [
  { id: "palier-15", amount: 15, title: "Le coup de pouce", physical: true },
  { id: "palier-35", amount: 35, title: "Petit mais irremplaçable", physical: true },
  { id: "palier-50", amount: 50, title: "L'essentiel", physical: true },
  { id: "palier-75", amount: 75, title: "L'indispensable", physical: true },
  { id: "palier-100", amount: 100, title: "L'incontournable", physical: true },
  { id: "palier-150", amount: 150, title: "Le très grand format", physical: true },
  { id: "palier-200", amount: 200, title: "Les nouveautés", physical: true },
  { id: "palier-300", amount: 300, title: "Le grand lot", physical: true },
  { id: "mecene-500", amount: 500, title: "La rencontre", physical: false },
  { id: "mecene-1000", amount: 1000, title: "L'intégrale", physical: false },
];

/** Bornes du montant libre (€) — anti card-testing / anti-fat-finger. */
export const FREE_AMOUNT = { min: 5, max: 10_000 };

/** Résultat d'un don valide : montant en centimes + palier le cas échéant. */
export interface ParsedDonation {
  amountMinor: number;
  tier?: DonationTier;
}

/** Résultat d'un don refusé — jamais d'exception, un message à afficher/logger. */
export interface ParsedDonationError {
  error: string;
}

/**
 * Valide et convertit une soumission de don. Un `tierId` connu dérive
 * **toujours** son montant de `DONATION_TIERS` (le montant éventuellement
 * envoyé par le client n'est jamais lu pour un palier) ; sans `tierId`, le
 * montant libre est parsé (virgule décimale acceptée), borné à `FREE_AMOUNT`
 * et converti en centimes.
 */
export function parseDonation(input: {
  tierId?: string;
  amount?: string;
}): ParsedDonation | ParsedDonationError {
  if (input.tierId) {
    const tier = DONATION_TIERS.find((t) => t.id === input.tierId);
    if (!tier) return { error: `Palier inconnu : ${input.tierId}` };
    return { amountMinor: Math.round(tier.amount * 100), tier };
  }

  if (!input.amount) return { error: "Montant manquant" };

  // Virgule décimale acceptée (saisie française) en plus du point.
  const normalized = input.amount.trim().replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: `Montant invalide : ${input.amount}` };
  }
  if (value < FREE_AMOUNT.min || value > FREE_AMOUNT.max) {
    return {
      error: `Montant hors bornes (${FREE_AMOUNT.min}–${FREE_AMOUNT.max} €) : ${value}`,
    };
  }
  return { amountMinor: Math.round(value * 100) };
}

/** Objectif provisoire de la campagne 2026 (€) — remplacé à réception des contenus (E10). */
export const CAMPAIGN_2026_GOAL = 50_000;

/** Paliers de jauge provisoires 2026 (repris de 2024) — remplacés en E10. */
export const CAMPAIGN_2026_PALIERS: Palier[] = [
  { value: 50_000, label: "Survie" },
  { value: 75_000, label: "Consolidation" },
  { value: 100_000, label: "Déploiement" },
];

/**
 * Vue-modèle de la campagne 2026 « en cours » — **uniquement** ce qu'une jauge
 * vivante peut afficher honnêtement : `deriveGauge` (`campaign.ts`) ne connaît
 * ni `messages` ni `durationDays`, les tuiles rétrospectives du gabarit 2024
 * (`deriveStats`) n'existent donc tout simplement pas pour la campagne en
 * cours — plus de faits neutres à inventer ni de champ à écarter.
 */
export type Campaign2026 = CampaignGauge;

export function deriveCampaign2026(totals: {
  collected: number;
  contributors: number;
}): Campaign2026 {
  return deriveGauge({
    collected: totals.collected,
    goal: CAMPAIGN_2026_GOAL,
    contributors: totals.contributors,
    paliers: CAMPAIGN_2026_PALIERS,
  });
}

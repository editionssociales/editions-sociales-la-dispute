/**
 * Domaine « campagne / paliers » — pur, sans I/O ni rendu.
 *
 * Deux dérivations aux besoins distincts : `deriveGauge` (jauge + compteurs —
 * tout ce qu'une campagne **en cours** peut honnêtement afficher) et
 * `deriveStats` (tuiles rétrospectives — messages, durée — qui n'ont de sens
 * que pour une campagne **terminée**). Les séparer évite d'inventer des faits
 * neutres pour remplir une interface trop large.
 */

/** Un palier de collecte (montant + intitulé). */
export interface Palier {
  value: number;
  label: string;
}

/** Faits d'une jauge de collecte — communs aux campagnes passées et en cours. */
export interface GaugeFacts {
  /** Montant collecté (€). */
  collected: number;
  /** Objectif initial (€). */
  goal: number;
  contributors: number;
  /** Paliers ordonnés du plus bas au plus haut. */
  paliers: Palier[];
}

/** Faits complets d'une campagne TERMINÉE — seuls eux autorisent les tuiles de stats. */
export interface CampaignFacts extends GaugeFacts {
  messages: number;
  durationDays: number;
}

/** Palier projeté avec son état atteint/non atteint. */
export interface GaugeMarker extends Palier {
  reached: boolean;
}

/** Une tuile de statistique (valeur animée + suffixe + libellé). */
export interface CampaignStat {
  value: number;
  suffix: string;
  label: string;
}

/** Vue-modèle de jauge, consommée par `<Gauge>` et les compteurs. */
export interface CampaignGauge {
  collected: number;
  goal: number;
  contributors: number;
  /**
   * Pourcentage de l'objectif *initial* atteint, planché : on n'annonce
   * jamais un palier de pourcentage qu'on n'a pas franchi (170 % à 85 305 €
   * sur 50 000 €, pas 171 %).
   */
  percentOfGoal: number;
  /** Entrées prêtes pour `<Gauge>` — valeur, plafond (dernier palier) et paliers. */
  gauge: {
    value: number;
    max: number;
    markers: GaugeMarker[];
  };
}

/** Dérive la jauge et ses compteurs — la partie valable pour toute campagne. */
export function deriveGauge(facts: GaugeFacts): CampaignGauge {
  const max = facts.paliers.reduce((m, p) => Math.max(m, p.value), 0);
  return {
    collected: facts.collected,
    goal: facts.goal,
    contributors: facts.contributors,
    percentOfGoal: Math.floor((facts.collected / facts.goal) * 100),
    gauge: {
      value: facts.collected,
      max,
      markers: facts.paliers.map((p) => ({ ...p, reached: facts.collected >= p.value })),
    },
  };
}

/** Tuiles rétrospectives (gabarit 2024) — exige les faits d'une campagne terminée. */
export function deriveStats(facts: CampaignFacts): CampaignStat[] {
  const { percentOfGoal } = deriveGauge(facts);
  return [
    { value: facts.collected, suffix: " €", label: `collectés en ${facts.durationDays} jours` },
    { value: facts.contributors, suffix: "", label: "contributeur·rices" },
    { value: percentOfGoal, suffix: " %", label: "de l'objectif initial" },
    { value: facts.messages, suffix: "", label: "messages de soutien" },
  ];
}

/**
 * Résultats finaux de la campagne Ulule 2024 « Sauvez les Éditions sociales et
 * La Dispute » (source : API Ulule).
 */
const FACTS_2024: CampaignFacts = {
  collected: 85305,
  goal: 50000,
  contributors: 958,
  messages: 419,
  durationDays: 39,
  paliers: [
    { value: 50000, label: "Survie" },
    { value: 75000, label: "Consolidation" },
    { value: 100000, label: "Déploiement" },
  ],
};

export const CAMPAIGN_2024 = {
  ...deriveGauge(FACTS_2024),
  stats: deriveStats(FACTS_2024),
};

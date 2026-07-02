/**
 * Domaine « campagne / paliers » — pur, sans I/O ni rendu.
 *
 * Concentre les faits d'une souscription (collecte, objectif, paliers) et en
 * dérive tout ce que la page et la jauge affichaient jusqu'ici à la main :
 * pourcentage de l'objectif, paliers atteints, plafond de la jauge, tuiles de
 * statistiques. Les dérivations deviennent testables sans rendu ; la page
 * redevient une coquille de présentation.
 */

/** Un palier de collecte (montant + intitulé). */
export interface Palier {
  value: number;
  label: string;
}

/** Faits bruts d'une campagne — seule source à maintenir. */
export interface CampaignFacts {
  /** Montant collecté (€). */
  collected: number;
  /** Objectif initial (€). */
  goal: number;
  contributors: number;
  messages: number;
  durationDays: number;
  /** Paliers ordonnés du plus bas au plus haut. */
  paliers: Palier[];
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

/** Vue-modèle dérivée d'une campagne, consommée par la page et la jauge. */
export interface Campaign {
  collected: number;
  goal: number;
  contributors: number;
  messages: number;
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
  stats: CampaignStat[];
}

/** Dérive la vue-modèle complète d'une campagne à partir de ses faits bruts. */
export function deriveCampaign(facts: CampaignFacts): Campaign {
  const max = facts.paliers.reduce((m, p) => Math.max(m, p.value), 0);
  const percentOfGoal = Math.floor((facts.collected / facts.goal) * 100);
  return {
    collected: facts.collected,
    goal: facts.goal,
    contributors: facts.contributors,
    messages: facts.messages,
    percentOfGoal,
    gauge: {
      value: facts.collected,
      max,
      markers: facts.paliers.map((p) => ({ ...p, reached: facts.collected >= p.value })),
    },
    stats: [
      { value: facts.collected, suffix: " €", label: `collectés en ${facts.durationDays} jours` },
      { value: facts.contributors, suffix: "", label: "contributeur·rices" },
      { value: percentOfGoal, suffix: " %", label: "de l'objectif initial" },
      { value: facts.messages, suffix: "", label: "messages de soutien" },
    ],
  };
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

export const CAMPAIGN_2024 = deriveCampaign(FACTS_2024);

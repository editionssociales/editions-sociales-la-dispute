/**
 * Domaine « campagne / paliers » — pur, sans I/O ni rendu.
 *
 * `deriveGauge` : jauge + compteurs — tout ce qu'une campagne **en cours**
 * peut honnêtement afficher. Le volet rétrospectif 2024 (`deriveStats`,
 * `CAMPAIGN_2024`) a été supprimé avec la section « En 2024, vous avez sauvé
 * nos maisons » de /souscription (livraison campagne 2026 du 2026-07-24,
 * consigne client : rien qui ne soit un extrait des documents fournis) —
 * historique dans git au besoin.
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

/** Palier projeté avec son état atteint/non atteint. */
export interface GaugeMarker extends Palier {
  reached: boolean;
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

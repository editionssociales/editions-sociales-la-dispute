/**
 * Données PROVISOIRES des rencontres La Dispute — saisies à la main depuis
 * ladispute.fr/rencontres/ (relevé du 2026-07-22), en attendant une collection
 * Payload dédiée à la gestion des rencontres (agenda éditable depuis
 * `/admin`, au même endroit que le catalogue — cf. `/rencontres`). À retirer
 * dès que cette collection existe ; ne pas enrichir à la main au-delà de ce
 * qui est déjà là.
 */

export interface RencontreEvent {
  titre: string;
  /** ISO (aaaa-mm-jj) — formatée à l'affichage via `formatDateFr`. */
  date: string;
  /** Optionnelle : certaines rencontres n'ont pas d'heure connue. */
  heure?: string;
  lieu: string;
  ville: string;
  livreOuAuteurs: string;
  description: string;
}

export const RENCONTRES_EVENTS: RencontreEvent[] = [
  {
    titre: "Présentation du livre « De #MeToo à #NousToutes »",
    date: "2026-06-23",
    lieu: "Librairie Ombres blanches",
    ville: "Toulouse",
    livreOuAuteurs: "De #MeToo à #NousToutes, Irène Despontin-Lefèvre",
    description:
      "Présentation du livre d'Irène Despontin-Lefèvre, De #MeToo à #NousToutes, à la librairie Ombres blanches.",
  },
  {
    titre: "Présentation du livre « Décoloniser le marxisme »",
    date: "2026-06-16",
    lieu: "Librairie Terra Nova",
    ville: "Toulouse",
    livreOuAuteurs: "Décoloniser le marxisme, Matthieu Renault",
    description:
      "Présentation du livre de Matthieu Renault, Décoloniser le marxisme, à la librairie Terra Nova.",
  },
  {
    titre: "Table ronde : « L'indépendance de la justice »",
    date: "2026-05-30",
    heure: "15h-16h30",
    lieu: "Librairie Les traversées",
    ville: "Paris (5e)",
    livreOuAuteurs:
      "Gouverner les juges, Vincent Sizaire ; avec Marie Dosé et Fabrice Arfi ; modération Lena Dufeutrelle",
    description:
      "Table ronde « L'indépendance de la justice » modérée par Lena Dufeutrelle, avec Marie Dosé, Fabrice Arfi et Vincent Sizaire, auteur de Gouverner les juges.",
  },
];

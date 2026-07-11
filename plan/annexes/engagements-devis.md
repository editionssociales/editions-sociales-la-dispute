# CHECKLIST DES ENGAGEMENTS — DEVIS OPTION B (incl. variante B phasé)

Source : `/Users/yourihamon/marina_es/devis/DEVIS-MULTI-OPTIONS.md` (sections 1–11) croisé avec `/Users/yourihamon/marina_es/site/IMPLEMENTATION-PROMPT.md`.

## Bloc 3.1 — Catalogue (293 livres, deux maisons, une interface)

- C1. Fiche livre complète : ISBN, prix, date de parution, résumé, couverture, liens… (~15 champs structurés, témoin ACF 16 champs/site).
- C2. Classements par auteur, collection et parution ; filtre « à paraître ».
- C3. Statut de parution pilotant le bouton d'achat : paru / à paraître / indisponible / lien externe.
- C4. Recherche, tri (récent / ancien / titre), pagination, pages par maison — référence citée : La Fabrique.
- C5. Saisie de textes riches (résumés, biographies) dans le back-office.
- C6. Orthotypographie française automatique (espaces insécables, guillemets…) réimplémentée dans le rendu du nouveau site.
- C7. Base de données PostgreSQL avec schéma propre (livres, auteurs, collections, parutions), hébergée, sauvegardée chaque nuit — devis : 0,5 j / 100 €.
- C8. Migration automatisée des 293 livres, vérifiée par échantillon avec le client — devis : 1 j / 200 €.
- C9. Rapatriement des couvertures (~1 Go) vers un stockage dédié avec diffusion rapide — devis : 0,5 j / 100 €.
- C10. Back-office : création/modification des fiches (tous les champs, statut de parution compris), rôles pour l'équipe, prise en main incluse (Floée comprise) — devis : 2 j / 400 € (bloc 3.1/3.5).
- C11. Bascule de la source de données (swap adaptateur WordPress → base propre) + extinction des 2 WordPress catalogue après recouvrement — devis : 0,5 j / 100 €.

## Bloc 3.2 — Vente en ligne (223 produits, ~117 commandes/mois)

- C12. Panier et paiement par carte via Stripe — les lecteurs paient déjà via Stripe, migration invisible pour eux.
- C13. Caisse Stripe **unifiée** livres + dons (une seule caisse).
- C14. TVA livres à 5,5 %.
- C15. Frais de port au poids et à la zone : zone France–Belgique–Suisse avec grilles au poids et livraison offerte sous conditions (7 méthodes configurées), forfait reste du monde — grille **recopiée fidèlement, pas réinventée**.
- C16. Export des commandes pour la comptabilité (CSV), remplaçant Advanced Order Export.
- C17. Codes promo / remises simples (le besoin réel est modeste : 1 règle en base, chiffré modeste).
- C18. Panier visible en permanence (onglet flottant natif dans le nouveau design).
- C19. Emails de commande qui arrivent : envoi par service dédié avec configuration SPF/DKIM anti-spam.
- C20. Achat en invité, sans espace client à construire.
- C21. Migration des 223 produits, fusionnés avec les fiches livres — une seule fiche par livre, plus de double saisie — devis : 0,5 j / 100 €.
- C22. Archives : export complet des 5 753 commandes (depuis mars 2018) et des clients (CSV + copie de base) remis **avant** toute extinction de la boutique — devis : 0,25 j / 50 €.
- C23. Poste devis « Commerce natif » (panier, Stripe unifié, TVA 5,5 %, port au poids/zone, emails, export compta, promos) : 2 j / 400 €.
- C24. Recette commerce avec de vraies commandes de test avant bascule.
- C25. Extinction de la boutique WordPress uniquement après confirmation de l'archive (couplée au poste surveillance, C42).

## Bloc 3.3 — Dons (échéance du 15 août)

- C26. Page de souscription : paliers, contreparties, jauge de progression (référence : campagne Ulule 2024, 85 305 €, 958 contributeurs, 11 contreparties de 15 à 1 000 €).
- C27. Encaissement direct : Stripe Checkout (ou widget HelloAsso au même prix si association), reçu par email, page de remerciement.
- C28. Dons livrés **en premier**, indépendamment du reste ; paliers et contreparties 2026 intégrés ; test de bout en bout puis passage en réel ; prêt **bien avant le 15 août** — devis : 1 j / 200 €.

## Bloc 3.4 — Communication

- C29. Newsletter : import des 2 848 abonnés confirmés vers Brevo **avec preuve de consentement conservée**.
- C30. Formulaire d'inscription newsletter sur le site.
- C31. Un formulaire de contact — un seul, qui marche (remplace les 3 outils redondants).
- C32. Mises en avant ponctuelles (parution, campagne) natives, remplaçant les 2 Popup Builder.
- C33. Poste devis « Newsletter (2 848 abonnés → Brevo) + formulaires » : 0,5 j / 100 €.

## Bloc 3.5 — Administration & exploitation

- C34. Back-office simple pensé pour des non-techniciens, avec rôles pour l'équipe (rien à cacher, contrairement aux 4 extensions de masquage wp-admin).
- C35. Sauvegardes automatiques quotidiennes, exportées.
- C36. Surveillance : remontée d'erreurs, alerte si le site tombe, statistiques de visite sobres et sans cookie.
- C37. Référencement : redirections 301 des anciennes adresses, sitemap, métadonnées propres.
- C38. Pages légales.
- C39. Bascule DNS maison par maison **sans toucher aux emails** (les adresses @editionssociales.fr continuent à l'identique).
- C40. Résiliation du slot OVH vide (287 €/an pour 0 Mo) — comprise dans le forfait.
- C41. Recette complète avec l'équipe ; poste devis « Mise en production » (légales, 301, sitemap, DNS, résiliation slot, recette) : 1 j / 200 €.
- C42. Poste devis « Surveillance complète + extinction de la boutique WordPress » : 0,25 j / 50 €.

## Devis global — enveloppe et lignes de cadrage

- C43. Poste « Socle déjà réalisé » (reconnaissance, prototype, beta en ligne, pont de lecture) : ~4 j réels / **0 € — offert**.
- C44. Total option B : **10 j / 2 000 €** (14 j de travail réels facturés 10, tarif militant 200 €/j ; repère marché : 6 000–9 000 €).
- C45. Forfait **ferme** à périmètre constant : tout dépassement discuté avant, rien facturé par surprise ; toute demande hors périmètre chiffrée et validée **par écrit** avant engagement.
- C46. Les options sont cumulatives : monter de gamme plus tard = payer la différence de forfait, pas repayer le tout (engagement contractuel).

## Méthode & calendrier

- C47. Mise en ligne option B : ~24–28 juillet ; semaine 1 = BDD + migration catalogue + back-office + **dons en production** ; semaine 2 = commerce + newsletter + recette + bascule/extinctions.
- C48. L'échéance du 15 août est sécurisée dès la première semaine, quoi qu'il arrive ensuite.
- C49. Démonstration dédiée du back-office **vers le 15 juillet** pour prise en main précoce par l'équipe.
- C50. Recette complète **avant la fermeture d'août** du client.
- C51. **Disponibilité le 15 août pendant la fermeture** : message et moment du lancement figés ensemble avant le départ, mise en ligne assurée, surveillance des premiers dons.
- C52. Méthode : pas de cahier des charges de quarante pages — petites étapes visibles en ligne au fur et à mesure, démonstrations régulières, allers-retours.
- C53. Variante **B phasé** (même prix 2 000 €) : dons + catalogue + back-office fin juillet ; commerce natif en septembre ; aucune ligne du devis ne change.
- C54. B phasé : paiement au rythme des deux phases (solde de chaque phase à sa recette).
- C55. B phasé : surveillance de la boutique WordPress actuelle pendant la transition, **mises à jour de sécurité comprises**.
- C56. Migrations couvertes : vérification par échantillonnage avec l'équipe, période de recouvrement (WordPress allumés en parallèle), bascule réversible.
- C57. Bascule douce : découplage des sources (WordPress joignables sur adresses techniques stables), DNS domaine par domaine avec TTL abaissé avant, redirections **302 d'abord puis 301 après validation client**.
- C58. Dépendance de la Legacy REST API **tracée avant toute coupure** (export comptable suspecté).
- C59. Validité du prix et du calendrier jusqu'au **31 juillet 2026** (calendrier supposant décision le 8 juillet ; au-delà seuls les délais se recalent).
- C60. Paiement : 50 % à la commande, 50 % à la recette [à ajuster si besoin].

## Coûts de fonctionnement (section 8)

- C61. Fonctionnement cible en B : **~37 à 56 €/mois**, même ordre de grandeur qu'aujourd'hui (~40 €/mois).
- C62. OVH ramené à ~6,6 €/mois après résiliation du slot vide (−24 €/mois) ; domaines + Email Pro ~9 €/mois inchangés.
- C63. Vercel Pro ~20 €/mois — dépense nouvelle assumée, compte ouvert **au nom du client**, code portable ailleurs.
- C64. Base PostgreSQL + stockage images : ~1 €/mois.
- C65. Brevo : 0 € hors campagne, 9–19 € les mois d'envoi.
- C66. Surveillance + statistiques : 0 €.
- C67. Dons : Stripe direct ~1,5 % + 0,25 €/don (vs Ulule 5–8 %), HelloAsso 0 % si association — **~3 000 à 5 000 € conservés** sur une campagne type 2024 (économie proportionnelle à la collecte, honnêtement signalée).
- C68. Boutique : frais Stripe par vente **inchangés** — aucune économie fictive vendue sur le péage bancaire.
- C69. Abonnements (Vercel, Brevo…) souscrits au nom de la structure et payés par elle dès la mise en production — aucun frais récurrent ne transite par le prestataire.

## Propriété, réversibilité, autonomie, maintenance (section 9)

- C70. Tout créé **au nom de la structure** : compte de paiement, hébergement, dépôt du code, outil newsletter.
- C71. Transfert de la version de démonstration sans perte d'historique, au plus tard à la mise en production ; ensuite le prestataire intervient **comme invité** sur les comptes du client, jamais l'inverse.
- C72. Code sur standards ouverts et répandus, **portable** : déployable ailleurs que chez Vercel, base PostgreSQL standard — aucun enfermement, un autre prestataire peut reprendre demain.
- C73. WordPress intacts tant que le client n'a pas décidé de les éteindre ; chaque bascule réversible tant que l'ancien tourne en parallèle.
- C74. **Aucune extinction ne détruit de données sans export complet remis avant** (y compris l'archive des 5 753 commandes pour la compta) — tolérance zéro à la perte silencieuse.
- C75. En B : plus **aucune** mise à jour technique WordPress à la charge de l'équipe ; catalogue et produits gérés dans le nouveau back-office.
- C76. Le contenu éditorial reste entre les mains du client dans tous les cas.
- C77. Maintenance corrective **gratuite** : tout livrable cassé ou mal fait est corrigé sans facturation.
- C78. Nouveau besoin chiffré à la demande au même taux militant (200 €/j) ; **aucun abonnement obligatoire**, pas de rente.

## HORS périmètre — à ne PAS construire

- C79. GEME / BioMarx (gememarxengels.org) : intouché, hors périmètre ; page dédiée éventuelle plus tard, chiffrable à part.
- C80. Pas d'espace client / comptes clients (achat en invité seulement — périmètre discipliné).
- C81. Pas de multi-langue (IMPLEMENTATION-PROMPT).
- C82. Non réimplémentés (dette purgée) : Paybox 0.9.9.9, Legacy REST API (après traçage C58), Jetpack, PHP Compatibility Checker, WordPress Importer, doublons de formulaires (CF7/WPForms/Everest/File Upload Types) et de pop-ups — ~1/3 du parc rendu inutile, pas remplacé.
- C83. Résister au scope creep même quand « ce serait facile pendant qu'on y est » (IMPLEMENTATION-PROMPT).

## Questions ouvertes [À CONFIRMER] et prérequis client à tracer

- C84. [À CONFIRMER] Statut TVA du prestataire (art. 293 B CGI) — mention « à ajuster selon statut ».
- C85. [À CONFIRMER] Quoi dépend exactement de la Legacy REST API réactivée (export comptable Advanced Order Export suspect principal) — à tracer avant extinction.
- C86. [À CONFIRMER] Statut juridique de la structure fusionnée → choix Stripe direct vs HelloAsso (si association loi 1901 : 0 % de commission + reçus fiscaux automatiques).
- C87. [À confirmer au chantier] Pratique réelle d'achat en invité des 1 329 clients (pas d'espace client présumé).
- C88. [À ajuster si besoin] Modalités de paiement 50/50.
- C89. Prérequis client : paliers et contreparties 2026 (même provisoires) dès le jeudi 9 juillet — seule pièce manquante pour rendre le bouton « Contribuer » réel.
- C90. Prérequis client : mentions légales et infos éditeur (gabarit fourni par le prestataire) avant le vendredi 10 juillet.
- C91. Prérequis client : adresses réseaux sociaux, textes définitifs « qui on est », événements réels pour la page rencontres — sinon la page rencontres est **retirée au lancement**.
- C92. Prérequis client : identification côté compta de ce qui utilise l'export de commandes actuel (alimente le traçage C58/C85).
- C93. Prérequis client : création des comptes au nom de la structure — Stripe ou HelloAsso, GitHub, Vercel, Brevo le cas échéant.
- C94. À vérifier ensemble dans l'interface OVH : la ligne Email Pro facturée en double (22,87 €).
- C95. Temps client annoncé (à ne pas dépasser) : 2–3 h de recette, 1–2 h de contenus, ~1 h de prise en main du back-office.
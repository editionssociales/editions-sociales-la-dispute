# Décision finale — stack refonte Option B (arbitrage des 3 propositions)

*Juge de synthèse — 2026-07-09. Faits vérifiés ce jour : le repo est bien en **Next 16.2.9 / React 19.2.4** (`/Users/yourihamon/marina_es/site/package.json`) ; **Payload ≥ 3.73.0 supporte officiellement Next 16.2.x** (Next 15.5–16.1.x ne sera jamais supporté) ; **Neon Launch est purement à l'usage, sans minimum mensuel** (0,106 $/CU-h, 0,35 $/Go-mois, minimum de 5 $ supprimé déc. 2025) ; **Vercel Web Analytics Pro = 0,03 $/1 000 événements**. Les trois propositions convergent sur 4 composants sur 6 (Payload, Brevo, Sentry+Better Stack, et A+B sur Neon/Blob) — les divergences réelles sont C-vs-reste sur la souveraineté (base, stockage, analytics), tranchées ci-dessous sur les faits et le budget.*

---

## 1. Base PostgreSQL — **Neon Postgres via Vercel Marketplace (intégration Vercel-managed), région Frankfurt `eu-central-1`. Plan Free en juillet → Launch au plus tard à la mise en prod du catalogue sur Postgres.**

- **Coût** : 0 € en juillet, puis **~3–8 €/mois** (Launch, à l'usage, sans plancher — vérifié).
- **Rationale** : Postgres serverless avec pooler intégré et scale-to-zero, taillé pour Vercel, facturé sur la facture Vercel et transféré avec le projet — zéro compte supplémentaire. Le Scaleway DEV-S de C coûte ~12 €/mois, n'a pas de pooler serverless, et C reconnaît lui-même que Neon est « techniquement idéal pour Vercel » et tient la ligne « ~1 € » du devis §8.
- **Sauvegarde nocturne (arbitrage A vs B)** : **cron GitHub Actions** (choix A) — pas de route Vercel Cron : le binaire `pg_dump` n'existe pas dans une fonction Vercel et les limites de durée/taille rendent le choix B impraticable. `pg_dump` chiffré → Vercel Blob (§3), rétention 30 jours, **heartbeat Better Stack** (§6). Ce dump quotidien est aussi l'export de réversibilité du devis §9 et le filet contre Neon.
- **Changerait la décision** : exigence dure de souveraineté FR/UE exprimée par le client, ou dérive tarifaire Neon post-Databricks → **Scaleway Managed PostgreSQL DEV-S fr-par (~12 €/mois)**, migration = `pg_dump | pg_restore` (1 h, c'est tout l'intérêt du Postgres standard). Pas de drapeau client nécessaire : région UE + dumps quotidiens remis suffisent au niveau d'exigence RGPD documenté.

## 2. Back-office — **Payload CMS ≥ 3.73.0 (épinglé), open source MIT, installé DANS l'app Next existante** (unanime, décision ferme)

- **Palier exact** : `payload@^3.73`, adaptateurs `@payloadcms/db-postgres` (Neon) + `@payloadcms/storage-vercel-blob` (`clientUploads: true` — limite 4,5 Mo des fonctions Vercel), route group `app/(payload)/admin`, admin en français, rôles par access control. **Coût : 0 €/mois** (pas de Payload Cloud).
- **Rationale** : seul candidat qui tient à la fois le budget (0 €), le calendrier (démo 15/07 : collections calquées sur le contrat `book` du mu-plugin + import des 293 livres en 1,5–2 j) et la promesse « un seul objet à transférer » (le back-office vit dans le repo du client). La fenêtre de compatibilité est vérifiée : 3.73.0+ ⟷ Next 16.2.x, le repo est en 16.2.9.
- **Gates obligatoires J0** : `pnpm build` avec `withPayload` (issue Turbopack #14354, corrigée mais à tester) ; lire `node_modules/next/dist/docs/` avant tout code Next ; règle dans le repo : **monter Next et Payload en tandem, jamais l'un sans l'autre** ; migrations Drizzle disciplinées (pas de `push` en prod).
- **Changerait la décision** : rien ne le remplace dans l'enveloppe — si Payload casse dans les 2 premiers jours, **repli B (le bon)** : on retarde au lieu de remplacer, WordPress reste l'outil de saisie via l'adaptateur http existant, la démo du 15/07 montre schéma + import, le front ne bouge pas (principe n°2).

## 3. Stockage objet + CDN — **Vercel Blob, store créé en région `fra1`** (couvertures ~1 Go + PDFs + dumps nocturnes)

- **Coût** : **~1–2 €/mois** (0,023 $/Go-mois + 0,05 $/Go de transfert), en partie absorbé par le crédit d'usage Pro.
- **Rationale** : adaptateur Payload officiel, token injecté automatiquement, même facture, transféré avec le projet Vercel — le Scaleway S3 de C ajoute un compte, un dashboard et un test de compat S3 pour économiser ~1 €. La réversibilité reste réelle : fichiers plats derrière URLs HTTP, script de copie vers R2/S3 en ~1 h, originaux dans les exports OVH remis au client.
- **Changerait la décision** : explosion du transfert PDF (improbable : egress facturé se verrait sur la facture) → **Cloudflare R2** (egress 0 €) ou Scaleway Object Storage ; attention R2 : domaine custom = zone DNS chez Cloudflare, friction avec la règle MX intouchables.

## 4. Emails transactionnels — **Brevo, le MÊME compte que la newsletter** (unanime, décision ferme). Plan Free (300/jour) → Starter (~9 €) les mois de campagne.

- **Coût** : **0 €/mois** en régime courant (~117 commandes/mois + reçus de dons ≪ 300/jour) ; **~9–19 €** les mois d'envoi — ligne déjà écrite au devis §8.
- **Rationale** : la newsletter est déjà tranchée Brevo (2 848 abonnés) → un seul fournisseur, une seule config SPF/DKIM/DMARC, un seul dashboard pour l'équipe, société française (RGPD). Mise en œuvre : sous-domaine d'envoi dédié (ex. `mail.editionssociales.fr`) pour isoler la réputation transactionnelle — enregistrements TXT/CNAME **additifs uniquement, les MX Email Pro OVH ne sont jamais touchés**.
- **Point d'attention calendrier** : le jour du lancement de campagne (mi-août), les reçus de dons peuvent dépasser 300/jour → **activer Starter pour août AVANT le 15/08** (budgété).
- **Changerait la décision** : délivrabilité Brevo décevante sur le transactionnel (bounces surveillés via webhooks) → n'en migrer que les reçus/confirmations vers **Resend** (US) ou **Scaleway TEM** (FR), newsletter inchangée.

## 5. Analytics sans cookie — **Vercel Web Analytics par défaut** — **DRAPEAU DECISION CLIENT** sur l'option Plausible

- **Coût** : **~0–1 €/mois** (0,03 $/1 000 événements sur Pro — vérifié —, imputé au crédit d'usage inclus).
- **Rationale** : tient littéralement « statistiques sobres sans cookie » du devis pour ~0 €, sans script tiers ni compte de plus ; l'argument souveraineté de C est affaibli par le fait que **toute l'app est déjà chez Vercel** — l'analytics n'ajoute aucune exposition juridictionnelle nouvelle.
- **DECISION CLIENT (à poser à la démo du 15/07, non bloquant)** : si la maison d'édition veut un traitement analytics 100 % UE affichable, **Plausible Starter 9 €/mois** (UE, open source AGPL, export CSV). Le budget total le supporte (reste < 70 €). Activer Vercel WA dès maintenant (une ligne) ; un éventuel passage à Plausible plus tard coûte 10 minutes.
- **Changerait la décision** : exigence UE explicite du client → Plausible.

## 6. Erreurs + disponibilité — **Sentry Developer (RÉGION UE à la création, irréversible) + Better Stack Uptime Free** (unanime, décision ferme)

- **Coût** : **0 €/mois** les deux.
- **Palier exact** : Sentry Developer (5 000 erreurs/mois, 1 siège, rétention 30 j, `@sentry/nextjs` v10 supporte `^16.0.0`) — **choisir la résidence de données UE à la création de l'org, non modifiable ensuite**. Better Stack Free : 10 moniteurs (checks 3 min) sur `/`, `/catalogue`, `/boutique`, page dons **+ les 3 WordPress sources pendant la cohabitation** (apport de C, retenu) **+ heartbeat sur le cron de backup §1** (rend la promesse de sauvegarde du devis vérifiable).
- **Rationale** : couvre la ligne 3.5 du devis pour 0 € ; 1 siège Sentry = la réalité (un seul dev). UptimeRobot Free écarté (restreint au non-commercial depuis 2024).
- **Changerait la décision** : quota Sentry mangé par un bug en boucle (configurer `sampleRate` + alertes de quota) → Sentry Team 26 $/mois, ou GlitchTip (compatible SDK, migration indolore) ; durcissement du free Better Stack → UptimeRobot Solo.

---

## (1) Tableau final

| Composant | Choix | €/mois courant | €/mois campagne |
|---|---|---:|---:|
| Hébergement app *(acquis)* | Vercel Pro, 1 siège | ~20 | ~20 |
| Base PostgreSQL | Neon via Vercel Marketplace, Frankfurt (Free juil. → Launch) | ~3–8 | ~3–8 |
| Sauvegarde nocturne | GitHub Actions `pg_dump` → Blob + heartbeat | 0 | 0 |
| Back-office | Payload CMS ≥ 3.73 dans l'app (MIT) | 0 | 0 |
| Stockage + CDN | Vercel Blob `fra1` | ~1–2 | ~2 |
| Emails transactionnels + newsletter | Brevo Free → Starter les mois d'envoi | 0 | ~9–19 |
| Analytics sans cookie | Vercel Web Analytics *(option client : Plausible +9 €)* | ~0–1 | ~1 |
| Erreurs + dispo | Sentry Developer (UE) + Better Stack Free | 0 | 0 |
| OVH conservé | Domaines ×6 + Email Pro + slot Pro (GEME) ; slot « ladispi » résilié | ~15,6 | ~15,6 |
| **TOTAL tout compris** | | **~40–47 €** | **~51–66 €** |

**Vs promesse devis §8 (~40–70 €/mois) : tenue**, y compris avec l'option Plausible (+9 €) et les mois de campagne. Pendant le chantier de juillet (Neon Free) : ~37 €. Hors frais Stripe (~1,5 % + 0,25 €/transaction), comme au devis. Trois factures récurrentes seulement : Vercel (app + base + stockage + analytics), OVH (existant), Brevo (les mois d'envoi).

## (2) Comptes à créer / provisionner (propriété client, devis §9)

| Compte | Qui crée | Propriété / transfert |
|---|---|---|
| Vercel (team « solidz », projet existant) | Existe (Youri) | **Transfert de la team/projet au client à la recette** — emporte Neon, Blob, Analytics |
| Neon (Marketplace) | Youri, dans le projet Vercel | Suit le transfert Vercel ; dumps quotidiens remis en parallèle |
| GitHub `editions-sociales-la-dispute` | Existe (yourimerad) | Transférer au compte/org du client à la recette (ou ajouter le client owner) |
| Brevo | **Client** (email de la structure), Youri invité admin | Import des 2 848 abonnés ; SPF/DKIM/DMARC additifs dans la zone OVH — **MX intouchés** |
| Sentry | **Au nom de la structure**, Youri seul siège | **Région UE à la création (irréversible)** |
| Better Stack | **Au nom de la structure**, Youri invité | Transfert par changement de propriétaire |
| Stripe | **Existe et opérationnel** (vérifié API 11/07 : `acct_1TqsjgL6ffEZ7VRj` « Éditions sociales », charges + payouts activés, 0 pièce due) | Clé live déjà dans `site/.env` ; reste : `pk_live_…` + `whsec_…` (naît avec l'endpoint webhook) en env Vercel, clés test en dev/preview. ⚠️ La passerelle legacy réelle est **Paybox** (0 commande Stripe depuis 2018) — l'ancien compte test Woo `acct_1SQlxX…` est abandonné (nettoyage phase 7), le contrat Paybox se résilie après drainage (phases 4/7) |
| OVH | Existe (client) | Résilier le seul slot Performance « ladispi » (vide, PHP 7.3 EOL) ; **jamais** le slot Pro (GEME) ni les MX |

## (3) Risques résiduels de la stack retenue

1. **Couplage de versions Payload ⟷ Next 16.2.x** : fenêtre de support étroite, cadence Payload hebdomadaire, historique de bugs Turbopack (`withPayload` #14354, config RSC #15429). Mitigation : versions épinglées, `pnpm build` testé à la première heure du chantier, montées de version en tandem et délibérées ; repli indolore = WordPress reste la source via l'adaptateur http, la démo du 15/07 glisse sur schéma + import.
2. **Dérive Neon post-Databricks** (tarifs ou free tier des petits plans) et fournisseur US malgré la région Frankfurt. Mitigation : Postgres 100 % standard + dump nocturne surveillé par heartbeat → bascule Scaleway DEV-S en ~1 h si nécessaire (l'écart de ~7 €/mois tient dans l'enveloppe).
3. **Dépendance à trois paliers gratuits** (Sentry 5 k err/mois, Better Stack Free, Brevo 300/jour) : un bug en boucle, un durcissement de free tier ou le pic de reçus du jour de lancement peuvent forcer un passage payant. Mitigation : `sampleRate` + alertes de quota Sentry, Starter Brevo activé pour août avant le 15/08, et ~15–25 €/mois de marge dans l'enveloppe pour absorber n'importe lequel de ces passages.

Sources clés vérifiées : [Payload v3.73.0 release](https://github.com/payloadcms/payload/releases/tag/v3.73.0) · [Payload × Next 16 discussion #14330](https://github.com/payloadcms/payload/discussions/14330) · [compatibilité Payload/Next 16.2](https://www.buildwithmatija.com/blog/payload-cms-nextjs-16-compatibility-breakthrough) · [Neon pricing](https://neon.com/pricing) ([analyse 2026](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/)) · [Vercel Web Analytics pricing](https://vercel.com/docs/analytics/limits-and-pricing)
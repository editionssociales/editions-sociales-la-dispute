# REVERSIBILITE.md — Dossier de réversibilité

> Squelette du dossier de réversibilité prévu par `plan/07-cloture.md`
> (étape 10, livrable de la clôture). Ce document liste **ce qui doit y
> figurer** et **comment ça marche déjà aujourd'hui**, à partir du code réel
> de ce dépôt. Les sections dont le contenu ne peut exister qu'à l'extinction
> effective d'un WordPress ou au transfert réel des comptes sont marquées
> **« à compléter à l'extinction »** — ne pas les remplir par anticipation.
>
> Objet du dossier (devis §9) : *« aucun service ne vous enferme »*. Deux
> volets distincts, à ne pas mélanger : (A) sortir de la stack WordPress vers
> la stack neuve (déjà en cours, documenté ici) ; (B) sortir de la stack
> neuve elle-même si besoin un jour (Postgres standard, Blob = fichiers plats
> HTTP, Next = standard ouvert) — ce dossier couvre les deux.

## 1. Ce que contient l'archive remise au client

Contenu exact défini par `plan/07-cloture.md` (étapes 2–3, 5, 6, 8) — **à
compléter à l'extinction**, au fil des remises réelles :

| Pièce | Source | Statut |
|---|---|---|
| Dump SQL final du WordPress Boutique (`editionsk884`) | API OVH (dump) après gel et purge des commandes en attente | à compléter à l'extinction |
| CSV commandes (générées depuis le dump, mêmes colonnes que l'export compta historique) | dump `editionsk884` | à compléter à l'extinction |
| CSV clients | dump `editionsk884` | à compléter à l'extinction |
| CSV abonnés newsletter | dump `editionsk884` (`mod973_newsletter`) | à compléter à l'extinction |
| Dumps SQL finaux des WordPress catalogue (`editionskes`, `editionsk712`) | API OVH (dump) | à compléter à l'extinction |
| `wp-content/uploads` des 3 installs (images, PDF, dérivés) + thème `cenote_child` + mu-plugins | SFTP, pris **avant** tout détachement de domaine | à compléter à l'extinction |
| Manifeste `SHA256SUMS` + note de contenu | généré localement au moment de l'archive | à compléter à l'extinction |
| Sauvegardes nocturnes de la base Postgres neuve (Neon) — dernier état à date | store Vercel Blob privé, chiffré (voir §3) | **mécanisme déjà codé, provisioning restant** — `OPERATIONS.md` §5 |

Chaque pièce est remise **avant** toute extinction, avec une confirmation
écrite explicite du client (« archive reçue, ouverte, lisible, nombre de
lignes conforme ») — jamais l'inverse (principe absolu n°1 du plan directeur,
`plan/README.md`).

## 2. Procédure de restauration — WordPress (ancienne stack)

À compléter à l'extinction, mais la procédure elle-même est déjà connue et
n'a rien de spécifique à un hébergeur : n'importe quel hébergeur mutualisé
PHP + MySQL suffit.

1. Récupérer dans l'archive : le dump SQL du site concerné, l'archive
   `wp-content/uploads`, le thème `cenote_child`, les mu-plugins, et
   `wp-config.php` **expurgé des secrets** (à régénérer côté nouvel
   hébergeur).
2. Créer une base MySQL/MariaDB chez le nouvel hébergeur, y restaurer le
   dump (`mysql < dump.sql` ou import phpMyAdmin).
3. Déposer les fichiers WordPress + le thème + les mu-plugins, reconfigurer
   `wp-config.php` avec les identifiants de la nouvelle base.
4. Repointer le DNS du domaine concerné vers le nouvel hébergeur.

Pendant la fenêtre tampon (voir `plan/07-cloture.md`, étape 5 : 7 jours après
la mise hors ligne réversible, avant toute suppression), le retour en
arrière est plus rapide encore : fichiers et base restent intacts sur le
slot OVH d'origine, il suffit de recréer l'enregistrement DNS technique et de
rattacher de nouveau le domaine — retour en moins d'une heure, sans rien
restaurer depuis l'archive.

## 3. Procédure de sortie de la stack neuve

Contrairement à WordPress sur mutualisé, la stack neuve n'enferme rien de
propriétaire : Postgres est un standard, Vercel Blob n'est que des fichiers
plats servis en HTTP, et Next.js se déploie sur n'importe quel hébergeur
Node.

**Restaurer la base ailleurs** (procédure déjà documentée et exécutable dès
que le jalon S2 est opérationnel — voir `OPERATIONS.md` §5) :

```bash
age -d -i backup-identity.txt catalogue-AAAAMMJJ.dump.age > catalogue-AAAAMMJJ.dump
pg_restore --clean --no-owner -d "$URL_POSTGRES_CIBLE" catalogue-AAAAMMJJ.dump
```

N'importe quel Postgres managé (ou auto-hébergé) convient comme cible — rien
dans le schéma `payload` n'est spécifique à Neon.

**Copier les médias** : les fichiers du store Vercel Blob (couvertures, PDF)
sont accessibles par leur URL publique (store médias) ; un script de copie
HTTP simple (list + téléchargement) suffit à les rapatrier vers un autre
stockage objet. Le même mécanisme sert déjà à la copie additive vers le
store de sauvegarde privé (`OPERATIONS.md` §5, étape 4 du workflow).

**Déployer le Next.js ailleurs** : le dépôt ne dépend pas de fonctionnalités
propriétaires Vercel au point de bloquer un autre hébergeur Node compatible
Next.js (l'usage de `withPayload`/`withSentryConfig` reste standard) —
migration de l'ordre de l'heure, pas des jours.

## 4. Emplacement et rétention des sauvegardes nocturnes

Décrit en détail dans `OPERATIONS.md` §5 — résumé ici pour le dossier :
store Vercel Blob **privé** dédié (`es-ld-backups`, `fra1`), chiffrement age
par clé publique, rétention 30 sauvegardes quotidiennes + 12 mensuelles,
surveillance par heartbeat. **Statut au 17/07/2026** : le workflow
(`.github/workflows/backup-db.yml`) est **codé et présent dans ce dépôt**
(même changeset que ce document) — ce qui reste à faire est uniquement le
**provisioning humain/infra** : les secrets (store Blob, paire de clés age,
secrets GitHub Actions) **non posés**, prérequis avant toute exécution réelle
(détail : `OPERATIONS.md` §5). Tant que ce provisioning n'est pas fait, le
workflow livré ne peut pas tourner utilement — mais le code, lui, n'est plus
à écrire.

## 5. Inventaire des comptes — propriétaire et rôle

À compléter au transfert de propriété (protocole de référence :
`plan/07-cloture.md`, étape 9 ; calendrier : fin de la fenêtre de bascule
unique). Le tableau ci-dessous liste les comptes concernés et leur
destination cible — **à cocher** au fil du transfert réel, pas avant :

| Compte | Aujourd'hui | Cible | Statut |
|---|---|---|---|
| Dépôt GitHub | `yourimerad` (personnel, privé) | `editionssociales` | à compléter au transfert |
| Projet Vercel | team `solidz` (provisoire) | team `ldes`, facturation client | à compléter au transfert |
| Intégration Neon (Postgres) | rattachée à `solidz` | transférée séparément vers `ldes` (ne suit pas le transfert de projet) | à compléter au transfert |
| Store Vercel Blob (médias + sauvegardes) | rattachés à `solidz` | transférés séparément vers `ldes` | à compléter au transfert |
| Stripe (compte live) | au nom de la structure (déjà vérifié opérationnel) | inchangé — Youri invité, jamais l'inverse | à vérifier au transfert |
| Sentry (org UE) | créé par Youri (plan Developer, 1 seul siège) | transfert par changement d'email du compte | à compléter au transfert |
| Better Stack | à créer (S1b, à venir) | au nom de la structure dès la création | à compléter au transfert |
| Brevo | compte existant client (phase newsletter) | inchangé | à vérifier au transfert |

**Preuve de propriété exigée** (pas un test fonctionnel — un transfert de
projet Vercel copie les variables d'environnement, donc le site continue de
marcher même si Neon/Blob restent facturés ailleurs) : le client se connecte
lui-même à chaque compte cible et voit la ressource sous son nom, avec sa
facturation. Détail complet : `plan/07-cloture.md`, étape 9.

## 6. Sections à compléter à l'extinction effective

Les sections suivantes ne peuvent être écrites qu'après les gestes réels
décrits dans `plan/07-cloture.md` — elles sont volontairement laissées vides
ici :

- **Date et preuve de chaque extinction** (mise hors ligne réversible J, puis
  suppression fichiers/bases à J+7) — par WordPress (Boutique, ES, LD).
- **Accusé de réception écrit du client** pour chaque archive remise.
- **Résultat du test de restauration démontré** (comptages identiques,
  durée) — étape 7 du jalon S2.
- **PV de clôture signé** — critères d'acceptation cochés avec preuves,
  engagement post-signature (drop des bases à J+7) daté.
- **État final des redirections** (302 → 301, sur validation écrite) et
  échantillon de vérification.
- **Inventaire DNS final annoté** (« ne jamais toucher MX/SPF/DKIM/DMARC »).

Tant que ces sections ne sont pas remplies, ce document reste un **squelette
vrai mais incomplet** — c'est son état normal avant la clôture du 12/08.

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Refonte sobre de /souscription (maquette client, 2026-08-21) : le récit
 * (titre de l'ask, quatre sections narratives, descriptions des paliers de
 * jauge) devient éditable dans `page-souscription` — jusqu'ici figé dans
 * `souscription/page.tsx` (`src/payload/globals/PageSouscription.ts`).
 * Colonnes toutes NULLABLE (contrat « champ vide = texte actuel du site »,
 * `src/lib/site-content-core.ts:mergePageSouscription`) : aucune valeur
 * saisie tant que personne n'a ouvert l'admin. `contreparties` (et sa table
 * d'array) est inchangée — seul son onglet d'affichage bouge.
 *
 * Noms de colonnes : convention Payload/drizzle `{groupe}_{champ}` en
 * snake_case (constat sur les migrations précédentes, ex. `heros_titre`
 * pour le groupe `heros` de `page_a_propos`) ; les 3 champs de tête
 * (`titre`/`sousTitre`/`demande`) sont des champs de premier niveau, pas de
 * groupe (onglet « Titre » sans `name` = pas de préfixe de colonne).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_souscription"
    ADD COLUMN "titre" varchar,
    ADD COLUMN "sous_titre" varchar,
    ADD COLUMN "demande" varchar,
    ADD COLUMN "danger_titre" varchar,
    ADD COLUMN "danger_titre_italique" varchar,
    ADD COLUMN "danger_corps" jsonb,
    ADD COLUMN "guerre_titre" varchar,
    ADD COLUMN "guerre_titre_italique" varchar,
    ADD COLUMN "guerre_corps" jsonb,
    ADD COLUMN "maisons_titre" varchar,
    ADD COLUMN "maisons_titre_italique" varchar,
    ADD COLUMN "maisons_corps" jsonb,
    ADD COLUMN "appel_titre" varchar,
    ADD COLUMN "appel_titre_italique" varchar,
    ADD COLUMN "appel_corps" jsonb,
    ADD COLUMN "objectifs_descriptif50" varchar,
    ADD COLUMN "objectifs_descriptif80" varchar,
    ADD COLUMN "objectifs_descriptif100" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_souscription"
    DROP COLUMN IF EXISTS "titre",
    DROP COLUMN IF EXISTS "sous_titre",
    DROP COLUMN IF EXISTS "demande",
    DROP COLUMN IF EXISTS "danger_titre",
    DROP COLUMN IF EXISTS "danger_titre_italique",
    DROP COLUMN IF EXISTS "danger_corps",
    DROP COLUMN IF EXISTS "guerre_titre",
    DROP COLUMN IF EXISTS "guerre_titre_italique",
    DROP COLUMN IF EXISTS "guerre_corps",
    DROP COLUMN IF EXISTS "maisons_titre",
    DROP COLUMN IF EXISTS "maisons_titre_italique",
    DROP COLUMN IF EXISTS "maisons_corps",
    DROP COLUMN IF EXISTS "appel_titre",
    DROP COLUMN IF EXISTS "appel_titre_italique",
    DROP COLUMN IF EXISTS "appel_corps",
    DROP COLUMN IF EXISTS "objectifs_descriptif50",
    DROP COLUMN IF EXISTS "objectifs_descriptif80",
    DROP COLUMN IF EXISTS "objectifs_descriptif100";
  `)
}

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Mission B « éditeur de contenus » (retour client 2026-08-21 : accès aux
 * textes des pages de présentation des maisons). Trois volets dans une seule
 * migration :
 *
 * 1. Nettoyage des champs ORPHELINS de `page-a-propos` (onglets Héros /
 *    Citation / Sections) : plus lus par AUCUNE page depuis que `/a-propos`
 *    est une redirection sans contenu (`revalidate.ts:171-172`) — visibles et
 *    modifiables dans /admin sans aucun effet. Colonnes/table DROP.
 * 2. Nouveaux champs des pages maisons (`/editions/[slug]`) : équipe
 *    permanente + dépôt de manuscrit (partagés entre les deux pages, le JSX
 *    ne les indexait déjà par aucun slug) et bureau éditorial PAR maison (un
 *    array imbriqué sous `page_a_propos_maisons`, une ligne par personne).
 * 3. Nouveau global `page-contact` (titre + chapeau de la page /contact).
 *
 * `down` restaure les colonnes/tables Héros/Citation/Sections VIDES (aucune
 * saisie n'a jamais pu être perdue par CETTE migration : elles étaient déjà
 * orphelines avant elle, comme `footer_texte_diffusion`,
 * `20260817_120000_footer_sans_texte_diffusion.ts`) et supprime les ajouts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Champs orphelins de page-a-propos (Héros / Citation / Sections).
  ALTER TABLE "payload"."page_a_propos"
    DROP COLUMN IF EXISTS "heros_titre",
    DROP COLUMN IF EXISTS "heros_intro",
    DROP COLUMN IF EXISTS "citation_texte",
    DROP COLUMN IF EXISTS "citation_attribution";
  DROP TABLE IF EXISTS "payload"."page_a_propos_sections" CASCADE;

  -- 2a. Équipe permanente + dépôt de manuscrit (partagés, cf. commentaire ci-dessus).
  ALTER TABLE "payload"."page_a_propos"
    ADD COLUMN "equipe_permanente" varchar,
    ADD COLUMN "depot_manuscrit_email" varchar,
    ADD COLUMN "depot_manuscrit_texte" jsonb;

  -- 2b. Bureau éditorial — array imbriqué sous chaque ligne de "maisons"
  -- (parent varchar : même convention que "page_souscription_contreparties_items"
  -- sous "page_souscription_contreparties", elle aussi un array sous array).
  CREATE TABLE "payload"."page_a_propos_maisons_bureau" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nom" varchar NOT NULL
  );
  ALTER TABLE "payload"."page_a_propos_maisons_bureau" ADD CONSTRAINT "page_a_propos_maisons_bureau_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_a_propos_maisons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_a_propos_maisons_bureau_order_idx" ON "payload"."page_a_propos_maisons_bureau" USING btree ("_order");
  CREATE INDEX "page_a_propos_maisons_bureau_parent_id_idx" ON "payload"."page_a_propos_maisons_bureau" USING btree ("_parent_id");

  -- 3. Page /contact.
  CREATE TABLE "payload"."page_contact" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"intro" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."page_contact" CASCADE;

  DROP TABLE IF EXISTS "payload"."page_a_propos_maisons_bureau" CASCADE;

  ALTER TABLE "payload"."page_a_propos"
    DROP COLUMN IF EXISTS "equipe_permanente",
    DROP COLUMN IF EXISTS "depot_manuscrit_email",
    DROP COLUMN IF EXISTS "depot_manuscrit_texte";

  ALTER TABLE "payload"."page_a_propos"
    ADD COLUMN "heros_titre" varchar,
    ADD COLUMN "heros_intro" varchar,
    ADD COLUMN "citation_texte" varchar,
    ADD COLUMN "citation_attribution" varchar;

  CREATE TABLE "payload"."page_a_propos_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"contenu" jsonb
  );
  ALTER TABLE "payload"."page_a_propos_sections" ADD CONSTRAINT "page_a_propos_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_a_propos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_a_propos_sections_order_idx" ON "payload"."page_a_propos_sections" USING btree ("_order");
  CREATE INDEX "page_a_propos_sections_parent_id_idx" ON "payload"."page_a_propos_sections" USING btree ("_parent_id");
  `)
}

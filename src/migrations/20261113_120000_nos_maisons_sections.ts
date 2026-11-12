import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Page /nos-maisons en SECTIONS LIBRES (client 2026-11, `PageNosMaisons.ts` :
 * champ `sections` de type blocs) — une table par type de bloc, une table par
 * tableau imbriqué (vidéos, articles). Convention Payload pour un global :
 * `page_nos_maisons_blocks_<bloc>` (`_order`, `_parent_id` → le global,
 * `_path`, `id`, `block_name` + champs), tableaux imbriqués
 * `…_blocks_<bloc>_<tableau>` (`_parent_id` → l'`id` varchar du bloc).
 *
 * REPRISE de l'existant : le contenu déjà saisi (texte, vidéos, articles avec
 * images, titres de section, cartes des deux maisons — toujours affichées
 * jusque-là) est converti en sections, dans l'ordre d'affichage d'avant ;
 * sans ligne de global (jamais enregistré), rien à convertir. Les anciennes
 * tables/colonnes (`page_nos_maisons_videos`, `…_articles`, `texte`,
 * `titre_*`) restent en base, INUTILISÉES : un `down` qui les perdrait serait
 * pire que quelques tables mortes — on les retirera dans une migration à part.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "payload"."enum_page_nos_maisons_blocks_mise_en_avant_couleur" AS ENUM('jaune', 'rose', 'bleu', 'orange');

  CREATE TABLE "payload"."page_nos_maisons_blocks_texte" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"contenu" varchar NOT NULL,
  	"block_name" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_carrousel_videos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"block_name" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_carrousel_videos_videos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"media" varchar,
  	"date" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_carrousel_articles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"block_name" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_carrousel_articles_articles" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"media" varchar,
  	"date" varchar,
  	"image_id" integer
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_mise_en_avant" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"texte" varchar,
  	"lien_libelle" varchar,
  	"lien_url" varchar,
  	"couleur" "payload"."enum_page_nos_maisons_blocks_mise_en_avant_couleur" DEFAULT 'jaune',
  	"block_name" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_citation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texte" varchar NOT NULL,
  	"auteur" varchar,
  	"source" varchar,
  	"block_name" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_blocks_maisons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"block_name" varchar
  );
  `)

  // Clés étrangères + index (même gabarit pour chaque table de bloc).
  for (const bloc of [
    'texte',
    'carrousel_videos',
    'carrousel_articles',
    'mise_en_avant',
    'citation',
    'maisons',
  ]) {
    const t = `page_nos_maisons_blocks_${bloc}`
    await db.execute(sql.raw(`
    ALTER TABLE "payload"."${t}" ADD CONSTRAINT "${t}_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_nos_maisons"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "${t}_order_idx" ON "payload"."${t}" USING btree ("_order");
    CREATE INDEX "${t}_parent_id_idx" ON "payload"."${t}" USING btree ("_parent_id");
    CREATE INDEX "${t}_path_idx" ON "payload"."${t}" USING btree ("_path");
    `))
  }
  await db.execute(sql`
  ALTER TABLE "payload"."page_nos_maisons_blocks_carrousel_videos_videos" ADD CONSTRAINT "page_nos_maisons_blocks_carrousel_videos_videos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_nos_maisons_blocks_carrousel_videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_nos_maisons_blocks_carrousel_videos_videos_order_idx" ON "payload"."page_nos_maisons_blocks_carrousel_videos_videos" USING btree ("_order");
  CREATE INDEX "page_nos_maisons_blocks_carrousel_videos_videos_parent_id_idx" ON "payload"."page_nos_maisons_blocks_carrousel_videos_videos" USING btree ("_parent_id");

  ALTER TABLE "payload"."page_nos_maisons_blocks_carrousel_articles_articles" ADD CONSTRAINT "page_nos_maisons_blocks_carrousel_articles_articles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_nos_maisons_blocks_carrousel_articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_nos_maisons_blocks_carrousel_articles_articles" ADD CONSTRAINT "page_nos_maisons_blocks_carrousel_articles_articles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "page_nos_maisons_blocks_carrousel_articles_articles_order_idx" ON "payload"."page_nos_maisons_blocks_carrousel_articles_articles" USING btree ("_order");
  CREATE INDEX "page_nos_maisons_blocks_carrousel_articles_articles_parent_id_idx" ON "payload"."page_nos_maisons_blocks_carrousel_articles_articles" USING btree ("_parent_id");
  CREATE INDEX "page_nos_maisons_blocks_carrousel_articles_articles_image_idx" ON "payload"."page_nos_maisons_blocks_carrousel_articles_articles" USING btree ("image_id");
  `)

  // ---- Reprise du contenu existant (l'ordre d'affichage d'avant : texte,
  // vidéos, articles, cartes maisons). Un identifiant de bloc = n'importe quel
  // varchar unique.
  await db.execute(sql`
  DO $$
  DECLARE
    g integer;
    ordre integer := 0;
    bloc text;
    row_texte varchar;
    row_titre_videos varchar;
    row_titre_articles varchar;
    row_titre_maisons varchar;
  BEGIN
    SELECT id, texte, titre_videos, titre_articles, titre_maisons
      INTO g, row_texte, row_titre_videos, row_titre_articles, row_titre_maisons
      FROM "payload"."page_nos_maisons" ORDER BY id LIMIT 1;
    IF g IS NULL THEN RETURN; END IF;

    IF row_texte IS NOT NULL AND btrim(row_texte) <> '' THEN
      INSERT INTO "payload"."page_nos_maisons_blocks_texte" ("_order", "_parent_id", "_path", "id", "contenu")
      VALUES (ordre, g, 'sections', gen_random_uuid()::text, row_texte);
      ordre := ordre + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM "payload"."page_nos_maisons_videos" WHERE "_parent_id" = g) THEN
      bloc := gen_random_uuid()::text;
      INSERT INTO "payload"."page_nos_maisons_blocks_carrousel_videos" ("_order", "_parent_id", "_path", "id", "titre")
      VALUES (ordre, g, 'sections', bloc, NULLIF(btrim(row_titre_videos), ''));
      INSERT INTO "payload"."page_nos_maisons_blocks_carrousel_videos_videos" ("_order", "_parent_id", "id", "titre", "url", "media", "date")
      SELECT "_order", bloc, gen_random_uuid()::text, "titre", "url", "media", "date"
        FROM "payload"."page_nos_maisons_videos" WHERE "_parent_id" = g;
      ordre := ordre + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM "payload"."page_nos_maisons_articles" WHERE "_parent_id" = g) THEN
      bloc := gen_random_uuid()::text;
      INSERT INTO "payload"."page_nos_maisons_blocks_carrousel_articles" ("_order", "_parent_id", "_path", "id", "titre")
      VALUES (ordre, g, 'sections', bloc, NULLIF(btrim(row_titre_articles), ''));
      INSERT INTO "payload"."page_nos_maisons_blocks_carrousel_articles_articles" ("_order", "_parent_id", "id", "titre", "url", "media", "date", "image_id")
      SELECT "_order", bloc, gen_random_uuid()::text, "titre", "url", "media", "date", "image_id"
        FROM "payload"."page_nos_maisons_articles" WHERE "_parent_id" = g;
      ordre := ordre + 1;
    END IF;

    -- Les cartes des deux maisons étaient toujours affichées : on les garde.
    INSERT INTO "payload"."page_nos_maisons_blocks_maisons" ("_order", "_parent_id", "_path", "id", "titre")
    VALUES (ordre, g, 'sections', gen_random_uuid()::text, NULLIF(btrim(row_titre_maisons), ''));
  END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_carrousel_videos_videos" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_carrousel_articles_articles" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_texte" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_carrousel_videos" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_carrousel_articles" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_mise_en_avant" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_citation" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_blocks_maisons" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_page_nos_maisons_blocks_mise_en_avant_couleur";
  `)
}

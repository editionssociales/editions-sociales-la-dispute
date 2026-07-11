import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Unicité de slug couvrant l'espace `edition` ∪ null (contrat d'interface
// phase 4) : l'index composite unique `(edition, slug)` laisse passer des
// doublons de slug quand `edition IS NULL` (les NULL sont distincts en
// Postgres). Ce complément partiel n'est pas exprimable via l'API `indexes`
// de Payload (pas de clause WHERE) — d'où cette migration manuelle.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "books_slug_unique_sans_edition_idx"
    ON "payload"."books" USING btree ("slug")
    WHERE "edition" IS NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."books_slug_unique_sans_edition_idx";
  `)
}

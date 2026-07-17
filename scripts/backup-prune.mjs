#!/usr/bin/env node
/**
 * Purge de rétention des sauvegardes chiffrées (plan/06-operations.md,
 * jalon S2, étape 6 point 6) — appelé en dernière étape utile de
 * `.github/workflows/backup-db.yml`, APRÈS l'upload du dump du jour.
 *
 * Règle de rétention (Q6 du plan, défaut retenu) : garde les **30** plus
 * récentes sauvegardes sous `backups/daily/` et les **12** plus récentes sous
 * `backups/monthly/`, chaque préfixe compté indépendamment (les copies
 * mensuelles ne "consomment" jamais le quota quotidien). **Ne touche
 * JAMAIS** `media/…` (copie additive des médias, étape 6 point 5) : une
 * suppression accidentelle côté médias ne doit jamais se propager depuis la
 * sauvegarde — ni aucun autre pathname non reconnu (défensif : on ne purge
 * que ce qu'on sait dater).
 *
 * Usage :
 *   BLOB_BACKUP_RW_TOKEN=… node scripts/backup-prune.mjs
 *
 * Variables d'environnement :
 *   BLOB_BACKUP_RW_TOKEN  (requis) — token RW du store Vercel Blob PRIVÉ
 *                          dédié aux sauvegardes (`es-ld-backups`, région
 *                          `fra1` — jamais le store médias public).
 *
 * Échoue proprement (message clair, `process.exitCode = 1`, aucune requête
 * réseau) si le token est absent — ce script ne tourne qu'en CI
 * (`backup-db.yml`), jamais dans l'app.
 */
import { del, list } from "@vercel/blob";

const DAILY_RETENTION = 30;
const MONTHLY_RETENTION = 12;

const BACKUP_PATHNAME_RE =
  /^backups\/(daily|monthly)\/catalogue-(\d{4})(\d{2})(\d{2})\.dump\.age$/;

/**
 * Reconnaît un pathname de sauvegarde daté (`backups/<kind>/catalogue-
 * YYYYMMDD.dump.age`) et en extrait le préfixe + la date (`YYYY-MM-DD`,
 * triable lexicographiquement). `null` pour tout pathname hors de ce
 * gabarit (dont `media/…`) — jamais candidat à la purge. Pur, sans I/O.
 */
export function parseBackupPathname(pathname) {
  const m = BACKUP_PATHNAME_RE.exec(pathname);
  if (!m) return null;
  const [, kind, y, mo, d] = m;
  return { kind, date: `${y}-${mo}-${d}` };
}

/**
 * Détermine les pathnames à supprimer parmi une liste de blobs du store —
 * pur, testé sans réseau. `dailyRetention`/`monthlyRetention` overridables
 * pour les tests, défauts = la règle du plan (30 + 12).
 */
export function selectPathnamesToDelete(
  pathnames,
  { dailyRetention = DAILY_RETENTION, monthlyRetention = MONTHLY_RETENTION } = {},
) {
  const daily = [];
  const monthly = [];
  for (const pathname of pathnames) {
    const parsed = parseBackupPathname(pathname);
    if (!parsed) continue; // media/… et tout pathname non reconnu : jamais purgés
    (parsed.kind === "daily" ? daily : monthly).push({ pathname, date: parsed.date });
  }
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  daily.sort(byDateDesc);
  monthly.sort(byDateDesc);
  return [
    ...daily.slice(dailyRetention).map((e) => e.pathname),
    ...monthly.slice(monthlyRetention).map((e) => e.pathname),
  ];
}

/** Liste l'intégralité des blobs d'un préfixe (pagination par `cursor`). */
async function listAll(prefix, token) {
  const pathnames = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, token, limit: 1000 });
    pathnames.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return pathnames;
}

async function main() {
  const token = process.env.BLOB_BACKUP_RW_TOKEN;
  if (!token) {
    console.error(
      "[backup-prune] BLOB_BACKUP_RW_TOKEN absent — purge annulée (provisioning humain requis, cf. plan/06-operations.md P7).",
    );
    process.exitCode = 1;
    return;
  }

  const pathnames = await listAll("backups/", token);
  const toDelete = selectPathnamesToDelete(pathnames);

  if (toDelete.length === 0) {
    console.log(`[backup-prune] rien à purger (${pathnames.length} sauvegarde(s) sous rétention).`);
    return;
  }

  await del(toDelete, { token });
  console.log(`[backup-prune] ${toDelete.length} sauvegarde(s) purgée(s) :`);
  for (const pathname of toDelete) console.log(`  - ${pathname}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[backup-prune] échec :", err);
    process.exitCode = 1;
  });
}

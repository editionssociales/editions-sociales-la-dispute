import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { SourceKey } from "./types";

/**
 * Couche d'accès aux bases OVH existantes.
 *
 * Le site *réutilise directement* les bases MySQL des sites WordPress
 * historiques (aucune duplication) :
 *   - `es`       → catalogue Éditions sociales (base `editionskes`, préfixe `es_`)
 *   - `ld`       → catalogue La Dispute        (base `editionsk712`, préfixe `es_`)
 *   - `boutique` → boutique WooCommerce         (base `editionsk884`, préfixe `mod973_`)
 *
 * En développement, ces trois bases sont chargées dans une MariaDB locale
 * (voir `.env.local`). En production, on pointe vers les hôtes OVH
 * (`*.mysql.db`) via les mêmes variables d'environnement.
 */

interface SourceConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  prefix: string;
}

const DEFAULTS: Record<SourceKey, { database: string; prefix: string }> = {
  es: { database: "editionskes", prefix: "es_" },
  ld: { database: "editionsk712", prefix: "es_" },
  boutique: { database: "editionsk884", prefix: "mod973_" },
};

const ENV_PREFIX: Record<SourceKey, string> = {
  es: "CATALOG_ES",
  ld: "CATALOG_LD",
  boutique: "CATALOG_BOUTIQUE",
};

function config(source: SourceKey): SourceConfig {
  const base = ENV_PREFIX[source];
  const get = (key: string, fallback: string) =>
    process.env[`${base}_${key}`] ?? fallback;
  return {
    host: get("HOST", "127.0.0.1"),
    port: Number(get("PORT", "3307")),
    user: get("USER", "root"),
    password: get("PASSWORD", ""),
    database: get("DATABASE", DEFAULTS[source].database),
    prefix: get("PREFIX", DEFAULTS[source].prefix),
  };
}

// Cache des pools sur globalThis pour survivre au HMR en développement.
const globalForPools = globalThis as unknown as {
  __esPools?: Map<SourceKey, Pool>;
};
const pools = (globalForPools.__esPools ??= new Map<SourceKey, Pool>());

export function pool(source: SourceKey): Pool {
  let existing = pools.get(source);
  if (!existing) {
    const c = config(source);
    existing = mysql.createPool({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      connectionLimit: 5,
      charset: "utf8mb4",
      dateStrings: true,
    });
    pools.set(source, existing);
  }
  return existing;
}

/** Préfixe de table WordPress/WooCommerce d'une source. */
export function prefix(source: SourceKey): string {
  return config(source).prefix;
}

/** Exécute une requête et renvoie les lignes typées. */
export async function q<T = RowDataPacket>(
  source: SourceKey,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const [rows] = await pool(source).query(sql, params);
  return rows as T[];
}

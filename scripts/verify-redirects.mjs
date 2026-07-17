#!/usr/bin/env node
/**
 * E4 du plan (`plan/02-mise-en-production.md`) — vérification exhaustive de la
 * table de redirections de `next.config.ts`.
 *
 * ⚠️ INTERDICTION d'utiliser `fetch()` : le `fetch` de Node (undici) supprime
 * silencieusement un en-tête `Host` custom (vérifié empiriquement — un
 * serveur local reçoit son host TCP réel malgré `headers: { Host: … }`).
 * Toutes les règles gâtées par `has:{type:"host"}` échoueraient en silence et
 * les cas négatifs passeraient par vacuité. Ce script utilise exclusivement
 * `node:http`/`node:https` (`.request`, qui transmet le `Host` demandé —
 * vérifié ce jour ; `curl -H "Host: …"` marche aussi et sert de contre-vérif
 * manuelle).
 *
 * Deux garde-fous exécutés AVANT toute vérification de règle :
 *   1. Self-test Host : un `http.createServer` éphémère reçoit une requête de
 *      ce même script avec un `Host` custom — échec bloquant si le serveur ne
 *      voit pas ce Host exact (prouve que la méthode de requête choisie
 *      transmet bien le Host, avant de s'en servir pour juger quoi que ce soit).
 *   2. Compilation des sources : `redirects()` est importé directement depuis
 *      `next.config.ts` (Node ≥ 22 strippe les types nativement, testé) et
 *      chaque `source` est passé à `pathToRegexp`
 *      (`next/dist/compiled/path-to-regexp`) — attrape toute syntaxe invalide
 *      (accolades `{}` notamment) avant que `pnpm build` ne la découvre, plus tard.
 *
 * Puis, pour chaque ligne de `scripts/redirect-inventory.csv` : requête avec
 * suivi manuel des `Location` (3 sauts max), assertions statut + `Location`.
 * Cas négatifs obligatoires (host `editionssociales.fr`) : `/catalogue/
 * editions-sociales`, `/catalogue/la-dispute` ne doivent PAS rediriger ;
 * `/a-propos`, `/`, `/souscription` doivent servir 200. Host boutique : `/panier`
 * ne doit PAS rediriger (sur LUI-MÊME — `next.config.ts` n'a délibérément
 * aucune règle `/panier`, la page native est déjà servie telle quelle sur ce
 * host ; une règle source===destination y bouclerait à l'infini, cf. le
 * commentaire de `next.config.ts`).
 *
 * Host boutique — mode dry/local (nouveau, plan/07-cloture.md étape 4, P7) :
 * contrairement à `editionssociales.fr`/`ladispute.fr` (dont l'inventaire (a)
 * MariaDB + (b) REST live sont requis), les lignes du host
 * `boutique.editionssociales.fr`/`www.boutique.editionssociales.fr` de
 * `redirect-inventory.csv` viennent d'une lecture PURE de l'artefact déjà
 * versionné `src/lib/redirects-produits.json` (cf. `build-redirect-inventory.mjs`
 * §(d)) — aucun réseau, aucune base. Sur un poste sans MariaDB locale (ni les
 * dumps SQL, cf. LEGACY-STACK.md), `node scripts/build-redirect-inventory.mjs`
 * dégrade proprement (`Promise.allSettled`) et écrit quand même l'inventaire
 * boutique seul ; `--host-filter boutique.editionssociales.fr` permet alors de
 * vérifier CE host isolément contre un `pnpm dev`/`pnpm start` local, sans rien
 * d'autre à provisionner.
 *
 * Usage :
 *   node scripts/verify-redirects.mjs --self-test-only
 *   node scripts/verify-redirects.mjs --target http://localhost:3000
 *   node scripts/verify-redirects.mjs --target https://editions-sociales-la-dispute.vercel.app [--insecure]
 *   node scripts/verify-redirects.mjs --target https://editionssociales.fr --host-filter editionssociales.fr
 *   # Host boutique, mode dry/local (aucune MariaDB requise) :
 *   node scripts/build-redirect-inventory.mjs   # écrit au moins la partie boutique, même sans MariaDB
 *   node scripts/verify-redirects.mjs --target http://localhost:3000 --host-filter boutique.editionssociales.fr
 *
 * `--host-filter <host>` : ne vérifie que les lignes de l'inventaire (et les
 * cas négatifs obligatoires) pour ce host — utilisé le jour du flip DNS en
 * mode direct (plus de spoof de `Host`, un seul domaine est réellement servi
 * par `target` à la fois).
 *
 * `--redirects-produits-since <ISO-date>` (optionnel) : garde-fou LÉGER,
 * exécuté avant toute requête réseau (donc actif même en
 * `--self-test-only`) — avertit (n'échoue JAMAIS) si `src/lib/redirects-
 * produits.json` a été bootstrapé hors Local API Payload (champ `source`) ou
 * si son `generatedAt` est antérieur à la date fournie. Ex., pour vérifier
 * que l'artefact a été régénéré après le cadrage J-7 :
 *   node scripts/verify-redirects.mjs --self-test-only --redirects-produits-since 2026-07-24
 */
import http from "node:http";
import { parseArgs } from "node:util";
import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ───────────────────────────── CLI ───────────────────────────── */

function parseCliArgs(argv) {
  let values;
  try {
    // `node:util` gère déjà `--flag valeur` ET `--flag=valeur`, le strict par
    // défaut rejette tout argument inconnu — plus rien à écrire à la main.
    ({ values } = parseArgs({
      args: argv,
      options: {
        target: { type: "string" },
        inventory: { type: "string", default: path.join(ROOT, "scripts/redirect-inventory.csv") },
        "self-test-only": { type: "boolean", default: false },
        insecure: { type: "boolean", default: false },
        "host-filter": { type: "string" },
        "redirects-produits-since": { type: "string" },
      },
    }));
  } catch (err) {
    throw new Error(`[verify-redirects] ${err.message}`);
  }
  return {
    target: values.target ?? null,
    selfTestOnly: values["self-test-only"],
    inventory: values.inventory,
    insecure: values.insecure,
    hostFilter: values["host-filter"] ?? null,
    redirectsProduitsSince: values["redirects-produits-since"] ?? null,
  };
}

/* ───────────────────────── Garde-fou 1 : self-test Host ───────────────────────── */

/**
 * Démarre un serveur éphémère, s'envoie une requête avec un `Host` custom par
 * son propre client (`http.request`), et vérifie que le serveur voit ce Host
 * **exact**. Bloquant : le script ne peut pas « réussir » sans prouver que sa
 * méthode de requête transmet bien le Host demandé.
 */
async function selfTestHost() {
  const EXPECTED_HOST = "editionssociales.fr";
  const seenHost = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.end("ok");
      resolve(req.headers.host);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const req = http.request(
        { host: "127.0.0.1", port, path: "/", method: "GET", headers: { Host: EXPECTED_HOST } },
        (res) => {
          res.resume();
          res.on("end", () => server.close());
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
  if (seenHost !== EXPECTED_HOST) {
    throw new Error(
      `[self-test Host] ÉCHEC BLOQUANT : le serveur a vu Host="${seenHost}" au lieu de "${EXPECTED_HOST}". ` +
        `La méthode de requête ne transmet pas le Host custom — tout le reste de ce script serait une vérification ` +
        `par vacuité (cf. le piège documenté de fetch()/undici). Corriger avant de continuer.`,
    );
  }
  console.error(`[self-test Host] OK — Host="${EXPECTED_HOST}" transmis et vu tel quel.`);
}

/* ───────────────────── Garde-fou 2 : compilation des sources ───────────────────── */

/**
 * Importe `redirects()` de `next.config.ts` et vérifie que chaque `source`
 * compile avec le path-to-regexp embarqué de Next — attrape toute syntaxe
 * invalide (accolades `{}` notamment, « Unexpected MODIFIER ») avant le build.
 */
async function compileSources() {
  const configUrl = new URL("../next.config.ts", import.meta.url);
  let redirects;
  try {
    const mod = await import(configUrl.href);
    redirects = mod.default?.redirects;
  } catch (err) {
    throw new Error(`[compilation] import de next.config.ts en échec : ${err instanceof Error ? err.message : err}`);
  }
  if (typeof redirects !== "function") {
    throw new Error(`[compilation] next.config.ts n'expose pas de fonction "redirects" (export default).`);
  }
  const rules = await redirects();
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error(
      `[compilation] redirects() n'a renvoyé aucune règle — inattendu (E4 en attend ~33 pour ES/LD, ` +
        `+ 2 × (1 par entrée de la table produit + 7 règles nommées) pour le host boutique, P7).`,
    );
  }

  const { pathToRegexp } = (await import("next/dist/compiled/path-to-regexp/index.js")).default;
  const failures = [];
  for (const rule of rules) {
    try {
      pathToRegexp(rule.source);
    } catch (err) {
      failures.push({ source: rule.source, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failures.length > 0) {
    const detail = failures.map((f) => `  - "${f.source}" → ${f.error}`).join("\n");
    throw new Error(`[compilation] ${failures.length} source(s) invalide(s) :\n${detail}`);
  }
  console.error(`[compilation] OK — ${rules.length} règle(s) compilent (path-to-regexp).`);
  return rules;
}

/* ───────────────────── Garde-fou léger : fraîcheur de redirects-produits.json ───────────────────── */

const PRODUCT_REDIRECTS_FILE = path.join(ROOT, "src/lib/redirects-produits.json");

/**
 * Garde-fou LÉGER (avertissement, jamais un échec) sur `src/lib/redirects-
 * produits.json` : cet artefact a été bootstrapé une première fois hors Local
 * API Payload (mode dégradé WP REST + Store API live, cf. son propre champ
 * `source`) et DOIT être régénéré avec `scripts/build-product-redirects.ts`
 * (`pnpm payload run`, Local API Payload) avant J-7 (P7 du plan) — un oubli
 * laisserait le host boutique se fier à un instantané pris hors Payload sans
 * qu'aucune vérification ne le signale. Ne fait jamais échouer ce script (pas
 * de nouvelle porte CI) : juste un avertissement lisible dans le run recette
 * habituel.
 */
async function checkRedirectsProduitsFreshness(sinceIso) {
  let raw;
  try {
    raw = await readFile(PRODUCT_REDIRECTS_FILE, "utf8");
  } catch {
    console.error(
      `[garde redirects-produits] "${PRODUCT_REDIRECTS_FILE}" introuvable — vérification de fraîcheur ignorée.`,
    );
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(
      `[garde redirects-produits] AVERTISSEMENT : JSON illisible (${err instanceof Error ? err.message : err}) — vérification de fraîcheur ignorée.`,
    );
    return;
  }

  const warnings = [];

  // Le VRAI générateur (`build-product-redirects.ts`, ligne "source: …") écrit
  // toujours exactement `"scripts/build-product-redirects.ts (Local API
  // Payload + Store API live)"` — un `startsWith` (pas un simple `.includes`)
  // est nécessaire : le bootstrap initial écrit un texte libre qui MENTIONNE
  // aussi "Local API Payload" mais pour dire explicitement qu'il ne vient PAS
  // d'elle ("… PAS la Local API Payload (DATABASE_URL absente…)") — un simple
  // `.includes("Local API Payload")` aurait raté cet avertissement.
  const isFromPayloadGenerator =
    typeof data.source === "string" &&
    data.source.startsWith("scripts/build-product-redirects.ts") &&
    data.source.includes("Local API Payload");
  if (!isFromPayloadGenerator) {
    warnings.push(
      `le champ "source" n'indique pas un run de scripts/build-product-redirects.ts via la Local API Payload (valeur actuelle : ${
        typeof data.source === "string" ? `"${data.source}"` : "absente"
      }) — probablement encore le bootstrap WP REST/Store API live ; régénérer avec ` +
        `"pnpm payload run scripts/build-product-redirects.ts" avant J-7 (P7 du plan).`,
    );
  }

  if (sinceIso) {
    const since = new Date(sinceIso);
    const generatedAt = new Date(data.generatedAt);
    if (Number.isNaN(since.getTime())) {
      warnings.push(`--redirects-produits-since="${sinceIso}" n'est pas une date valide — comparaison ignorée.`);
    } else if (Number.isNaN(generatedAt.getTime())) {
      warnings.push(`le champ "generatedAt" ("${data.generatedAt}") n'est pas une date valide — comparaison ignorée.`);
    } else if (generatedAt < since) {
      warnings.push(
        `"generatedAt" (${data.generatedAt}) est antérieur à la date de fraîcheur attendue (${sinceIso}) — à régénérer avant J-7.`,
      );
    }
  }

  if (warnings.length > 0) {
    console.error(
      `[garde redirects-produits] AVERTISSEMENT (non bloquant) :\n${warnings.map((w) => `  - ${w}`).join("\n")}`,
    );
  } else {
    console.error(
      `[garde redirects-produits] OK — source Local API Payload${sinceIso ? `, generatedAt ≥ ${sinceIso}` : ""}.`,
    );
  }
}

/* ───────────────────────── requête HTTP manuelle (pas de fetch) ───────────────────────── */

function requestOnce(target, hostHeader, urlPath, insecure) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(target);
    const isHttps = targetUrl.protocol === "https:";
    const client = isHttps ? https : http;
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: urlPath,
      method: "GET",
      // SNI/connexion TCP restent sur le host réel de `target` (le certificat
      // vercel.app reste valide) ; seul l'en-tête HTTP Host est spoofé.
      headers: { Host: hostHeader, Accept: "text/html" },
      ...(isHttps ? { rejectUnauthorized: !insecure } : {}),
    };
    const req = client.request(options, (res) => {
      res.resume(); // on ne lit pas le corps, seuls statut + Location comptent
      res.on("end", () => {
        resolve({ status: res.statusCode, location: res.headers.location ?? null });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Suit manuellement les `Location` (3 sauts max), mais s'arrête au premier
 * saut qui EST la redirection testée — qu'elle soit absolue (cas LD :
 * cross-domaine vers `editionssociales.fr`) ou relative (cas ES très
 * majoritaire : `/catalogue/:slug`, `/auteur/:slug`, etc. redirigent vers un
 * chemin relatif du même host, ex. `/catalogue-collection` →
 * `/catalogue/editions-sociales`). Suivre un `Location` relatif générique
 * ferait poursuivre vers CETTE destination (un 2ᵉ saut hors de portée du CSV,
 * potentiellement 404 faute d'accès réseau au WordPress source) et
 * comparerait ce mauvais saut à l'attendu — faux échec systématique sur le
 * host ES.
 *
 * On ne continue au-delà du premier saut QUE si c'est une simple
 * normalisation trailing-slash (même chemin, +/- `/` final) : c'est la seule
 * forme de saut qui peut légitimement s'intercaler avant la règle testée.
 */
function isTrailingSlashNormalization(fromPath, toPath) {
  const strip = (p) => p.replace(/\/+$/, "");
  return toPath !== fromPath && strip(toPath) === strip(fromPath);
}

async function chase(target, hostHeader, urlPath, insecure, maxHops = 3) {
  let currentPath = urlPath;
  let last = null;
  for (let hop = 0; hop < maxHops; hop++) {
    last = await requestOnce(target, hostHeader, currentPath, insecure);
    const isRedirect = last.status >= 300 && last.status < 400 && last.location;
    if (!isRedirect) break;
    if (!isTrailingSlashNormalization(currentPath, last.location)) break; // c'est la redirection testée : on s'arrête là
    currentPath = last.location;
  }
  return last;
}

/* ───────────────────────────── inventaire CSV ───────────────────────────── */

/** Parseur CSV minimal (symétrique de l'échappement de `build-redirect-inventory.mjs` : guillemets doublés). */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

async function readInventory(inventoryPath) {
  let raw;
  try {
    raw = await readFile(inventoryPath, "utf8");
  } catch (err) {
    throw new Error(
      `[inventaire] "${inventoryPath}" illisible : ${err instanceof Error ? err.message : err}\n` +
        `→ Générer d'abord avec : node scripts/build-redirect-inventory.mjs`,
    );
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const [header, ...rest] = lines;
  const cols = parseCsvLine(header);
  const expected = ["host", "path", "expected_status", "expected_location"];
  if (cols.join(",") !== expected.join(",")) {
    throw new Error(`[inventaire] en-tête CSV inattendu : "${header}" (attendu : "${expected.join(",")}").`);
  }
  return rest.map((line) => {
    const [host, urlPath, expected_status, expected_location] = parseCsvLine(line);
    return { host, path: urlPath, expectedStatus: Number(expected_status), expectedLocation: expected_location };
  });
}

/* ───────────────────────── cas négatifs obligatoires (host ES) ───────────────────────── */

const MANDATORY_CASES = [
  // Piège du pattern #2 (lookahead négatif) : les slugs de maison eux-mêmes ne
  // doivent JAMAIS être capturés par la règle fiche → sinon boucle/404.
  { host: "editionssociales.fr", path: "/catalogue/editions-sociales", expectRedirect: false },
  { host: "editionssociales.fr", path: "/catalogue/la-dispute", expectRedirect: false },
  { host: "editionssociales.fr", path: "/a-propos", expectRedirect: false },
  { host: "editionssociales.fr", path: "/", expectRedirect: false },
  { host: "editionssociales.fr", path: "/souscription", expectRedirect: false },
  // Host boutique : `/panier` n'a délibérément AUCUNE règle (source ===
  // destination bouclerait à l'infini, cf. next.config.ts) — la page native
  // doit répondre 200 directement, sur les deux hostnames (G5).
  { host: "boutique.editionssociales.fr", path: "/panier", expectRedirect: false },
  { host: "www.boutique.editionssociales.fr", path: "/panier", expectRedirect: false },
];

/* ───────────────────────────── run ───────────────────────────── */

async function runVerification({ target, inventory, insecure, hostFilter }) {
  const allRows = await readInventory(inventory);
  const rows = hostFilter ? allRows.filter((r) => r.host === hostFilter) : allRows;
  const mandatoryCases = hostFilter
    ? MANDATORY_CASES.filter((c) => c.host === hostFilter)
    : MANDATORY_CASES;
  if (hostFilter) {
    console.error(
      `[verify-redirects] --host-filter="${hostFilter}" — ${rows.length}/${allRows.length} ligne(s) d'inventaire retenue(s).`,
    );
  }
  const failures = [];

  for (const row of rows) {
    const res = await chase(target, row.host, row.path, insecure);
    if (res.status !== row.expectedStatus || (res.location ?? "") !== row.expectedLocation) {
      failures.push({
        host: row.host,
        path: row.path,
        expected: `${row.expectedStatus} → ${row.expectedLocation}`,
        got: `${res.status} → ${res.location ?? "(aucune)"}`,
      });
    }
  }

  for (const c of mandatoryCases) {
    const res = await requestOnce(target, c.host, c.path, insecure);
    const isRedirect = res.status >= 300 && res.status < 400;
    if (c.expectRedirect !== isRedirect || (!c.expectRedirect && res.status !== 200)) {
      failures.push({
        host: c.host,
        path: c.path,
        expected: c.expectRedirect ? "redirection" : "200 (aucune redirection)",
        got: `${res.status}${res.location ? ` → ${res.location}` : ""}`,
      });
    }
  }

  const total = rows.length + mandatoryCases.length;
  if (failures.length > 0) {
    const detail = failures
      .map((f) => `  - [${f.host}] ${f.path} — attendu ${f.expected}, obtenu ${f.got}`)
      .join("\n");
    throw new Error(`[verify-redirects] ${failures.length}/${total} échec(s) :\n${detail}`);
  }
  console.error(`[verify-redirects] OK — ${total}/${total} vérifications passées sur ${target}.`);
}

/* ───────────────────────────── main ───────────────────────────── */

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  await selfTestHost();
  await compileSources();
  await checkRedirectsProduitsFreshness(args.redirectsProduitsSince);

  if (args.selfTestOnly) {
    console.error("[verify-redirects] --self-test-only : garde-fous passés, arrêt avant toute requête réseau.");
    return;
  }

  if (!args.target) {
    throw new Error(
      `[verify-redirects] --target requis hors --self-test-only (ex. --target http://localhost:3000, ` +
        `après "pnpm build && pnpm start").`,
    );
  }

  await runVerification(args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Cœur pur du backfill des dons-contreparties (campagne « souscription-2026 »,
 * mission « backfill dons ») — zéro I/O (pas de Stripe, pas de Payload) :
 * classification d'une session (déjà traitée / hors périmètre / palier fixe /
 * palier à choix), parsing du CSV `--choix`, mise en forme du CSV
 * d'inventaire. L'orchestrateur I/O (`backfill-dons-contreparties.ts`) liste
 * les sessions Stripe, relit les commandes Payload existantes, résout les
 * slugs en ids de fiches, puis appelle `handleDonationSessionCompleted`
 * (`src/app/api/stripe/webhook/order-handler.ts`, MÊME pipeline idempotent
 * que le webhook) — jamais ici.
 *
 * Imports RELATIFS uniquement (même contrat que `import-orders-woo-core.ts` :
 * `payload run` ne résout pas `@/*` de façon fiable) — seuls
 * `contreparties-core.ts` et `donation-tiers.ts` (purs, sans `server-only`)
 * sont importés.
 */
import {
  contrepartieForTier,
  resolveContrepartieItems,
  tierHasChoices,
  type ContrepartieItemRef,
  type ContrepartieSection,
  type ContrepartieSelection,
} from "../src/lib/contreparties-core.ts";
import { DONATION_TIERS, type DonationTierId } from "../src/lib/donation-tiers.ts";

/* ─────────────────────────── palier connu ? ─────────────────────────── */

/** `tierRaw` (`session.metadata.tier`) → id de palier connu, ou `null` (montant libre `"libre"`, palier retiré, metadata absente/corrompue). */
function resolveTierId(tierRaw: string | undefined): DonationTierId | null {
  if (tierRaw === undefined) return null;
  return DONATION_TIERS.some((t) => t.id === tierRaw) ? (tierRaw as DonationTierId) : null;
}

/* ─────────────────────────── CSV : échappement (convention order-export.ts) ───────────────────────────
 *
 * `escapeCsvCell`/`toCsv` d'`src/lib/order-export.ts` ne sont pas exportées
 * (module pur, aucune dépendance croisée souhaitée) — mêmes règles RFC 4180
 * dupliquées ici à l'identique (séparateur `;`, saut de ligne CRLF, guillemets
 * doublés si la cellule contient le séparateur/un guillemet/un saut de ligne).
 */

const CSV_DELIMITER = ";";
const CSV_LINE_BREAK = "\r\n";

function escapeCsvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(CSV_DELIMITER));
  return lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

/** Décimale française à 2 décimales (`12,50`), sans symbole — même convention que `order-export.ts:formatAmount`. */
function formatEuros(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2).replace(".", ",");
}

/* ─────────────────────────── Mode 1 : inventaire ─────────────────────────── */

export type InventoryBucket = "fixe-a-creer" | "choix-en-attente" | "deja-traite" | "hors-perimetre";

export interface InventorySessionFacts {
  sessionId: string;
  /** ISO 8601 complet (`session.created`, en secondes côté Stripe — déjà converti par l'appelant). */
  createdAtISO: string;
  tierRaw: string | undefined;
  amountEuros: number;
  email: string | null;
  /** `!!session.metadata.donLines` — un don déjà résolu par le NOUVEAU checkout (post-déploiement), jamais par ce backfill. */
  donLinesPresent: boolean;
  /** `findOrderBySessionId(sessionId, "don")` trouve déjà une commande. */
  orderExists: boolean;
}

export interface InventoryRow {
  sessionId: string;
  date: string;
  tier: string;
  montant: number;
  email: string;
  choixRequis: boolean;
  /** `"sectionId:opt1|opt2"` (sections jointes par `;` s'il y en avait plusieurs — aucun palier 2026 n'en a plus d'une) — vide si `choixRequis` est faux. */
  sectionsAChoisir: string;
  dejaTraite: boolean;
  bucket: InventoryBucket;
}

/** Sections `choix` d'un palier, formatées `"sectionId:opt1|opt2"` (jointes par `;` si plusieurs sections — cas non rencontré dans `CONTREPARTIES_2026` mais géré en toute généralité). */
export function formatSectionsAChoisir(tierId: DonationTierId): string {
  const composition = contrepartieForTier(tierId);
  return composition.sections
    .filter((s): s is Extract<ContrepartieSection, { kind: "choix" }> => s.kind === "choix")
    .map((s) => `${s.id}:${s.options.map((o) => o.id).join("|")}`)
    .join(";");
}

export function buildInventoryRow(facts: InventorySessionFacts): InventoryRow {
  const tierId = resolveTierId(facts.tierRaw);
  const hasChoices = tierId !== null && tierHasChoices(tierId);
  const bucket: InventoryBucket = facts.orderExists
    ? "deja-traite"
    : tierId === null
      ? "hors-perimetre"
      : hasChoices
        ? "choix-en-attente"
        : "fixe-a-creer";

  return {
    sessionId: facts.sessionId,
    date: facts.createdAtISO,
    tier: facts.tierRaw ?? "",
    montant: facts.amountEuros,
    email: facts.email ?? "",
    choixRequis: hasChoices,
    sectionsAChoisir: tierId !== null && hasChoices ? formatSectionsAChoisir(tierId) : "",
    dejaTraite: facts.orderExists,
    bucket,
  };
}

const INVENTORY_HEADER = [
  "sessionId",
  "date",
  "tier",
  "montant",
  "email",
  "choixRequis",
  "sectionsAChoisir",
  "dejaTraite",
] as const;

/** CSV d'inventaire complet — séparateur `;`, décimale française (convention `order-export.ts`). Le BOM UTF-8 (fichier uniquement, cf. `order-export-handler.ts:csvResponse`) est ajouté par l'orchestrateur, pas ici. */
export function formatInventoryCsv(rows: readonly InventoryRow[]): string {
  const body = rows.map((r) => [
    r.sessionId,
    r.date,
    r.tier,
    formatEuros(r.montant),
    r.email,
    r.choixRequis ? "oui" : "non",
    r.sectionsAChoisir,
    r.dejaTraite ? "oui" : "non",
  ]);
  return toCsv(INVENTORY_HEADER, body);
}

export interface InventorySummary {
  total: number;
  fixedToCreate: number;
  choiceWaiting: number;
  alreadyTreated: number;
  outOfScope: number;
}

export function summarizeInventory(rows: readonly InventoryRow[]): InventorySummary {
  const summary: InventorySummary = { total: rows.length, fixedToCreate: 0, choiceWaiting: 0, alreadyTreated: 0, outOfScope: 0 };
  for (const r of rows) {
    switch (r.bucket) {
      case "fixe-a-creer":
        summary.fixedToCreate += 1;
        break;
      case "choix-en-attente":
        summary.choiceWaiting += 1;
        break;
      case "deja-traite":
        summary.alreadyTreated += 1;
        break;
      case "hors-perimetre":
        summary.outOfScope += 1;
        break;
    }
  }
  return summary;
}

/* ─────────────────────────── Mode 2 : décision d'exécution ─────────────────────────── */

export interface DonationSessionFacts {
  sessionId: string;
  tierRaw: string | undefined;
  /** `!!session.metadata.donLines` — session déjà résolue par le nouveau checkout (webhook resté en échec partiel si `orderAlreadyExists` est faux malgré tout). */
  donLinesAlreadyPresent: boolean;
  orderAlreadyExists: boolean;
  /** Sélection lue dans le CSV `--choix` pour CETTE session — `undefined` si la session est absente du fichier (ou fichier non fourni). */
  choixSelection?: ContrepartieSelection;
}

export type DonationDecision =
  | { kind: "deja-traite" }
  | { kind: "hors-perimetre"; tierRaw: string | undefined }
  /** `donLines` déjà posée par Stripe (nouveau checkout) mais aucune commande trouvée — webhook resté en échec partiel : rejoue le pipeline TEL QUEL, jamais recomposé. */
  | { kind: "rejoue-donlines-existantes" }
  | { kind: "choix-en-attente"; tierId: DonationTierId }
  | { kind: "resolu"; tierId: DonationTierId; items: ContrepartieItemRef[] }
  | { kind: "erreur"; tierId: DonationTierId; reason: string };

/**
 * Décide l'action pour UNE session (mode 2) — ne résout JAMAIS de slug en id
 * (I/O, à la charge de l'appelant) : `"resolu"` porte la composition en
 * SLUGS, prête à être relue par `getContrepartieBooksBySlugs`.
 *
 * Distinction volontaire (spec) entre deux échecs de palier à choix :
 * - session ABSENTE du CSV `--choix` → `"choix-en-attente"` (skip doux,
 *   normal tant que Clara n'a pas recueilli la réponse) ;
 * - session PRÉSENTE dans le CSV mais sélection invalide (section manquante
 *   dans la ligne, option inconnue) → `"erreur"` (l'opérateur a fourni une
 *   donnée, elle est fausse — jamais un skip silencieux).
 */
export function decideDonationAction(facts: DonationSessionFacts): DonationDecision {
  if (facts.orderAlreadyExists) return { kind: "deja-traite" };
  if (facts.donLinesAlreadyPresent) return { kind: "rejoue-donlines-existantes" };

  const tierId = resolveTierId(facts.tierRaw);
  if (tierId === null) return { kind: "hors-perimetre", tierRaw: facts.tierRaw };

  if (!tierHasChoices(tierId)) {
    const resolution = resolveContrepartieItems(tierId, {});
    if (!resolution.ok) {
      // Ne devrait jamais se produire pour un palier fixe (aucune section
      // `choix`, cf. `CONTREPARTIES_2026`) — filet défensif seulement.
      return { kind: "erreur", tierId, reason: `résolution impossible (palier fixe) : ${resolution.reason}:${resolution.sectionId}` };
    }
    return { kind: "resolu", tierId, items: resolution.items };
  }

  if (facts.choixSelection === undefined) return { kind: "choix-en-attente", tierId };

  const resolution = resolveContrepartieItems(tierId, facts.choixSelection);
  if (!resolution.ok) {
    return { kind: "erreur", tierId, reason: `${resolution.reason}:${resolution.sectionId}` };
  }
  return { kind: "resolu", tierId, items: resolution.items };
}

/* ─────────────────────────── CSV --choix ─────────────────────────── */

export interface ChoixCsvParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface ChoixCsvParseResult {
  bySession: Map<string, ContrepartieSelection>;
  errors: ChoixCsvParseError[];
}

/**
 * Parse le CSV `--choix` — format `sessionId;sectionId:optionId[,sectionId:optionId]`.
 * Ne jette JAMAIS : une ligne malformée est ignorée et signalée dans
 * `errors` (même défensivité que `decodeCheckoutLines`, `checkout-core.ts`) —
 * les lignes valides restent exploitables. Lignes vides et commentaires
 * (`#…`) ignorés silencieusement. Un `sessionId` en doublon est un rejet de
 * la ligne (jamais une sélection écrasée silencieusement).
 */
export function parseChoixCsv(text: string): ChoixCsvParseResult {
  const bySession = new Map<string, ContrepartieSelection>();
  const errors: ChoixCsvParseError[] = [];

  const lines = text.split(/\r\n|\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const lineNo = idx + 1;

    const sepIdx = line.indexOf(";");
    if (sepIdx === -1) {
      errors.push({ line: lineNo, raw, reason: "séparateur ';' absent" });
      return;
    }
    const sessionId = line.slice(0, sepIdx).trim();
    const selectionsRaw = line.slice(sepIdx + 1).trim();
    if (!sessionId) {
      errors.push({ line: lineNo, raw, reason: "sessionId vide" });
      return;
    }
    if (!selectionsRaw) {
      errors.push({ line: lineNo, raw, reason: "sélection vide" });
      return;
    }
    if (bySession.has(sessionId)) {
      errors.push({ line: lineNo, raw, reason: `sessionId « ${sessionId} » en doublon — ligne ignorée` });
      return;
    }

    const selection: ContrepartieSelection = {};
    let malformed = false;
    for (const pair of selectionsRaw.split(",")) {
      const [sectionId, optionId] = pair.split(":").map((s) => s.trim());
      if (!sectionId || !optionId) {
        errors.push({ line: lineNo, raw, reason: `paire « ${pair} » malformée (attendu sectionId:optionId)` });
        malformed = true;
        continue;
      }
      selection[sectionId] = optionId;
    }
    if (malformed) return;

    bySession.set(sessionId, selection);
  });

  return { bySession, errors };
}

import { z } from "zod";

/**
 * Vérification de FORME des variables d'environnement — pur, sans I/O, appelé
 * au boot par `instrumentation.ts`.
 *
 * Le provisioning est progressif (chaque phase pose ses variables, leur
 * absence est un état légitime — `donationsEnabled()`, gate `SITE_INDEXABLE`,
 * bascule `CATALOGUE_SOURCE`…) : **aucune variable n'est requise ici**. En
 * revanche une variable *posée mais malformée* — `DATABASE_URL=""` qui
 * échouerait au fond de pg, un secret vide qui plante dans jose, un
 * `SITE_INDEXABLE=true` qui laisse le site désindexé en silence — doit
 * échouer au démarrage, pas au fond d'une requête.
 */

const httpUrl = z
  .string()
  .regex(/^https?:\/\/.+/, "URL http(s) attendue");
const httpsUrl = z.string().regex(/^https:\/\/.+/, "URL https attendue");
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "URL postgres(ql):// attendue");

/**
 * Chaque entrée est optionnelle (absence = phase non provisionnée) mais,
 * posée, doit avoir la forme attendue. `STRIPE_SECRET_KEY` n'est pas listée :
 * une valeur non reconnue y est un état documenté (interrupteur de la phase
 * dons, `stripe.ts`) — seule la règle live/environnement est vérifiée plus bas.
 */
const envSchema = z.object({
  WP_ES_URL: httpUrl.optional(),
  WP_LD_URL: httpUrl.optional(),
  WC_STORE_URL: httpUrl.optional(),
  WP_REVALIDATE: z
    .string()
    .regex(/^\d+$/, "nombre entier de secondes attendu")
    .optional(),
  DATABASE_URL: postgresUrl.optional(),
  DATABASE_URL_UNPOOLED: postgresUrl.optional(),
  PAYLOAD_SECRET: z
    .string()
    .min(16, "secret trop court (générer avec `openssl rand -hex 32`)")
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_.+/, "secret d'endpoint webhook attendu (whsec_…)")
    .optional(),
  CATALOGUE_SOURCE: z.enum(
    ["http", "pg"],
    "valeurs reconnues : http | pg (toute autre valeur retomberait en http SANS le signaler)",
  ).optional(),
  NEXT_PUBLIC_SITE_URL: httpsUrl.optional(),
  NEXT_PUBLIC_SENTRY_DSN: httpsUrl.optional(),
  SITE_INDEXABLE: z.enum(
    ["0", "1"],
    "valeurs reconnues : 1 | 0 (`true` laisserait le site désindexé en silence)",
  ).optional(),
  REDIRECTS_PERMANENT: z.enum(
    ["0", "1"],
    "valeurs reconnues : 1 | 0 (`true` laisserait les redirections en 302 en silence)",
  ).optional(),
});

export interface EnvIssue {
  variable: string;
  message: string;
}

/**
 * Contrôle la forme des variables posées. Renvoie la liste des problèmes —
 * vide quand tout va bien. Règle transverse (DEVOPS.md) : jamais de clé
 * `sk_live_` hors production Vercel — une PR ne doit pas pouvoir encaisser
 * un don réel.
 */
export function checkEnv(env: Record<string, string | undefined> = process.env): EnvIssue[] {
  const issues: EnvIssue[] = [];

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ variable: String(issue.path[0] ?? "?"), message: issue.message });
    }
  }

  if (
    env.STRIPE_SECRET_KEY?.startsWith("sk_live_") &&
    env.VERCEL_ENV !== "production" &&
    env.NODE_ENV === "production"
  ) {
    issues.push({
      variable: "STRIPE_SECRET_KEY",
      message:
        "clé LIVE hors production Vercel — une preview ne doit jamais pouvoir encaisser un don réel (DEVOPS.md).",
    });
  }

  return issues;
}

/** Jette au boot, toutes variables fautives listées d'un coup — jamais au fond d'une requête. */
export function assertEnv(env: Record<string, string | undefined> = process.env): void {
  const issues = checkEnv(env);
  if (issues.length > 0) {
    throw new Error(
      "Variables d'environnement malformées :\n" +
        issues.map((i) => `  - ${i.variable} : ${i.message}`).join("\n"),
    );
  }
}

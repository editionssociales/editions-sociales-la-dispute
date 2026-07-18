import { z } from "zod";

/**
 * Vérification de FORME des variables d'environnement — pur, sans I/O, appelé
 * au boot par `instrumentation.ts`.
 *
 * Depuis la coupure OVH (plus aucun WordPress/WooCommerce lu), la base
 * Postgres N'EST PLUS optionnelle : catalogue, contenus, panier, checkout et
 * back-office passent tous par Payload — `DATABASE_URL` et `PAYLOAD_SECRET`
 * sont REQUISES, leur absence doit échouer au démarrage, pas au fond d'une
 * requête. Le reste du provisioning demeure progressif (`donationsEnabled()`,
 * gate `SITE_INDEXABLE`, Brevo…) : ces entrées restent **optionnelles**, mais
 * une variable *posée mais malformée* — un secret vide qui plante dans jose,
 * un `SITE_INDEXABLE=true` qui laisse le site désindexé en silence — doit
 * échouer au démarrage elle aussi.
 */

const httpsUrl = z.string().regex(/^https:\/\/.+/, "URL https attendue");
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "URL postgres(ql):// attendue");

/**
 * Chaque entrée optionnelle (absence = phase non provisionnée) doit, posée,
 * avoir la forme attendue. `STRIPE_SECRET_KEY` et `BREVO_API_KEY` ne sont pas
 * listées : une valeur non reconnue y est un état documenté (interrupteur de
 * phase — `stripe.ts:donationsEnabled`, `brevo.ts:brevoConfigured`) — seule
 * la règle live/environnement Stripe est vérifiée plus bas.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string({
      error:
        "variable requise — sans Postgres, ni catalogue ni back-office (coupure OVH : Payload est la seule source)",
    })
    .regex(/^postgres(ql)?:\/\/.+/, "URL postgres(ql):// attendue"),
  DATABASE_URL_UNPOOLED: postgresUrl.optional(),
  PAYLOAD_SECRET: z
    .string({
      error:
        "variable requise — Payload ne monte pas sans secret (générer avec `openssl rand -hex 32`)",
    })
    .min(16, "secret trop court (générer avec `openssl rand -hex 32`)"),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_.+/, "secret d'endpoint webhook attendu (whsec_…)")
    .optional(),
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
  BREVO_DOI_TEMPLATE_ID: z
    .string()
    .regex(/^\d+$/, "identifiant numérique de template Brevo attendu")
    .optional(),
  BREVO_LIST_ID_SITE: z
    .string()
    .regex(/^\d+$/, "identifiant numérique de liste Brevo attendu")
    .optional(),
  CONTACT_TO_EMAIL: z.email("adresse email attendue").optional(),
});

export interface EnvIssue {
  variable: string;
  message: string;
}

/**
 * Contrôle la forme des variables posées — et la présence des deux requises
 * (`DATABASE_URL`, `PAYLOAD_SECRET`). Renvoie la liste des problèmes — vide
 * quand tout va bien. Règle transverse (DEVOPS.md) : jamais de clé
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

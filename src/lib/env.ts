import { z } from "zod";

/**
 * Vérification de FORME des variables d'environnement — pur, sans I/O, appelé
 * au boot par `instrumentation.ts`.
 *
 * Le provisioning est progressif (chaque phase pose ses variables, leur
 * absence est un état légitime — `donationsEnabled()`, gate `SITE_INDEXABLE`,
 * bascule `CATALOGUE_SOURCE`…) : la plupart des entrées ci-dessous restent
 * **optionnelles**. Trois exceptions, `WP_ES_URL`/`WP_LD_URL`/`WC_STORE_URL`
 * (DEVOPS.md §4.1) : absentes, `catalogue-http.ts`/`boutique.ts` retombent
 * silencieusement sur les URL PUBLIQUES DE PROD du client
 * (`editionssociales.fr`, `ladispute.fr`, `boutique.editionssociales.fr`) —
 * acceptable tant que le site ne fait que LIRE ces WordPress, plus dès qu'il
 * y a une base de données et un paiement (donations) : un environnement mal
 * posé (preview, poste mal configuré) ne doit plus pouvoir taper
 * silencieusement la prod du client. `.env.example` fournit les trois —
 * poser un `.env` local à partir de lui suffit à satisfaire cette exigence.
 * Pour le reste : une variable *posée mais malformée* — `DATABASE_URL=""`
 * qui échouerait au fond de pg, un secret vide qui plante dans jose, un
 * `SITE_INDEXABLE=true` qui laisse le site désindexé en silence — doit
 * échouer au démarrage, pas au fond d'une requête.
 */

const httpsUrl = z.string().regex(/^https:\/\/.+/, "URL https attendue");
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "URL postgres(ql):// attendue");

/**
 * `WP_ES_URL`/`WP_LD_URL`/`WC_STORE_URL` (DEVOPS.md §4.1) : REQUISES — le
 * message distingue l'absence pure (repli silencieux sur la prod publique,
 * le risque documenté) de la valeur malformée (URL sans schéma http(s)).
 */
const requiredHttpUrl = (fallback: string) =>
  z
    .string({
      error: `variable requise — absente, le code retombe silencieusement sur l'URL de prod publique ${fallback} (DEVOPS.md §4.1)`,
    })
    .regex(/^https?:\/\/.+/, "URL http(s) attendue");

/**
 * Chaque entrée est optionnelle (absence = phase non provisionnée) mais,
 * posée, doit avoir la forme attendue — sauf les trois URL WordPress/Woo
 * ci-dessus, requises. `STRIPE_SECRET_KEY` et `BREVO_API_KEY` ne sont pas
 * listées : une valeur non reconnue y est un état documenté (interrupteur de
 * phase — `stripe.ts:donationsEnabled`, `brevo.ts:brevoConfigured`) — seule
 * la règle live/environnement Stripe est vérifiée plus bas.
 */
const envSchema = z.object({
  WP_ES_URL: requiredHttpUrl("https://editionssociales.fr"),
  WP_LD_URL: requiredHttpUrl("https://ladispute.fr"),
  WC_STORE_URL: requiredHttpUrl("https://boutique.editionssociales.fr"),
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
  COMMERCE_NATIVE: z.enum(
    ["0", "1"],
    "valeurs reconnues : 1 | 0 (`true` laisserait le commerce natif désactivé en silence — règle d'or du lot 2 : iso-rendu strict tant que ce n'est pas explicitement \"1\")",
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

/**
 * Interrupteur du commerce natif (phase 4, lot 2, plan §4 étape 5) — `false`
 * par défaut : tant que `COMMERCE_NATIVE` n'est pas posée à `"1"`, le site
 * reste STRICTEMENT iso-rendu avec l'existant (liens Woo intacts, `/boutique`
 * redirige vers `/catalogue`, checkout 503, panier absent du header — règle
 * d'or du lot). Toute autre valeur (absente, vide, malformée) désactive ;
 * `checkEnv` signale déjà au boot les valeurs malformées (`"true"` au lieu de
 * `"1"`, etc.) — ce helper ne fait que lire l'interrupteur au runtime, sans
 * jeter.
 */
export function isCommerceNative(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.COMMERCE_NATIVE === "1";
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

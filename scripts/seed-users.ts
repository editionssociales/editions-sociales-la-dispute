/**
 * Seed du premier compte administrateur (et, en option, d'un compte éditeur
 * de test) du back-office Payload.
 *
 * Usage : `pnpm seed:users` (→ `payload run scripts/seed-users.ts`).
 *
 * Idempotent : un compte déjà présent pour l'email donné n'est jamais
 * recréé ni modifié — le script se contente de le signaler.
 *
 * Variables d'environnement :
 * - PAYLOAD_SEED_ADMIN_EMAIL    (défaut dev : admin@editionssociales.fr)
 * - PAYLOAD_SEED_ADMIN_PASSWORD (requis — aucun défaut ; échec volontaire sinon)
 * - PAYLOAD_SEED_ADMIN_NAME     (défaut : « Administrateur »)
 * - PAYLOAD_SEED_EDITOR_EMAIL / PAYLOAD_SEED_EDITOR_PASSWORD (optionnel — les
 *   deux doivent être posées ensemble pour créer un compte editor de test)
 * - PAYLOAD_SEED_EDITOR_NAME    (défaut : « Éditrice·eur de test »)
 */
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

type SeedRole = 'admin' | 'editor'

async function seedUser(
  payload: Awaited<ReturnType<typeof getPayload>>,
  { email, password, name, role }: { email: string; password: string; name: string; role: SeedRole },
): Promise<void> {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })

  if (existing.totalDocs > 0) {
    payload.logger.info(`[seed:users] ${email} existe déjà — rien à faire (idempotent).`)
    return
  }

  await payload.create({
    collection: 'users',
    data: { email, password, name, role },
  })

  payload.logger.info(`[seed:users] Compte ${role} créé : ${email}`)
}

async function run(): Promise<void> {
  const adminEmail = process.env.PAYLOAD_SEED_ADMIN_EMAIL || 'admin@editionssociales.fr'
  const adminPassword = process.env.PAYLOAD_SEED_ADMIN_PASSWORD
  const adminName = process.env.PAYLOAD_SEED_ADMIN_NAME || 'Administrateur'

  if (!adminPassword) {
    console.error(
      '[seed:users] PAYLOAD_SEED_ADMIN_PASSWORD est requis (aucun mot de passe par défaut) — abandon.',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  await seedUser(payload, {
    email: adminEmail,
    password: adminPassword,
    name: adminName,
    role: 'admin',
  })

  const editorEmail = process.env.PAYLOAD_SEED_EDITOR_EMAIL
  const editorPassword = process.env.PAYLOAD_SEED_EDITOR_PASSWORD

  if (editorEmail && editorPassword) {
    await seedUser(payload, {
      email: editorEmail,
      password: editorPassword,
      name: process.env.PAYLOAD_SEED_EDITOR_NAME || 'Éditrice·eur de test',
      role: 'editor',
    })
  } else if (editorEmail || editorPassword) {
    console.warn(
      '[seed:users] PAYLOAD_SEED_EDITOR_EMAIL et PAYLOAD_SEED_EDITOR_PASSWORD doivent être posées ensemble — compte editor ignoré.',
    )
  }

  process.exit(0)
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu — un `run()` fire-and-forget serait tué avant
// d'avoir travaillé.
try {
  await run()
} catch (error) {
  console.error('[seed:users] Échec du seed :', error)
  process.exit(1)
}

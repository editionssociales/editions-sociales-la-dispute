import type { Payload } from 'payload'

/**
 * Absorbe les erreurs émises par le pool `pg` sur ses clients idle. Neon
 * (plan Free) coupe tous les sockets à l'autosuspend (~5 min sans activité,
 * non désactivable) ; l'instance Vercel (Fluid) vit bien plus longtemps et
 * garde son pool — au réveil, chaque client idle coupé émet `error` sur le
 * pool, et sans listener Node en fait une exception non gérée qui tue le
 * process entier (« Connection terminated unexpectedly », constat prod
 * 2026-08-07). `pg-pool` a déjà retiré le client du pool avant d'émettre :
 * il n'y a rien d'autre à faire que loguer — la requête suivante ouvre une
 * connexion neuve.
 */
export function attachPoolErrorHandler(payload: Payload): void {
  const { pool } = payload.db as unknown as {
    pool?: { on: (event: 'error', cb: (err: Error) => void) => unknown }
  }
  pool?.on('error', (err) => {
    payload.logger.warn(
      `[pg-pool] connexion idle coupée par le serveur (attendu à l'autosuspend Neon) : ${err.message}`,
    )
  })
}

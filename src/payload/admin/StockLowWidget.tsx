import type { ServerProps } from 'payload'

/**
 * Widget dashboard (slot `beforeDashboard`, mission « stock bas ») : titres
 * dont `commerce.stock` est sous le seuil de `reglages-boutique`
 * (`seuilAlerteStockBas`, défaut 3), stock à 0 inclus — les deux modes de
 * suivi confondus (routeur ET manuel : un goodie saisi à la main s'alerte
 * comme un livre routeur ; le mode est affiché par titre). Un stock `null`
 * (pas de décompte saisi — fallback manuel, décision client du 12/07)
 * n'apparaît jamais ici : sans décompte, pas de seuil.
 *
 * Aucun e-mail (mission point 5) : lecture seule, rafraîchie à chaque
 * chargement du tableau de bord.
 */
export async function StockLowWidget({ payload }: ServerProps) {
  const settings = await payload.findGlobal({ slug: 'reglages-boutique' })
  const seuil = settings?.seuilAlerteStockBas ?? 3

  const { docs } = await payload.find({
    collection: 'books',
    where: {
      and: [{ 'commerce.stock': { exists: true } }, { 'commerce.stock': { less_than_equal: seuil } }],
    },
    sort: 'commerce.stock',
    depth: 0,
    limit: 0,
    overrideAccess: true,
  })

  return (
    <div
      style={{
        margin: '1rem 0',
        padding: '1rem',
        border: '1px solid var(--theme-border-color, #ccc)',
        borderRadius: 4,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Stock bas (seuil : {seuil})</h3>
      {docs.length === 0 ? (
        <p>Aucun titre sous le seuil.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {docs.map((book) => (
            <li key={book.id}>
              {book.title} — {book.commerce?.stock ?? 0} exemplaire{(book.commerce?.stock ?? 0) > 1 ? 's' : ''}{' '}
              <em>({book.commerce?.stockSuivi === 'routeur' ? 'suivi routeur' : 'suivi manuel'})</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import type { ServerProps } from 'payload'

/**
 * Lien de nav `afterNavLinks` vers `/admin/stock` — admin OU editor (même
 * garde que `StockPage.tsx`). Classes `nav__link` comme `HealthNavLink`.
 */
export function StockNavLink({ user }: ServerProps) {
  const role = user?.role
  if (role !== 'admin' && role !== 'editor') return null

  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office
    <a className="nav__link" href="/admin/stock" id="nav-stock">
      <span className="nav__link-label">Stock</span>
    </a>
  )
}

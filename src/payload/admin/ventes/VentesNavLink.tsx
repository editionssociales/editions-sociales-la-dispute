import type { ServerProps } from 'payload'

/**
 * Lien de nav `afterNavLinks` vers `/admin/ventes` — admin OU editor (même
 * garde que `VentesPage.tsx`, même périmètre que `../stock/StockNavLink.tsx`).
 * Classes `nav__link` comme `StockNavLink`/`HealthNavLink`.
 */
export function VentesNavLink({ user }: ServerProps) {
  const role = user?.role
  if (role !== 'admin' && role !== 'editor') return null

  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office
    <a className="nav__link" href="/admin/ventes" id="nav-ventes">
      <span className="nav__link-label">Ventes</span>
    </a>
  )
}

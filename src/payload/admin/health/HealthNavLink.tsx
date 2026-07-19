import type { ServerProps } from 'payload'

/**
 * Lien de nav `afterNavLinks` vers la page Santé (`/admin/sante`, issue #27,
 * `HealthPage.tsx`) — rendu UNIQUEMENT pour le rôle admin (l'accès direct par
 * URL est de toute façon barré par `HealthPage.tsx`, ce lien n'est qu'une
 * commodité de découverte). Classes `nav__link`/`nav__link-label` : mêmes
 * classes que les liens de groupe rendus par `DefaultNavClient`
 * (`@payloadcms/next/dist/elements/Nav/index.client.js`) — cohérence visuelle
 * avec le reste de la nav sans dépendre de `@payloadcms/ui` (paquet non
 * déclaré en dépendance directe de ce dépôt, cf. `HealthPage.tsx`).
 */
export function HealthNavLink({ user }: ServerProps) {
  if (user?.role !== 'admin') return null

  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office
    <a className="nav__link" href="/admin/sante" id="nav-sante">
      <span className="nav__link-label">Santé</span>
    </a>
  )
}

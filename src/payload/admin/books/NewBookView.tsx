import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'

import styles from '../dashboard/dashboard.module.css'
import { NewBookForm } from './NewBookForm.tsx'

/**
 * Vue admin dédiée `/admin/nouveau-livre` (issue #26) : création guidée
 * d'une fiche livre en brouillon (≤ 7 champs, jamais publiée directement —
 * `book-draft-handler.ts` pose `_status: 'draft'` avec une présentation
 * placeholder à réécrire). Accès admin OU editor — `redirect('/admin')`
 * sinon (contrairement à `../health/HealthPage.tsx`, admin STRICT : ici le
 * geste est ouvert au même périmètre que `Books.access.create`,
 * `isAdminOrEditor`).
 *
 * Chrome (`DefaultTemplate` appelé à la main) : même raison que
 * `HealthPage.tsx`, cf. son commentaire — une vue de premier niveau
 * enregistrée sous une nouvelle clé (`nouveauLivre`) n'obtient pas de
 * `templateType` automatique.
 */
export async function NewBookView(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props

  const role = initPageResult.req.user?.role
  if (role !== 'admin' && role !== 'editor') {
    redirect('/admin')
  }

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      // `req.user` est `TypedUser | null` (jamais `undefined`) — `ServerProps.user`
      // attend `TypedUser | undefined` ; conversion sans effet ici, la garde
      // ci-dessus a déjà rejeté tout `user` sans rôle admin/editor.
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <div className="gutter gutter--left gutter--right">
        <h1>Nouveau livre</h1>
        <div className={styles.board}>
          <section className={styles.panel} aria-labelledby="t-nouveau-livre">
            <h2 className={styles.panelTitle} id="t-nouveau-livre">
              Création guidée
            </h2>
            <p className={styles.muted}>
              Crée un brouillon minimal — jamais publié directement : la présentation reste à
              rédiger avant toute publication.
            </p>
            <NewBookForm />
          </section>
        </div>
      </div>
    </DefaultTemplate>
  )
}

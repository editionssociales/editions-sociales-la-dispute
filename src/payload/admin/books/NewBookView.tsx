import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

/**
 * Compatibilité : anciens favoris `/admin/nouveau-livre` (ex-création
 * guidée, issue #26) → formulaire natif Payload. Création et édition
 * partagent le même écran collection (`/create` puis `/{id}`).
 */
export async function NewBookView(_props: AdminViewServerProps) {
  redirect('/admin/collections/books/create')
}

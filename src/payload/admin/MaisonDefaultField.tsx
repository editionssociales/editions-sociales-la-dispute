'use client'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  TextareaInput,
  TextInput,
  useField,
  useFormFields,
} from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import type { ChangeEvent } from 'react'

/**
 * Champ texte/zone de texte d'une ligne « maison » de `PageAPropos` dont le
 * texte PAR DÉFAUT dépend de la maison choisie dans la même ligne (select
 * `maison`) : `admin.placeholder` est statique et ne peut pas lire la ligne.
 * Ce composant lit la valeur sœur `maison` et affiche, EN TRANSPARENCE tant
 * que le champ est vide, le défaut de CETTE maison — table passée par
 * `admin.custom.defaults` (`{ 'editions-sociales': …, 'la-dispute': … }`, issue de
 * `lib/editions.ts`, la même source que le front). Une ligne sans maison
 * choisie n'affiche aucun défaut.
 */
export const MaisonDefaultField: TextFieldClientComponent = ({
  field,
  path: pathFromProps,
  readOnly,
}) => {
  const path = pathFromProps || field.name
  const { label, required, admin } = field
  const { width, description, className } = admin ?? {}
  const defaults = (admin?.custom?.defaults ?? {}) as Record<string, string>

  const { value, setValue, showError, errorMessage } = useField<string>({ path })
  const siblingPath = path.replace(/[^.]+$/, 'maison')
  const maison = useFormFields(([fields]) => fields[siblingPath]?.value as string | undefined)
  const placeholder = maison ? defaults[maison] : undefined

  // Même composant pour le champ `textarea` (description) : Payload lui passe son `field`.
  const isTextarea = (field as { type?: string }).type === 'textarea'

  return (
    <div
      className={['field-type', isTextarea ? 'textarea' : 'text', className].filter(Boolean).join(' ')}
      style={{ width }}
    >
      <FieldLabel label={label} path={path} required={required} />
      {isTextarea ? (
        <TextareaInput
          path={path}
          value={value ?? ''}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          readOnly={Boolean(readOnly)}
          placeholder={placeholder}
          showError={showError}
        />
      ) : (
        <TextInput
          path={path}
          value={value ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          readOnly={Boolean(readOnly)}
          placeholder={placeholder}
          showError={showError}
        />
      )}
      <FieldError message={errorMessage} path={path} showError={showError} />
      <FieldDescription description={description} path={path} />
    </div>
  )
}

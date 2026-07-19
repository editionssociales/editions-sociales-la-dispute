'use client'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  TextInput,
  useField,
  useFormFields,
} from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useEffect, useRef, type ChangeEvent } from 'react'

import { slugify } from '../../lib/slugify.ts'

/**
 * Slug prérempli depuis le titre tant que l'éditeur ne l'a pas modifié à la
 * main. Sur une fiche déjà enregistrée (slug présent au montage), le suivi
 * auto est coupé — on ne réécrit pas un slug publié.
 */
export const SlugFromTitleField: TextFieldClientComponent = ({
  field,
  path: pathFromProps,
  readOnly,
}) => {
  const path = pathFromProps || field.name
  const { label, required, admin } = field
  const { width, description, placeholder, className } = admin ?? {}

  const { value, setValue, showError, errorMessage } = useField<string>({ path })

  const title = useFormFields(([fields]) => fields.title?.value as string | undefined)

  const initialized = useRef(false)
  const locked = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      if (typeof value === 'string' && value.trim()) {
        locked.current = true
        return
      }
    }
    if (locked.current || readOnly) return

    const next = typeof title === 'string' ? slugify(title) : ''
    if (next !== (value ?? '')) {
      setValue(next)
    }
  }, [title, value, setValue, readOnly])

  return (
    <div className={['field-type', 'text', className].filter(Boolean).join(' ')} style={{ width }}>
      <FieldLabel label={label} path={path} required={required} />
      <TextInput
        path={path}
        value={value ?? ''}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          locked.current = true
          setValue(e.target.value)
        }}
        readOnly={Boolean(readOnly)}
        placeholder={typeof placeholder === 'string' ? placeholder : undefined}
        showError={showError}
      />
      <FieldError message={errorMessage} path={path} showError={showError} />
      <FieldDescription description={description} path={path} />
    </div>
  )
}

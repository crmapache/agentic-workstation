import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import type { SettingFieldProps } from '../ExtensionModal.types'
import { useExtensionActions } from '../../extensions.actions'

/**
 * Поле настройки расширения по манифесту. Текст и секрет сохраняются при уходе из поля, а не
 * на каждую букву; секрет окну не возвращается - поле пустое, подпись говорит, задан ли он.
 */
export const SettingField = ({ extensionId, field, value }: SettingFieldProps) => {
  const { t } = useTranslation()
  const actions = useExtensionActions()
  const [draft, setDraft] = useState(typeof value === 'string' ? value : '')

  if (field.type === 'switch') {
    return (
      <Switch
        label={field.label}
        description={field.description}
        checked={value === true}
        onChange={(checked) => void actions.setSetting(extensionId, field.key, checked)}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <ChoiceField
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        options={field.options}
        onPick={(picked) => void actions.setSetting(extensionId, field.key, picked)}
      />
    )
  }

  const isSecret = field.type === 'secret'
  const secretSet = typeof value === 'object' && value.secret

  return (
    <TextField
      label={field.label}
      type={isSecret ? 'password' : 'text'}
      value={draft}
      placeholder={
        isSecret
          ? t(secretSet ? 'extensions.modal.secretSaved' : 'extensions.modal.secretEmpty')
          : field.placeholder
      }
      autoComplete="off"
      onChange={setDraft}
      onBlur={() => {
        if (isSecret && draft === '') return

        void actions.setSetting(extensionId, field.key, draft)

        if (isSecret) setDraft('')
      }}
    />
  )
}

import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ExtensionModal.module.scss'
import type { ExtensionPartProps } from '../ExtensionModal.types'
import { SettingField } from './SettingField'

/** Настройки расширения - поля из его манифеста. Нет полей - нет и раздела. */
export const ExtensionSettings = ({ extension }: ExtensionPartProps) => {
  const { t } = useTranslation()
  const fields = extension.manifest?.settings ?? []

  if (fields.length === 0) return null

  return (
    <Section size="sm" title={t('extensions.modal.settings')}>
      <div className={styles.stack}>
        {fields.map((field) => (
          <SettingField
            key={`${extension.id}:${field.key}`}
            extensionId={extension.id}
            field={field}
            value={extension.settings[field.key]}
          />
        ))}
      </div>
    </Section>
  )
}

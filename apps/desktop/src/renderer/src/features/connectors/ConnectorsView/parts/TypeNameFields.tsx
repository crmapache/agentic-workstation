import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ConnectorsView.module.scss'
import type { TypeNameFieldsProps } from '../ConnectorsView.types'

/**
 * Имя нового своего типа (ADR 0034) и «несколько раз»: имя с заглавной, как у Gmail, -
 * Playwright. Несколько подключений - тогда и подпись первого (1, Work), а тип встанет в
 * каталог рядом с Gmail.
 */
export const TypeNameFields = ({
  values,
  onChange,
  onKeyDown,
  autoFocus = true,
}: TypeNameFieldsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <TextField
        label={t('connectors.add.name')}
        placeholder={t('connectors.add.namePlaceholder')}
        value={values.name}
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        onChange={(name) => onChange({ name })}
        onKeyDown={onKeyDown}
      />
      <div className={styles.formSwitch}>
        <Switch
          label={t('connectors.add.multiple')}
          description={t('connectors.add.multipleHint')}
          checked={values.multiple}
          onChange={(multiple) => onChange({ multiple })}
        />
      </div>
      {values.multiple && (
        <TextField
          label={t('connectors.add.label')}
          placeholder={t('connectors.add.labelPlaceholder')}
          value={values.label}
          onChange={(label) => onChange({ label })}
          onKeyDown={onKeyDown}
        />
      )}
    </>
  )
}

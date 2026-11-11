import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ClaudeConfigScreen.module.scss'
import type { ConfigValueProps } from '../ClaudeConfigScreen.types'

/**
 * Свободное значение (язык ответов): поле и «Save». Записанное CLI - новая точка
 * отсчёта: язык он пишет по-своему («ja» ложится «Japanese»), и поле с набранным
 * предлагало бы сохранить его снова. Поэтому ряд ставит поле с ключом по значению -
 * новое значение начинает поле заново.
 */
export const ConfigValue = ({ value, label, disabled, onSave }: ConfigValueProps) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const typed = draft.trim()
  const isChanged = typed !== '' && typed !== value

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isChanged) onSave(typed)
  }

  return (
    <form className={styles.freeForm} onSubmit={handleSubmit}>
      <div className={styles.freeField}>
        <TextField
          label={t('claudeCode.claudeConfig.valueLabel', { setting: label })}
          hideLabel
          value={draft}
          spellCheck={false}
          disabled={disabled}
          onChange={setDraft}
        />
      </div>
      <Button type="submit" size="sm" variant="primary" disabled={disabled || !isChanged}>
        {t('claudeCode.claudeConfig.save')}
      </Button>
    </form>
  )
}

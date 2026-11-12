import clsx from 'clsx'
import { X, Braces } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import { NAME_SAMPLE } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { InputRowProps } from '../EditorModal.types'
import { isBadName, inputMention } from '../EditorModal.utils'

/**
 * Один вопрос перед запуском: как его пишет промпт (`{{имя}}` - сверху, тем же цветом, что в
 * промпте), как он называется на форме, что подсказать в пустом поле и обязателен ли ответ.
 */
export const InputRow = ({ input, onInput, onRemove }: InputRowProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={clsx(styles.mention, styles.mentionInput)}>
          {inputMention(input.name || NAME_SAMPLE)}
        </span>
        <IconButton
          icon={X}
          size="sm"
          label={t('scenarios.editor.inputs.remove')}
          onClick={onRemove}
        />
      </div>
      <TextField
        label={t('scenarios.editor.inputs.name')}
        icon={Braces}
        value={input.name}
        placeholder={t('scenarios.editor.inputs.namePlaceholder')}
        error={isBadName(input.name) ? t('scenarios.editor.badName') : undefined}
        onChange={(name) => onInput({ name })}
      />
      <TextField
        label={t('scenarios.editor.inputs.label')}
        value={input.label}
        placeholder={t('scenarios.editor.inputs.labelPlaceholder')}
        onChange={(label) => onInput({ label })}
      />
      <TextField
        label={t('scenarios.editor.inputs.placeholder')}
        value={input.placeholder}
        placeholder={t('scenarios.editor.inputs.placeholderPlaceholder')}
        onChange={(placeholder) => onInput({ placeholder })}
      />
      <Switch
        label={t('scenarios.editor.inputs.required')}
        description={t('scenarios.editor.inputs.requiredHint')}
        checked={input.required}
        onChange={(required) => onInput({ required })}
      />
    </div>
  )
}

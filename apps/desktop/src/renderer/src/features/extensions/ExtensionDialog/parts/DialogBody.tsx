import { useTranslation } from 'react-i18next'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ExtensionDialog.module.scss'
import type { DialogBodyProps } from '../ExtensionDialog.types'

/** Что спрашивают: поле, текст вопроса или выбор - и от какого расширения вопрос. */
export const DialogBody = ({ request, value, onValue }: DialogBodyProps) => {
  const { t } = useTranslation()
  const { dialog } = request

  return (
    <div className={styles.stack}>
      <p className={styles.from}>{t('extensions.dialog.from', { name: request.extensionName })}</p>
      {dialog.kind === 'confirm' && dialog.body && <p className={styles.body}>{dialog.body}</p>}
      {dialog.kind === 'prompt' &&
        (dialog.multiline ? (
          <TextArea
            label={dialog.label}
            placeholder={dialog.placeholder}
            value={value}
            onChange={onValue}
          />
        ) : (
          <TextField
            label={dialog.label}
            placeholder={dialog.placeholder}
            value={value}
            autoFocus
            onChange={onValue}
          />
        ))}
      {dialog.kind === 'pick' && (
        <ChoiceField label={dialog.title} value={value} options={dialog.items} onPick={onValue} />
      )}
    </div>
  )
}

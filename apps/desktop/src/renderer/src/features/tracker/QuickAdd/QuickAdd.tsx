import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextField } from '@agentic-workstation/ui/TextField'

import styles from './QuickAdd.module.scss'
import type { QuickAddProps } from './QuickAdd.types'

/**
 * Быстрое добавление строкой, как в Todoist: имя и Enter - карточка готова, поле ждёт
 * следующую. Esc или уход из пустого поля - закрыть. Подробности - потом, в окне карточки.
 */
export const QuickAdd = ({ placeholder, onAdd, onClose }: QuickAddProps) => {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()

      return
    }

    if (event.key !== 'Enter' || event.nativeEvent.isComposing || !title.trim()) return

    event.preventDefault()
    void onAdd(title).then((added) => {
      if (added) setTitle('')
    })
  }
  const handleBlur = () => {
    if (!title.trim()) onClose()
  }

  return (
    <div className={styles.quickAdd} onMouseDown={(event) => event.stopPropagation()}>
      <TextField
        autoFocus
        hideLabel
        label={t('tracker.quickAdd.label')}
        placeholder={placeholder}
        value={title}
        onChange={setTitle}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  )
}

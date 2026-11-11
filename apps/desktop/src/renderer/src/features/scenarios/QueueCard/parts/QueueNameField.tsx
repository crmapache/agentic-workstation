import type { FocusEvent, KeyboardEvent } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextField } from '@agentic-workstation/ui/TextField'

import { QUEUE_NAME_MAX } from '../QueueCard.constants'
import styles from '../QueueCard.module.scss'
import type { QueueNameFieldProps } from '../QueueCard.types'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Поле имени на месте заголовка. Enter и уход фокуса - сохранить, Esc - отменить. Пустое имя
 * возвращает имя ИИ (он назовёт заново), прежнее - ничего: подтвердить имя ИИ не значит забрать
 * его себе, иначе ИИ перестал бы переименовывать очередь при новых сценариях.
 */
export const QueueNameField = ({ queue, onDone }: QueueNameFieldProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const [draft, setDraft] = useState(queue.name)
  // Enter снимает поле, и следующий за ним blur - не второй ответ.
  const isDone = useRef(false)

  const finish = (save: boolean) => {
    if (isDone.current) return

    isDone.current = true
    onDone()

    const name = draft.trim()

    if (save && name !== queue.name) void actions.queue(queue.id, { kind: 'rename', name })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter подтверждает иероглиф, Esc бросает недонабранный: это не ответ полю.
    if (event.nativeEvent.isComposing) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return

    event.preventDefault()
    event.stopPropagation()
    finish(event.key === 'Enter')
  }

  const handleBlur = () => finish(true)

  // Имя выделено целиком, как в любом поле переименования: набор заменяет его.
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()

  return (
    <div className={styles.nameField}>
      <TextField
        label={t('scenarios.queues.name.label')}
        hideLabel
        value={draft}
        maxLength={QUEUE_NAME_MAX}
        autoFocus
        onChange={setDraft}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
    </div>
  )
}

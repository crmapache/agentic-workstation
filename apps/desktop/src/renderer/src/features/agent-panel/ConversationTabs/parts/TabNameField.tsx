import type { MouseEvent, ChangeEvent, KeyboardEvent } from 'react'
import { useRef, useState, useLayoutEffect } from 'react'

import { OWN_TITLE_MAX } from '@shared/conversation'

import styles from '../ConversationTabs.module.scss'
import type { TabNameFieldProps } from '../ConversationTabs.types'

/**
 * Поле имени на месте имени вкладки (двойной клик или `/rename` без имени). Enter -
 * сохранить, Esc - отменить, уход фокуса - сохранить набранное. Все клавиши поля - его:
 * вкладка открывается по Enter и Space, а панель по Esc останавливает агента.
 */
export const TabNameField = ({ title, label, onDone }: TabNameFieldProps) => {
  const [value, setValue] = useState(title)
  const input = useRef<HTMLInputElement>(null)
  // Enter снимает поле, и следующий за ним blur - не второй ответ.
  const done = useRef(false)

  // Имя выделено целиком, как в любом поле переименования: набор заменяет его.
  useLayoutEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const finish = (name: string | null, byKey: boolean) => {
    if (done.current) return

    done.current = true
    onDone(name, byKey)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()

    // Enter подтверждает иероглиф, Esc бросает недонабранный: это не ответ полю.
    if (event.nativeEvent.isComposing) return

    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      finish(event.key === 'Enter' ? value : null, true)
    }
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)

  const handleBlur = () => finish(value, false)

  // Клик ставит каретку, а не выбирает вкладку; двойной - выделяет слово.
  const handleMouse = (event: MouseEvent<HTMLInputElement>) => event.stopPropagation()

  return (
    <input
      ref={input}
      className={styles.nameField}
      value={value}
      maxLength={OWN_TITLE_MAX}
      aria-label={label}
      spellCheck={false}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={handleMouse}
      onDoubleClick={handleMouse}
    />
  )
}

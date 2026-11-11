import type { IconButtonSize } from '../IconButton/IconButton.types'

export type HelpButtonProps = {
  /** Подпись кнопки - она же подсказка по наведению. */
  label: string
  /** Заголовок окна справки: о чём она. */
  title: string
  /** Пояснение. Абзацы - через пустую строку. */
  text: string
  closeLabel: string
  /** Размер кнопки: sm - шапки окна IDE, touch - телефон (под палец). */
  size?: IconButtonSize | undefined
}

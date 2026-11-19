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

/** Кусок абзаца справки: простой текст или адрес сайта, который открывается в браузере. */
export type HelpChunk = { kind: 'text' | 'url'; text: string }

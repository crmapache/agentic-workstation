import type { ReactNode, RefObject } from 'react'

export type ToastTone = 'neutral' | 'danger'

/** Крестик карточки: подпись, закрытие и, по желанию, самозакрытие с отсчётом. */
export type ToastClose = {
  /** Подпись крестика: подсказка и имя для скринридера («Close», «Later»). */
  label: string
  onClose: () => void
  /**
   * Через сколько миллисекунд карточка закроется сама (onClose): вокруг крестика тает кольцо,
   * мышь над карточкой ставит отсчёт на паузу. Нет - висит, пока не закроют: ошибка, вопрос,
   * предложение обновиться.
   */
  autoCloseMs?: number | undefined
}

export type ToastProps = {
  title: string
  description?: string | undefined
  tone?: ToastTone | undefined
  /** Доля готового от 0 до 1: под текстом встаёт полоса прогресса. */
  progress?: number | undefined
  /** Кнопки действий (Button). Рисуются в ряд под текстом. */
  actions?: ReactNode | undefined
  /** Крестик справа от заголовка. Нет - закрыть нельзя: идёт работа (скачивание обновления). */
  close?: ToastClose | undefined
}

export type ToastCloseButtonProps = {
  close: ToastClose
  /** Дуга кольца отсчёта: её анимацию ведёт useCountdown карточки. */
  arcRef: RefObject<SVGCircleElement | null>
}

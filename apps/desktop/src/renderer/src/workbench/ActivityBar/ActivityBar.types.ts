import type { ReactNode } from 'react'

import type { ViewDescriptor } from '../views/views.types'

export type ActivityBarProps<ViewId extends string> = {
  views: readonly ViewDescriptor<ViewId>[]
  activeViewId: ViewId
  /** Развёрнута ли область полосы: при свёрнутой ни одна иконка не горит. */
  isPanelOpen: boolean
  /** С какой стороны от своей области стоит полоса: подсказка встаёт в сторону области. */
  edge: 'start' | 'end'
  label: string
  /** Кнопки у нижнего края полосы, отдельно от видов: терминал под панелью. */
  footer?: ReactNode | undefined
  /**
   * Число на иконке вида - то, что ждёт человека (прогоны сценариев с вопросом). Ноль и
   * отсутствие - без значка: иконка не должна мигать пустым кругом.
   */
  badges?: Partial<Record<ViewId, number>> | undefined
  onSelect: (viewId: ViewId) => void
}

import type { Ref, ReactNode } from 'react'

import type { ViewDescriptor } from '../views/views.types'

export type SidePanelProps<ViewId extends string> = {
  views: readonly ViewDescriptor<ViewId>[]
  activeViewId: ViewId
  isOpen: boolean
  /** Ширина на экране - сохранённая или ужатая под место в окне. */
  width: number
  /** С какой стороны окна стоит панель. Ручка размера - у внутреннего края. */
  placement: 'start' | 'end'
  resizeLabel: string
  /** Под листом панели, во всю ширину колонки: терминал под GUI провайдера (ADR 0037). */
  dock?: ReactNode | undefined
  /** Открыто ли то, что под листом: колонка стоит и со свёрнутым листом. */
  isDockOpen?: boolean | undefined
  /** Изменение ширины панели в пикселях: плюс - шире. */
  onResize: (delta: number) => void
  /** Колонка панели - по ней Workbench мерит место в окне. */
  ref?: Ref<HTMLElement>
}

import type { Ref, ReactNode, MouseEventHandler } from 'react'

/**
 * fill - вкладки делят ряд поровну (проекты); fit - по подписи до потолка; grow -
 * полоса в несколько рядов (разговоры): вкладка растёт в свободный конец ряда до своей
 * полной подписи, подпись режется посередине с последним словом на месте, а подсказка
 * всплывает, только когда подпись обрезана.
 */
export type ClosableTabWidth = 'fill' | 'fit' | 'grow'

/** Вкладка позвала человека: успех, внимание, ошибка - цвет повода (роли состояний). */
export type ClosableTabCall = 'success' | 'attention' | 'danger'

export type ClosableTabProps = {
  label: string
  /** Подсказка над вкладкой: полный путь проекта, полный заголовок разговора. */
  hint: string
  active: boolean
  /** Подпись крестика для скринридера и подсказки: «Close agentic-workstation». */
  closeLabel: string
  /**
   * Перед подписью: точка состояния, знак форка. На выбранной tinted-вкладке им
   * доступен --tab-mark - полупрозрачный тон вкладки, которым нарисован и крестик.
   */
  leading?: ReactNode | undefined
  width?: ClosableTabWidth | undefined
  /**
   * Выбранная - тоном вкладок (--color-tab-selected), а не графитом: полоса разговоров,
   * где выбранную ищут взглядом среди многих.
   */
  tinted?: boolean | undefined
  /** Отступ слева ступенями: глубина форка в группе. */
  indent?: number | undefined
  /** Последняя вкладка группы, за которой идёт другая: зазор до соседней группы справа. */
  groupEnd?: boolean | undefined
  /** Вкладка позвала - светится цветом повода, пока её не откроют. */
  call?: ClosableTabCall | null | undefined
  /**
   * Когда вкладка позвала (мс): от него фаза света. Вкладки, позвавшие разом или
   * проснувшиеся вместе, иначе пускали бы блик и искры в такт - мигали бы одним сигналом.
   */
  callSince?: number | undefined
  /** Свечение замирает (засыпание без человека рядом): цвет остаётся, движения нет. */
  calm?: boolean | undefined
  /** Вкладку несут рукой: поднята над соседями, без задержки за курсором. */
  lifted?: boolean | undefined
  /** Сдвиг от своего места на время жеста (перетаскивание), в пикселях. */
  offset?: { x: number; y: number } | null | undefined
  /** Поле на месте подписи (переименование): пока оно есть, подпись не рисуется. */
  editor?: ReactNode | undefined
  ref?: Ref<HTMLDivElement> | undefined
  onMouseDown?: MouseEventHandler<HTMLDivElement> | undefined
  onDoubleClick?: MouseEventHandler<HTMLDivElement> | undefined
  onContextMenu?: MouseEventHandler<HTMLDivElement> | undefined
  onActivate: () => void
  onClose: () => void
}

export type CallLightProps = {
  call: ClosableTabCall | null
  since: number | undefined
}

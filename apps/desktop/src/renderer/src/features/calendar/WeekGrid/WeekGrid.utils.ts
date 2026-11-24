import type { CSSProperties } from 'react'

import type { DayBlock, ClashZone } from '../calendar.types'
import { percentOfDay } from '../calendar.utils'

/** Место встречи на колонке дня: верх и высота - доля суток, колонка среди соседей. */
export const blockStyle = (block: DayBlock): CSSProperties =>
  ({
    '--top': percentOfDay(block.startMinute),
    '--height': percentOfDay(block.endMinute - block.startMinute),
    '--column': block.column,
    '--columns': block.columns,
  }) as CSSProperties

/** Место зоны общего времени внутри блока встречи: доли его высоты. */
export const zoneStyle = (zone: ClashZone): CSSProperties =>
  ({ '--top': `${zone.top * 100}%`, '--height': `${zone.height * 100}%` }) as CSSProperties

/** Место рабочего времени на колонке дня. */
export const workStyle = (work: { from: number; to: number }): CSSProperties =>
  ({
    '--top': percentOfDay(work.from),
    '--height': percentOfDay(work.to - work.from),
  }) as CSSProperties

/** Место линии «сейчас». */
export const nowStyle = (minute: number): CSSProperties =>
  ({ '--top': percentOfDay(minute) }) as CSSProperties

/** Пометка состояния встречи словом: пунктир и зачёркивание без подписи непонятны. */
export const statusTagOf = (
  event: DayBlock['meeting']['event'],
): 'tentative' | 'declined' | 'cancelled' | null => {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.response === 'declined') return 'declined'
  if (event.status === 'tentative' || event.response === 'tentative') return 'tentative'

  return null
}

import type { CSSProperties } from 'react'

import type { DayBand, DayBlock } from '../calendar.types'
import { percentOfDay } from '../calendar.utils'

/** Место встречи на колонке дня: верх и высота - доля суток, колонка среди соседей. */
export const blockStyle = (block: DayBlock): CSSProperties =>
  ({
    '--top': percentOfDay(block.startMinute),
    '--height': percentOfDay(block.endMinute - block.startMinute),
    '--column': block.column,
    '--columns': block.columns,
  }) as CSSProperties

/** Место полосы общего времени накладки. */
export const bandStyle = (band: DayBand): CSSProperties =>
  ({
    '--top': percentOfDay(band.startMinute),
    '--height': percentOfDay(band.endMinute - band.startMinute),
  }) as CSSProperties

/** Место линии «сейчас». */
export const nowStyle = (minute: number): CSSProperties =>
  ({ '--top': percentOfDay(minute) }) as CSSProperties

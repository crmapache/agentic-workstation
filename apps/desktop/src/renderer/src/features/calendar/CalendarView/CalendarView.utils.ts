import type { CSSProperties } from 'react'

import type { CalendarMode, CalendarPeriod } from '../calendar.types'
import { fullDayLabel, monthDayLabel, monthYearLabel } from '../../../lib/dates.utils'

/**
 * Подпись периода: неделя - «Nov 23 - Nov 29», день - «Tue, Nov 24, 2026», месяц -
 * «November 2026».
 */
export const periodLabel = (mode: CalendarMode, period: CalendarPeriod): string => {
  if (mode === 'day') return fullDayLabel(period.from)
  if (mode === 'month') return monthYearLabel(period.month)

  return `${monthDayLabel(period.from)} - ${monthDayLabel(period.to - 1)}`
}

/** Ширина боковой панели, которую человек натянул ручкой; null - по умолчанию. */
export const sidebarStyle = (width: number | null): CSSProperties | undefined =>
  width === null ? undefined : ({ '--sidebar-width': `${width}px` } as CSSProperties)

/** Токен ширины в пикселях: токены календаря зарегистрированы длиной (@property). */
const tokenPixels = (style: CSSStyleDeclaration, token: string): number =>
  Number.parseFloat(style.getPropertyValue(token)) || 0

/**
 * Сколько места вид оставляет панели, если сетке дать её наименьшую ширину, px. Меряется по
 * самому виду: его ширина и токены календаря.
 */
export const roomBesideGrid = (view: HTMLElement): number =>
  Math.floor(view.clientWidth - tokenPixels(getComputedStyle(view), '--size-calendar-min'))

/** Ширина панели в пикселях: натянутая человеком или по умолчанию (токен). */
export const sidebarPixels = (view: HTMLElement, width: number | null): number =>
  width ?? tokenPixels(getComputedStyle(view), '--size-calendar-sources')

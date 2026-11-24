import type { CalendarState } from '@shared/calendar'

export type SidebarProps = {
  state: CalendarState
  /** Узкий вид: панель лежит поверх сетки, а не стоит рядом с ней. */
  floating: boolean
}

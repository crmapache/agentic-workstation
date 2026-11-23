import type { BarGroup, BarArrangement } from './bar-buttons.types'

/** Раскладка полосы, которую человек не трогал: порядок IDE, все кнопки на месте. */
export const DEFAULT_BAR_ARRANGEMENT: BarArrangement = { order: {}, hidden: [] }

/** Группы полосы сверху вниз: так они стоят в полосе и идут в меню. */
export const BAR_GROUPS: readonly BarGroup[] = ['top', 'bottom']

/** Ключ в localStorage. Версия в имени: сменилась форма - старое не подхватится. */
export const BAR_BUTTONS_STORAGE_KEY = 'agentic-workstation.bar-buttons.v1'

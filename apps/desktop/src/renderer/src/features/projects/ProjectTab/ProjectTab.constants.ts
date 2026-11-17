import type { ProjectCall, ProjectWork } from './ProjectTab.types'

/** Больше точек на вкладке не встаёт: дальше - счётчик «+N» старых. */
export const MAX_CALL_DOTS = 3

/** У проекта никто не зовёт: один пустой список на все вкладки, а не новый на каждую. */
export const NO_CALLS: readonly ProjectCall[] = []

/** Ничего не работает: общий пустой список, чтобы вкладка не перерисовывалась зря. */
export const NO_WORK: readonly ProjectWork[] = []

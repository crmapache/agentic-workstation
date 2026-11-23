import type { ActivityBarId } from '@shared/window'

/**
 * Группа кнопок полосы окна: виды сверху и кнопки, прижатые к низу (статистика и настройки,
 * терминал). Кнопка переставляется только внутри своей группы.
 */
export type BarGroup = 'top' | 'bottom'

/**
 * Что человек сделал с кнопками одной полосы (ADR 0112): свой порядок в каждой группе и
 * спрятанные. Тут же и id того, чего сейчас нет (вид выключенного расширения): вернётся - встанет
 * на своё место и останется спрятанным, если его прятали.
 */
export type BarArrangement = {
  order: Partial<Record<BarGroup, string[]>>
  hidden: string[]
}

/** Раскладки кнопок всех полос; полосы без своей - как задумано в IDE. */
export type BarArrangements = Partial<Record<ActivityBarId, BarArrangement>>

import type { MemorySaverState } from '@shared/memory-saver'

/** Что делает нажатие кнопки экономии: сменить режим или повторить текущий выбор. */
export type MemorySaverAction = 'toggle' | 'retry'

/** Запоздавший ответ на запрос не отменяет более новое событие из другого окна. */
export const newerMemorySaverState = (
  current: MemorySaverState | undefined,
  incoming: MemorySaverState,
): MemorySaverState => (current && current.revision > incoming.revision ? current : incoming)

/**
 * До загрузки выбора, при экономии, во время переключения и пока не вышел процесс после неудачной
 * остановки навигация не делает запросов. Остановка по простою или после сбоя её не снимает:
 * вопрос дождётся нового процесса в главном.
 */
export const editorServicesAvailable = (state: MemorySaverState | undefined): boolean =>
  state !== undefined && !state.enabled && !state.changing && state.definitions.failure !== 'stop'

/**
 * Процесс не остановился - нажатие повторяет тот же выбор: смена режима потребовала бы ещё одного
 * нажатия и ещё одной остановки, чтобы вернуться. Не записанный выбор - обычное переключение: оно
 * тоже пишет файл, а повтор при полном диске запер бы режим до перезапуска. Не дошёл сам вызов
 * (failedCall) - то же действие ещё раз.
 */
export const memorySaverAction = (
  state: MemorySaverState,
  failedCall?: MemorySaverAction,
): MemorySaverAction => (state.definitions.failure === 'stop' ? 'retry' : (failedCall ?? 'toggle'))

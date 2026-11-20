/**
 * Состояние собственного процесса редактора, а не процессов из терминалов и агентов. Причина:
 * start - процесс не запустился, crash - упал уже запущенный, stop - не вышел после остановки,
 * request - не ответил на вопрос.
 */
export type EditorServiceState = {
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  pid: number | null
  failure: 'start' | 'crash' | 'stop' | 'request' | null
}

/** Выбор общий для всех проектов и окон; сохранение и фактическая остановка видны отдельно. */
export type MemorySaverState = {
  revision: number
  enabled: boolean
  saved: boolean
  changing: boolean
  definitions: EditorServiceState
}

export type MemorySaverPrefs = { enabled: boolean }

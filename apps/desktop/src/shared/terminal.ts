/**
 * Вкладка терминала проекта: одна оболочка в псевдотерминале главного процесса (ADR 0037).
 * Живёт, пока её не закроют, пока оболочка не выйдет или пока закрыт проект.
 */
export type TerminalSession = {
  id: string
  projectId: string
  /** Номер вкладки в проекте: 1 - «Local», дальше «Local (2)», как в WebStorm. */
  ordinal: number
}

/**
 * Кусок вывода оболочки. end - сколько знаков сессия вывела всего, вместе с этим куском:
 * по нему окно, подключившееся к сессии заново, отбрасывает уже показанное.
 */
export type TerminalOutput = { sessionId: string; data: string; end: number }

/** Хвост вывода сессии для окна, которое подключается к уже живой оболочке. */
export type TerminalReplay = { data: string; end: number }

/** Итог «новая вкладка»: все сессии и новая; null - оболочка не запустилась. */
export type TerminalOpened = { sessions: TerminalSession[]; created: string | null }

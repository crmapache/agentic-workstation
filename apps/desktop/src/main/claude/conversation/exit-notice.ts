import type { NoticeCode } from '@shared/conversation-feed'

/** Что процесс знает о ходе, когда умер. */
export type ExitContext = {
  turnActive: boolean
  freshProcess: boolean
  meta: { stopRequestedAt: number | null }
}

/** Последняя непустая строка stderr - обычно сама причина («Session ID … is already in use»). */
export const lastLine = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? ''

/**
 * Отметка в ленте о выходе процесса. Остановил человек - «прервано»; умер, не начав
 * отвечать (флаг, сессия, вход), - «не запустился» с причиной из stderr; умер посреди
 * хода - «упал». Между ходами (сон, закрытие) - без отметки: ничего не потеряно.
 */
export const exitNotice = (
  context: ExitContext,
  code: number | null,
  stderrTail: string,
): { code: NoticeCode; detail: string } | null => {
  const reason = lastLine(stderrTail) || (code === null ? '' : String(code))

  if (context.meta.stopRequestedAt !== null && context.turnActive) {
    return { code: 'interrupted', detail: '' }
  }

  if (context.freshProcess) return { code: 'start-failed', detail: reason }
  if (context.turnActive) return { code: 'process-exited', detail: reason }

  return null
}

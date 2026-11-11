import type { TerminalOutput } from '@shared/terminal'

type OutputListener = (output: TerminalOutput) => void

/**
 * Вывод оболочек - не данные кэша, а поток в окно терминала: одна подписка на окно
 * (useTerminalSync) раздаёт куски по сессиям тем, кто их рисует. Сессия без слушателя
 * теряет кусок, и это не беда: её окно при появлении возьмёт хвост (terminal:replay).
 */
const listeners = new Map<string, OutputListener>()

export const listenOutput = (sessionId: string, listener: OutputListener): (() => void) => {
  listeners.set(sessionId, listener)

  return () => {
    if (listeners.get(sessionId) === listener) listeners.delete(sessionId)
  }
}

export const routeOutput = (output: TerminalOutput): void => {
  listeners.get(output.sessionId)?.(output)
}

/**
 * Новая часть куска, если показано уже всё до seen: перекрытие с хвостом (replay) и
 * повтор отбрасываются по счёту вывода сессии.
 */
export const unseenPart = (output: TerminalOutput, seen: number): string => {
  const start = output.end - output.data.length

  return output.end <= seen ? '' : output.data.slice(Math.max(0, seen - start))
}

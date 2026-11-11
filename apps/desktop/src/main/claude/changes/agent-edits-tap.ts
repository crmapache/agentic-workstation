import type { EditEntry } from './turn-edits'

type Listener = (edit: EditEntry) => void

const listeners = new Set<Listener>()

/**
 * Точные правки агентов из живых потоков CLI - тем, кто ждёт их вне разговоров: локальной
 * истории (ADR 0045) нужен структурный дифф правки, а лента держит его обрезанным. Отдельной
 * подпиской, а не через сервис разговоров: правка - факт потока, ему не нужен владелец.
 * Ответ - отписка.
 */
export const watchAgentEdits = (listener: Listener): (() => void) => {
  listeners.add(listener)

  return () => void listeners.delete(listener)
}

/** Правка из строки потока CLI (процесс разговора или субагента). */
export const announceAgentEdit = (edit: EditEntry): void => {
  for (const listener of listeners) listener(edit)
}

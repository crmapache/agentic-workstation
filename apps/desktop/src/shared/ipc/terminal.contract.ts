import type { TerminalOpened, TerminalOutput, TerminalReplay, TerminalSession } from '../terminal'

type SessionRequest = { sessionId: string }

/** Размер окна терминала в знаках: по нему оболочка переносит строки. */
type TerminalSize = { cols: number; rows: number }

/**
 * Часть контракта (contract.ts) про терминал IDE (ADR 0037): оболочки живут в главном
 * процессе, окно рисует их вывод и шлёт нажатия. Правила те же
 * (.claude/rules/ipc-contract.md).
 */
export type TerminalInvokeContract = {
  /** Живые сессии всех проектов. */
  'terminal:list': { request: void; response: TerminalSession[] }
  /** Новая оболочка в корне проекта. */
  'terminal:create': { request: { projectId: string } & TerminalSize; response: TerminalOpened }
  /** Закрыть вкладку: оболочка получает SIGHUP, её задачи - тоже. */
  'terminal:close': { request: SessionRequest; response: TerminalSession[] }
  /** Нажатия и вставка - в оболочку как есть. */
  'terminal:write': { request: SessionRequest & { data: string }; response: void }
  'terminal:resize': { request: SessionRequest & TerminalSize; response: void }
  /**
   * Хвост вывода для подключения к живой сессии (окно перезагрузилось). Заодно снимает
   * паузу вывода: всё до этого места окно считает показанным. null - сессии нет.
   */
  'terminal:replay': { request: SessionRequest; response: TerminalReplay | null }
  /**
   * Окно дорисовало столько знаков. Без этого главный процесс ставит оболочку на паузу,
   * когда показанное отстаёт: поток вроде `yes` иначе забил бы окно.
   */
  'terminal:ack': { request: SessionRequest & { chars: number }; response: void }
}

export type TerminalEventContract = {
  'terminal:output': TerminalOutput
  /** Набор сессий стал другим: оболочка вышла, проект закрыт. */
  'terminal:sessions': TerminalSession[]
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const TERMINAL_CHANNELS = {
  'terminal:list': true,
  'terminal:create': true,
  'terminal:close': true,
  'terminal:write': true,
  'terminal:resize': true,
  'terminal:replay': true,
  'terminal:ack': true,
} satisfies Record<keyof TerminalInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const TERMINAL_EVENTS = {
  'terminal:output': true,
  'terminal:sessions': true,
} satisfies Record<keyof TerminalEventContract, true>

import type {
  TrackerOp,
  CloudState,
  TrackerBoard,
  TrackerOutcome,
  CloudKeyOutcome,
  TrackerSendOutcome,
  TrackerSendRequest,
} from '../tracker'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про трекер задач (ADR 0101) и облако IDE (ADR 0102).
 * Правила - .claude/rules/ipc-contract.md.
 */
export type TrackerInvokeContract = {
  /** Доска открытого проекта; первый взгляд заводит её, если её ещё не было. */
  'tracker:board': { request: ProjectRequest; response: TrackerBoard }
  /** Правка доски; ответ - новая доска или код отказа. */
  'tracker:apply': { request: ProjectRequest & { op: TrackerOp }; response: TrackerOutcome }
  /** Отправить группу или карточку в очередь сценариев. */
  'tracker:send': {
    request: ProjectRequest & TrackerSendRequest
    response: TrackerSendOutcome
  }
  'cloud:state': { request: void; response: CloudState }
  /** Ключ аккаунта показывает системное окно главного процесса: окно IDE его не видит. */
  'cloud:copyKey': { request: void; response: CloudState }
  /** Ключ с другого компьютера: доска сольётся с его облаком. */
  'cloud:useKey': { request: { key: string }; response: CloudKeyOutcome }
  'cloud:setEnabled': { request: { enabled: boolean }; response: CloudState }
  /** Ключ потерян и вернуть его нечем: новый аккаунт (после «да» в системном окне). */
  'cloud:startOver': { request: void; response: CloudKeyOutcome }
}

export type TrackerEventContract = {
  /** Доска проекта поменялась: своя правка, облако, ИИ или очередь сценариев. */
  'tracker:changed': TrackerBoard
  'cloud:changed': CloudState
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const TRACKER_CHANNELS = {
  'tracker:board': true,
  'tracker:apply': true,
  'tracker:send': true,
  'cloud:state': true,
  'cloud:copyKey': true,
  'cloud:useKey': true,
  'cloud:setEnabled': true,
  'cloud:startOver': true,
} satisfies Record<keyof TrackerInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const TRACKER_EVENTS = {
  'tracker:changed': true,
  'cloud:changed': true,
} satisfies Record<keyof TrackerEventContract, true>

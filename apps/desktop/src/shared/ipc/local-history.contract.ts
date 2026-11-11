import type {
  HistoryList,
  HistoryChange,
  HistoryContent,
  HistoryRestoreOutcome,
} from '../local-history'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про локальную историю файлов (ADR 0045). Отдельным файлом по
 * области; в InvokeContract и INVOKE_CHANNELS входит целиком (.claude/rules/ipc-contract.md).
 */
export type LocalHistoryInvokeContract = {
  /** История файла или всего в папке (путь от корня, '' - весь проект): новые сверху. */
  'history:list': { request: ProjectRequest & { path: string }; response: HistoryList }
  /** Содержимое версии по ключу; ключ - только из истории этого проекта. */
  'history:content': { request: ProjectRequest & { key: string }; response: HistoryContent }
  /** Вернуть файлу path версию key; удалённый файл появится снова. */
  'history:restore': {
    request: ProjectRequest & { path: string; key: string }
    response: HistoryRestoreOutcome
  }
}

export type LocalHistoryEventContract = {
  /** В истории проекта появились события: открытая история перечитывается. */
  'history:changed': HistoryChange
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const LOCAL_HISTORY_CHANNELS = {
  'history:list': true,
  'history:content': true,
  'history:restore': true,
} satisfies Record<keyof LocalHistoryInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const LOCAL_HISTORY_EVENTS = {
  'history:changed': true,
} satisfies Record<keyof LocalHistoryEventContract, true>

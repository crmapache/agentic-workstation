import type { ModelConnection, ModelConnectionKind } from '../open-models'

/** Подключения панели открытых моделей и можно ли хранить ключи (шифрование IDE доступно). */
export type OpenModelsConnections = { connections: ModelConnection[]; canStoreKeys: boolean }

/** Новое подключение или правка: ключ null - убрать, нет - не трогать. */
export type ConnectionRequest = {
  kind?: ModelConnectionKind
  label?: string
  baseUrl?: string
  key?: string | null
}

/**
 * Часть контракта (contract.ts) про подключения панели открытых моделей (ADR 0084,
 * docs/plan-providers/40-open-models.md). Ключ подключения окно отдаёт, но обратно не получает
 * никогда - только есть ли он.
 */
export type OpenModelsInvokeContract = {
  'openModels:getConnections': { request: void; response: OpenModelsConnections }
  /** Пробовать все подключения заново: Ollama или LM Studio могли запустить. */
  'openModels:refreshConnections': { request: void; response: OpenModelsConnections }
  'openModels:addConnection': { request: ConnectionRequest; response: OpenModelsConnections }
  'openModels:updateConnection': {
    request: ConnectionRequest & { id: string }
    response: OpenModelsConnections
  }
  'openModels:removeConnection': { request: { id: string }; response: OpenModelsConnections }
}

export type OpenModelsEventContract = {
  /** Подключения поменялись: проба ответила, человек добавил или убрал. */
  'openModels:connections': OpenModelsConnections
}

export const OPEN_MODELS_CHANNELS = {
  'openModels:getConnections': true,
  'openModels:refreshConnections': true,
  'openModels:addConnection': true,
  'openModels:updateConnection': true,
  'openModels:removeConnection': true,
} satisfies Record<keyof OpenModelsInvokeContract, true>

export const OPEN_MODELS_EVENTS = {
  'openModels:connections': true,
} satisfies Record<keyof OpenModelsEventContract, true>

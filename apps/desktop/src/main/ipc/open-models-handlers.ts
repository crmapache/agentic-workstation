import type { ModelConnectionKind } from '@shared/open-models'
import type { ConnectionRequest } from '@shared/ipc/open-models.contract'
import type { OpenModelsInvokeContract } from '@shared/ipc/open-models.contract'

import type { OpenModelsService } from '../opencode/opencode-service'
import type { ConnectionInput } from '../opencode/connections/connection-store'
import type { InvokeHandlers } from './handle'
import { assertOneOf, assertString } from './validate'

type OpenModelsChannels = keyof OpenModelsInvokeContract

const KINDS: readonly ModelConnectionKind[] = ['ollama', 'lmstudio', 'openrouter', 'custom']

/** Длиннее этого имя, адрес или ключ подключения не бывает - что-то вставили не то. */
const MAX_FIELD = 2_000

const field = (value: unknown, name: string): string => {
  assertString(value, name)

  if (value.length > MAX_FIELD) throw new Error(`Слишком длинно: ${name}`)

  return value
}

/** id подключения: найденные (`ollama`, `lmstudio`) или 12 шестнадцатеричных цифр. */
const connectionId = (value: unknown): string => {
  assertString(value, 'id')

  if (!/^(ollama|lmstudio|[0-9a-f]{12})$/.test(value)) throw new Error('Неизвестное подключение')

  return value
}

/** Адрес подключения - только http(s): file:, javascript: и прочее процессу не уходит. */
const baseUrl = (value: unknown): string => {
  const url = field(value, 'baseUrl').trim()

  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Адрес - только http или https')

  return url
}

/** Подключение из окна: что не передано - не меняется, ключ null - убрать. */
const connectionInput = (request: ConnectionRequest): ConnectionInput => {
  const input: ConnectionInput = {}

  if (request.kind !== undefined) input.kind = assertOneOf(request.kind, KINDS, 'kind')
  if (request.label !== undefined) input.label = field(request.label, 'label')
  if (request.baseUrl !== undefined) input.baseUrl = baseUrl(request.baseUrl)
  if (request.key !== undefined) input.key = request.key === null ? null : field(request.key, 'key')

  return input
}

/** Каналы подключений панели открытых моделей (ADR 0084): ключ из окна - туда, обратно - нет. */
export const createOpenModelsHandlers = (
  service: OpenModelsService,
): Pick<InvokeHandlers, OpenModelsChannels> => ({
  'openModels:getConnections': () => service.connectionsState(),
  'openModels:refreshConnections': () => service.refreshConnections(),
  'openModels:addConnection': (request) => {
    const input = connectionInput(request)

    if (input.kind === 'custom' && !input.baseUrl) throw new Error('Нужен адрес подключения')

    return service.addConnection(input)
  },
  'openModels:updateConnection': (request) =>
    service.updateConnection(connectionId(request.id), connectionInput(request)),
  'openModels:removeConnection': ({ id }) => service.removeConnection(connectionId(id)),
})

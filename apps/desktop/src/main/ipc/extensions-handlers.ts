import { shell } from 'electron'

import type { UiEvent, UiValues } from '@shared/extension-ui'
import type { ExtensionsInvokeContract } from '@shared/ipc/extensions.contract'

import type { ExtensionsRuntime } from '../extensions/extensions-setup'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type ExtensionsChannels = keyof ExtensionsInvokeContract

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const valuesOf = (value: unknown): UiValues => {
  if (!isRecord(value)) throw new Error('Ожидались значения полей вида')

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 500)
      .filter(
        (entry): entry is [string, string | boolean] =>
          typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
      ),
  )
}

/** Событие вида из окна: только два вида, значения - строки и флажки. */
const uiEventOf = (value: unknown): UiEvent => {
  if (!isRecord(value)) throw new Error('Ожидалось событие вида')

  const values = valuesOf(value['values'])

  if (value['kind'] === 'action') {
    assertString(value['action'], 'action')

    return { kind: 'action', action: value['action'], values }
  }

  if (value['kind'] === 'change') {
    assertString(value['name'], 'name')

    const changed = value['value']

    if (typeof changed !== 'string' && typeof changed !== 'boolean')
      throw new Error('Ожидалось значение поля')

    return { kind: 'change', name: value['name'], value: changed, values }
  }

  throw new Error('Незнакомое событие вида')
}

/** Каналы расширений IDE (ADR 0091): проверить запрос окна и позвать сервис. */
export const createExtensionsHandlers = (
  extensions: ExtensionsRuntime,
): Pick<InvokeHandlers, ExtensionsChannels> => {
  const { service, authoring } = extensions

  return {
    'extensions:get': () => service.state(),
    'extensions:views': () => service.views(),
    'extensions:setEnabled': ({ id, enabled }) => {
      assertString(id, 'id')

      if (typeof enabled !== 'boolean') throw new Error('Ожидалось да или нет в поле enabled')

      return service.setEnabled(id, enabled)
    },
    'extensions:approve': ({ id }) => {
      assertString(id, 'id')

      return service.approve(id)
    },
    'extensions:reload': ({ id }) => {
      assertString(id, 'id')

      return service.reloadOne(id)
    },
    'extensions:remove': ({ id }) => {
      assertString(id, 'id')

      return service.remove(id)
    },
    'extensions:setSetting': ({ id, key, value }) => {
      assertString(id, 'id')
      assertString(key, 'key')

      if (typeof value !== 'string' && typeof value !== 'boolean')
        throw new Error('Ожидалось значение настройки')

      return service.setSetting(id, key, value)
    },
    'extensions:logs': ({ id }) => {
      assertString(id, 'id')

      return service.logsOf(id)
    },
    'extensions:clearLogs': ({ id }) => {
      assertString(id, 'id')

      return service.clearLogs(id)
    },
    'extensions:runCommand': async ({ key }) => {
      assertString(key, 'key')
      // Ответ команды окну не нужен, а её ошибка - в журнале расширения.
      await service.runCommand(key).catch(() => undefined)
    },
    'extensions:viewEvent': async ({ key, event }) => {
      assertString(key, 'key')
      await service.viewEvent(key, uiEventOf(event)).catch(() => undefined)
    },
    'extensions:statusClick': async ({ key }) => {
      assertString(key, 'key')
      await service.statusClick(key).catch(() => undefined)
    },
    'extensions:answerDialog': ({ requestId, answer }) => {
      assertString(requestId, 'requestId')

      if (answer !== null && typeof answer !== 'string' && typeof answer !== 'boolean') {
        throw new Error('Ожидался ответ на вопрос')
      }

      service.answerDialog(requestId, answer)
    },
    'extensions:pendingDialogs': () => service.pendingDialogs(),
    'extensions:answerEditor': ({ requestId, answer }) => {
      assertString(requestId, 'requestId')
      service.answerEditor(requestId, answer)
    },
    'extensions:create': async ({ name, request, provider }) => {
      assertString(name, 'name')
      assertString(request, 'request')
      assertString(provider, 'provider')

      const error = await authoring.create(name, request, provider)

      return error
        ? { ok: false, error, state: service.state() }
        : { ok: true, state: service.state() }
    },
    'extensions:editWithAi': async ({ id, request, provider }) => {
      assertString(id, 'id')
      assertString(request, 'request')
      assertString(provider, 'provider')

      const name = service.state().extensions.find((item) => item.id === id)?.manifest?.name ?? id
      const error = await authoring.edit(id, name, request, provider)

      return error
        ? { ok: false, error, state: service.state() }
        : { ok: true, state: service.state() }
    },
    'extensions:reveal': async ({ id }) => {
      if (id !== null) assertString(id, 'id')

      const dir =
        id === null
          ? service.state().root
          : service.state().extensions.find((item) => item.id === id)?.dir

      if (dir) await shell.openPath(dir)
    },
  }
}

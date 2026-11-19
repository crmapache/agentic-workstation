import type { ModelConnection } from '@shared/open-models'

import type { ModelProxy } from '../connections/model-proxy'
import { openAiBaseUrl, providersConfig } from '../connections/opencode-config'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import type { OpenCodeLaunch } from './opencode-conversation'
import type { InstructionsSetup } from './opencode-instructions'
import { isCompactWindow, instructionsSetup } from './opencode-instructions'

/**
 * Конфиг OpenCode для процесса разговора (ADR 0084, конфиг второй версии): подключения и их
 * модели (`providers`), модель по умолчанию, коннекторы IDE (`mcp.servers` - серверы шлюза с
 * ключом процесса), указания (`instructions`, `policies` - opencode-instructions.ts) и то, что
 * IDE не нужно: обновления и публикация разговоров выключены. Конфиг уходит процессу строкой в
 * окружении, на диск не ложится.
 */
export const launchConfig = (input: {
  providers: Record<string, unknown>
  model: string | null
  connectors: GatewayLaunch | null
  instructions?: InstructionsSetup['config']
}): string =>
  JSON.stringify({
    share: 'disabled',
    update: 'disable',
    ...input.instructions,
    providers: input.providers,
    ...(input.model && { model: input.model }),
    ...(input.connectors && {
      mcp: {
        servers: Object.fromEntries(
          input.connectors.servers.map((entry) => [
            entry.name,
            {
              type: 'remote',
              url: entry.url,
              headers: { Authorization: `Bearer ${input.connectors?.token ?? ''}` },
              oauth: false,
              // Code Mode (ADR 0088): описания инструментов не лежат в каждом запросе, модель
              // находит нужный поиском и зовёт кодом в `execute`. Иначе коннекторы проекта
              // занимали половину окна локальной модели ещё до первого слова. Лента и вопрос
              // разрешения показывают вызов из кода им самим (feed/code-mode.ts).
              codemode: true,
            },
          ]),
        ),
      },
    }),
  })

/** Что нужно, чтобы собрать запуск процесса OpenCode в проекте. */
export type LaunchInput = {
  connections: readonly ModelConnection[]
  hasKey: (connectionId: string) => boolean
  proxy: ModelProxy
  connectors: GatewayLaunch | null
  model: string | null
  /** Папка, где процесс работает: её CLAUDE.md - правила компактного набора. */
  directory: string
  /** Окно модели, на которой процесс поднимается; 0 - неизвестно. */
  window: number
}

/**
 * Запуск процесса OpenCode: конфиг, коннекторы, имена серверов и отзыв. Подключения с ключом
 * идут через прокси IDE с ключом этого процесса (настоящий ключ процессу не достаётся), без
 * ключа - прямо на свой адрес. Свои серверы IDE «разрешено всегда» (`mcp__<сервер>`) -
 * действиями OpenCode `<сервер>_*`. Модели с маленьким окном - компактные указания (ADR 0089).
 */
export const openCodeLaunch = async (input: LaunchInput): Promise<OpenCodeLaunch> => {
  const keyed = input.connections
    .filter((connection) => input.hasKey(connection.id))
    .map((connection) => connection.id)
  const lease = keyed.length > 0 ? input.proxy.lease(keyed) : null
  const proxied = new Map(
    await Promise.all(keyed.map(async (id) => [id, await input.proxy.baseUrlOf(id)] as const)),
  )
  const { connectors } = input
  const compact = isCompactWindow(input.window)
  const instructions = await instructionsSetup(input.directory, compact)

  return {
    config: launchConfig({
      providers: providersConfig(input.connections, (connection) => {
        const baseURL = proxied.get(connection.id)

        return baseURL && lease
          ? { baseURL, apiKey: lease.token }
          : { baseURL: openAiBaseUrl(connection) }
      }),
      model: input.model,
      connectors,
      instructions: instructions.config,
    }),
    connectors,
    servers: connectors?.servers.map((entry) => entry.name) ?? [],
    allowedActions: (connectors?.allowed ?? [])
      .filter((rule) => rule.startsWith('mcp__'))
      .map((rule) => `${rule.slice('mcp__'.length)}_*`),
    env: instructions.env,
    compact,
    release: () => lease?.release(),
  }
}

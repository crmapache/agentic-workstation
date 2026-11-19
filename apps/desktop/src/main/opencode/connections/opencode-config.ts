import type { ModelConnection } from '@shared/open-models'
import { REASONING_LEVELS } from '@shared/open-models'

import { FALLBACK_OUTPUT, FALLBACK_CONTEXT } from './connections.constants'

/** Адрес в формате OpenAI: у Ollama и LM Studio - `/v1` к их адресу, у прочих - как есть. */
export const openAiBaseUrl = (connection: Pick<ModelConnection, 'kind' | 'baseUrl'>): string => {
  const base = connection.baseUrl.replace(/\/+$/, '')

  return connection.kind === 'ollama' || connection.kind === 'lmstudio' ? `${base}/v1` : base
}

/** Куда процесс OpenCode ходит за моделями подключения: адрес и ключ (нет - без ключа). */
export type ProviderEndpoint = { baseURL: string; apiKey?: string }

/**
 * Модели подключений - разделом `providers` конфига OpenCode второй версии: у каждого
 * подключения свой провайдер в формате OpenAI (`@ai-sdk/openai-compatible`), его id - id
 * подключения, модели - те, что ответила проба, с умением инструментов и окном. Куда ходить -
 * решает endpoint: подключение с ключом идёт через прокси IDE (настоящий ключ процессу не
 * отдаётся). Подключение, которое сейчас не отвечает, в конфиг не идёт.
 */
export const providersConfig = (
  connections: readonly ModelConnection[],
  endpoint: (connection: ModelConnection) => ProviderEndpoint,
): Record<string, unknown> =>
  Object.fromEntries(
    connections
      .filter((connection) => connection.state === 'ok' && connection.models.length > 0)
      .map((connection) => [
        connection.id,
        {
          name: connection.label,
          package: '@ai-sdk/openai-compatible',
          settings: endpoint(connection),
          models: Object.fromEntries(
            connection.models.map((model) => [
              model.id,
              {
                name: model.name,
                // Неизвестно - не «нет»: свой адрес умений не называет, а модель может уметь.
                capabilities: { tools: model.tools !== false },
                limit: {
                  context: model.context ?? FALLBACK_CONTEXT,
                  output: Math.min(FALLBACK_OUTPUT, model.context ?? FALLBACK_OUTPUT),
                },
                // Рассуждающей модели - уровни усилия вариантами: их выбирает меню Effort.
                ...(model.reasoning && {
                  variants: REASONING_LEVELS.map((level) => ({
                    id: level,
                    settings: { reasoningEffort: level },
                  })),
                }),
              },
            ]),
          ),
        },
      ]),
  )

/** Модель панели (`<подключение>/<модель>`) - ссылкой OpenCode; чужая форма - null. */
export const modelRefOf = (value: string): { providerID: string; id: string } | null => {
  const slash = value.indexOf('/')

  return slash > 0 && slash < value.length - 1
    ? { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
    : null
}

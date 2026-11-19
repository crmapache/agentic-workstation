import type {
  ConnectionModel,
  ConnectionState,
  ConnectionCredits,
  ModelConnectionKind,
} from '@shared/open-models'

import { PROBE_TIMEOUT_MS } from './connections.constants'

/** Что знает проба о подключении: вид, адрес и ключ (пусто - без ключа). */
export type ProbeTarget = { kind: ModelConnectionKind; baseUrl: string; key: string }

export type ProbeResult = {
  state: ConnectionState
  error: string
  models: ConnectionModel[]
  credits: ConnectionCredits | null
}

type Fetch = typeof fetch

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const field = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined)

/** Сервер не ответил вовсе (не запущен, нет сети) - не сбой, а «не на месте». */
class Offline extends Error {}

/** Ключ не принят (401, 403). */
class Unauthorized extends Error {}

const trimmed = (url: string) => url.replace(/\/+$/, '')

const getJson = async (
  fetcher: Fetch,
  url: string,
  key: string,
  body?: unknown,
): Promise<unknown> => {
  const response = await fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(key && { authorization: `Bearer ${key}` }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Offline(error instanceof Error ? error.message : String(error))
  })

  if (response.status === 401 || response.status === 403) throw new Unauthorized()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  return response.json()
}

/**
 * Ollama: список (`/api/tags`), у каждой модели - `/api/show`: умения (`tools`; без
 * `completion` - модель векторов, не для разговора) и окно контекста из `model_info`.
 */
const ollamaModels = async (fetcher: Fetch, base: string): Promise<ConnectionModel[]> => {
  const tags = records(field(await getJson(fetcher, `${base}/api/tags`, ''), 'models'))
  const models = await Promise.all(
    tags.map(async (tag): Promise<ConnectionModel | null> => {
      const name = text(tag, 'name') || text(tag, 'model')
      const show = await getJson(fetcher, `${base}/api/show`, '', { model: name }).catch(() => null)
      const capabilities = strings(field(show, 'capabilities'))
      const info = field(show, 'model_info')
      const context = isRecord(info)
        ? Object.entries(info).find(([key]) => key.endsWith('.context_length'))?.[1]
        : undefined

      if (capabilities.length > 0 && !capabilities.includes('completion')) return null

      return {
        id: name,
        name,
        tools: capabilities.length > 0 ? capabilities.includes('tools') : null,
        reasoning: capabilities.length > 0 ? capabilities.includes('thinking') : null,
        context: count(context),
      }
    }),
  )

  return models.filter((model) => model !== null)
}

/**
 * LM Studio: свой список (`/api/v0/models`) - вид модели, окно и умение `tool_use`; модели
 * векторов не для разговора. Старый LM Studio без него - список OpenAI, умения неизвестны.
 */
const lmStudioModels = async (fetcher: Fetch, base: string): Promise<ConnectionModel[]> => {
  const native = await getJson(fetcher, `${base}/api/v0/models`, '').catch((error: unknown) => {
    if (error instanceof Offline) throw error

    return null
  })

  if (native === null) return openAiModels(fetcher, `${base}/v1`, '')

  return records(field(native, 'data'))
    .filter((model) => text(model, 'type') !== 'embeddings')
    .map((model) => ({
      id: text(model, 'id'),
      name: text(model, 'id'),
      tools: Array.isArray(model['capabilities'])
        ? strings(model['capabilities']).includes('tool_use')
        : null,
      reasoning: null,
      context: count(model['max_context_length']),
    }))
}

/** Расход ключа OpenRouter (`/key`): сколько потрачено и лимит; не сказал - null. */
const creditsOf = (body: unknown): ConnectionCredits | null => {
  const data = field(body, 'data')
  const used = field(data, 'usage')
  const limit = field(data, 'limit')

  return typeof used === 'number' ? { used, limit: typeof limit === 'number' ? limit : null } : null
}

/** OpenRouter: ключ (`/key` - он же расход) и каталог с умениями и окном. */
const openRouter = async (
  fetcher: Fetch,
  base: string,
  key: string,
): Promise<{ models: ConnectionModel[]; credits: ConnectionCredits | null }> => {
  if (!key) throw new Unauthorized()

  const credits = creditsOf(await getJson(fetcher, `${base}/key`, key))
  const models = records(field(await getJson(fetcher, `${base}/models`, key), 'data')).map(
    (model) => ({
      id: text(model, 'id'),
      name: text(model, 'name') || text(model, 'id'),
      tools: strings(model['supported_parameters']).includes('tools'),
      reasoning: strings(model['supported_parameters']).includes('reasoning'),
      context: count(model['context_length']),
    }),
  )

  return { models, credits }
}

/** Свой адрес в формате OpenAI: только список (`/models`), умения неизвестны. */
const openAiModels = async (
  fetcher: Fetch,
  base: string,
  key: string,
): Promise<ConnectionModel[]> =>
  records(field(await getJson(fetcher, `${base}/models`, key), 'data')).map((model) => ({
    id: text(model, 'id'),
    name: text(model, 'id'),
    tools: null,
    reasoning: null,
    context: count(model['context_length'] ?? model['max_context_length']),
  }))

/**
 * Проба подключения: модели для меню и что с подключением. Не ответил вовсе - offline (у
 * локального сервера это «не запущен»), ключ не принят - unauthorized, прочее - failed со
 * словами сбоя. Модели без имени не в счёт.
 */
export const probeConnection = async (
  target: ProbeTarget,
  fetcher: Fetch = fetch,
): Promise<ProbeResult> => {
  const base = trimmed(target.baseUrl)

  try {
    const found =
      target.kind === 'ollama'
        ? { models: await ollamaModels(fetcher, base), credits: null }
        : target.kind === 'lmstudio'
          ? { models: await lmStudioModels(fetcher, base), credits: null }
          : target.kind === 'openrouter'
            ? await openRouter(fetcher, base, target.key)
            : { models: await openAiModels(fetcher, base, target.key), credits: null }

    return {
      state: 'ok',
      error: '',
      models: found.models.filter((model) => model.id !== ''),
      credits: found.credits,
    }
  } catch (error) {
    const empty = { models: [], credits: null }

    if (error instanceof Unauthorized) return { state: 'unauthorized', error: '', ...empty }
    if (error instanceof Offline) return { state: 'offline', error: error.message, ...empty }

    return {
      state: 'failed',
      error: error instanceof Error ? error.message : String(error),
      ...empty,
    }
  }
}

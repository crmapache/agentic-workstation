import type {
  ConnectionModel,
  ConnectionState,
  ConnectionCredits,
  ModelConnectionKind,
} from '@shared/open-models'

import { LOAD_TIMEOUT_MS, PROBE_TIMEOUT_MS } from './connections.constants'
import type { ServerWindow, OllamaWindowFacts } from './ollama-window'
import { isWindowSure, ollamaWindow, ownContextOf, learnServerWindow } from './ollama-window'

/** Что знает проба о подключении: вид, адрес и ключ (пусто - без ключа). */
export type ProbeTarget = { kind: ModelConnectionKind; baseUrl: string; key: string }

export type ProbeResult = {
  state: ConnectionState
  error: string
  models: ConnectionModel[]
  credits: ConnectionCredits | null
  /** Окно сервера Ollama по умолчанию, выведенное из загруженных моделей (ollama-window.ts). */
  serverWindow: ServerWindow
  /** Модели, чьё окно - догадка: загрузи - и сервер его назовёт. */
  unsure: readonly string[]
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
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<unknown> => {
  const response = await fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(key && { authorization: `Bearer ${key}` }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    throw new Offline(error instanceof Error ? error.message : String(error))
  })

  if (response.status === 401 || response.status === 403) throw new Unauthorized()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  return response.json()
}

/** Окна загруженных моделей Ollama (`/api/ps`) по имени; не ответил - ничего не загружено. */
const loadedWindows = async (fetcher: Fetch, base: string): Promise<Map<string, number>> => {
  const loaded = await getJson(fetcher, `${base}/api/ps`, '').catch(() => null)

  return new Map(
    records(field(loaded, 'models')).flatMap((model) => {
      const name = text(model, 'name') || text(model, 'model')
      const tokens = count(model['context_length'])

      return name && tokens !== null ? [[name, tokens] as const] : []
    }),
  )
}

type OllamaFound = Pick<ProbeResult, 'models' | 'serverWindow' | 'unsure'>

/**
 * Ollama: список (`/api/tags`), у каждой модели - `/api/show`: умения (`tools`; без
 * `completion` - модель векторов, не для разговора), предел окна из `model_info` и своё
 * num_ctx. Окно в меню и конфиге - то, с которым сервер держит модель (ollama-window.ts):
 * загруженные (`/api/ps`) учат окну сервера, learned - что знали до этой пробы.
 */
const ollamaModels = async (
  fetcher: Fetch,
  base: string,
  learned: ServerWindow,
): Promise<OllamaFound> => {
  const [list, loaded] = await Promise.all([
    getJson(fetcher, `${base}/api/tags`, ''),
    loadedWindows(fetcher, base),
  ])
  const found = await Promise.all(
    records(field(list, 'models')).map(async (tag) => {
      const name = text(tag, 'name') || text(tag, 'model')
      const show = await getJson(fetcher, `${base}/api/show`, '', { model: name }).catch(() => null)
      const capabilities = strings(field(show, 'capabilities'))
      const info = field(show, 'model_info')
      const parameters = field(show, 'parameters')
      const max = isRecord(info)
        ? Object.entries(info).find(([key]) => key.endsWith('.context_length'))?.[1]
        : undefined

      if (capabilities.length > 0 && !capabilities.includes('completion')) return null

      const facts: OllamaWindowFacts = {
        max: count(max),
        own: typeof parameters === 'string' ? ownContextOf(parameters) : null,
        loaded: loaded.get(name) ?? null,
      }

      return {
        facts,
        model: {
          id: name,
          name,
          tools: capabilities.length > 0 ? capabilities.includes('tools') : null,
          reasoning: capabilities.length > 0 ? capabilities.includes('thinking') : null,
        },
      }
    }),
  )
  const chat = found.filter((entry) => entry !== null)
  const serverWindow = learnServerWindow(
    chat.map((entry) => entry.facts),
    learned,
  )

  return {
    models: chat.map(({ model, facts }) => ({
      ...model,
      context: ollamaWindow(facts, serverWindow),
    })),
    serverWindow,
    unsure: chat
      .filter(({ facts }) => !isWindowSure(facts, serverWindow))
      .map(({ model }) => model.id),
  }
}

/**
 * Загрузить модель Ollama (`/api/generate` без промпта): тогда `/api/ps` назовёт её окно. Это та
 * же загрузка, что сделал бы первый запрос OpenCode, - лишнего ожидания нет.
 */
export const loadOllamaModel = async (
  baseUrl: string,
  model: string,
  fetcher: Fetch = fetch,
): Promise<void> => {
  await getJson(fetcher, `${trimmed(baseUrl)}/api/generate`, '', { model }, LOAD_TIMEOUT_MS)
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

/** Чего не знают подключения, кроме Ollama: окна сервера и догадок об окне у них нет. */
const NO_WINDOWS = { serverWindow: null, unsure: [] }

/**
 * Проба подключения: модели для меню и что с подключением. Не ответил вовсе - offline (у
 * локального сервера это «не запущен»), ключ не принят - unauthorized, прочее - failed со
 * словами сбоя. Модели без имени не в счёт. learned - окно сервера Ollama с прошлой пробы;
 * не ответил - оно забывается: поднятый заново сервер мог взять другое.
 */
export const probeConnection = async (
  target: ProbeTarget,
  fetcher: Fetch = fetch,
  learned: ServerWindow = null,
): Promise<ProbeResult> => {
  const base = trimmed(target.baseUrl)

  try {
    const found =
      target.kind === 'ollama'
        ? { ...(await ollamaModels(fetcher, base, learned)), credits: null }
        : target.kind === 'lmstudio'
          ? { models: await lmStudioModels(fetcher, base), credits: null, ...NO_WINDOWS }
          : target.kind === 'openrouter'
            ? { ...(await openRouter(fetcher, base, target.key)), ...NO_WINDOWS }
            : {
                models: await openAiModels(fetcher, base, target.key),
                credits: null,
                ...NO_WINDOWS,
              }

    return {
      state: 'ok',
      error: '',
      models: found.models.filter((model) => model.id !== ''),
      credits: found.credits,
      serverWindow: found.serverWindow,
      unsure: found.unsure,
    }
  } catch (error) {
    const empty = { models: [], credits: null, ...NO_WINDOWS }

    if (error instanceof Unauthorized) return { state: 'unauthorized', error: '', ...empty }
    if (error instanceof Offline) return { state: 'offline', error: error.message, ...empty }

    return {
      state: 'failed',
      error: error instanceof Error ? error.message : String(error),
      ...empty,
    }
  }
}

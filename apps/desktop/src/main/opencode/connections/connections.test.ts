import { it, expect, describe } from 'vitest'

import type { JsonFile } from '../../storage/json-file'
import type { Vault } from '../../storage/vault'
import { probeConnection } from './connection-probe'
import type { StoredConnections } from './connection-store'
import { ConnectionStore } from './connection-store'
import { ModelConnections } from './model-connections'
import { modelRefOf, openAiBaseUrl, providersConfig } from './opencode-config'

/** Подставная сеть: путь → JSON; нет пути - 404; 'down' - сервер не отвечает. */
const fakeFetch =
  (routes: Record<string, unknown>, keyNeeded = '') =>
  (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input)
    const route = `${init?.method ?? 'GET'} ${url.origin}${url.pathname}`

    if (routes[route] === 'down') return Promise.reject(new Error('ECONNREFUSED'))

    const auth = new Headers(init?.headers).get('authorization') ?? ''

    if (keyNeeded && auth !== `Bearer ${keyNeeded}`) {
      return Promise.resolve(new Response('{}', { status: 401 }))
    }

    if (init?.method === 'POST' && url.pathname === '/api/show') {
      const { model } = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        model: string
      }

      return Promise.resolve(Response.json(routes[`show ${model}`] ?? {}))
    }

    return Promise.resolve(
      route in routes ? Response.json(routes[route]) : new Response('', { status: 404 }),
    )
  }

const fakeVault = () => {
  const entries = new Map<string, string>()

  return {
    available: true,
    get: (key: string) => entries.get(key) ?? null,
    set: (key: string, value: string | null) => {
      if (value === null) entries.delete(key)
      else entries.set(key, value)

      return Promise.resolve()
    },
  } as unknown as Vault
}

const fakeFile = (value: unknown) => {
  const written: StoredConnections[] = []
  const file = {
    read: () => Promise.resolve(value),
    write: (next: StoredConnections) => {
      written.push(next)

      return Promise.resolve()
    },
  } as unknown as JsonFile<StoredConnections>

  return { file, written }
}

describe('подключения открытых моделей', () => {
  it('Ollama: модели с умением инструментов и окном, модели векторов - мимо', async () => {
    const result = await probeConnection(
      { kind: 'ollama', baseUrl: 'http://ollama/', key: '' },
      fakeFetch({
        'GET http://ollama/api/tags': {
          models: [{ name: 'gpt-oss:20b' }, { name: 'nomic-embed' }, { name: 'tiny' }],
        },
        'show gpt-oss:20b': {
          capabilities: ['completion', 'tools', 'thinking'],
          model_info: { 'gptoss.context_length': 131072 },
        },
        'show nomic-embed': { capabilities: ['embedding'] },
        'show tiny': { capabilities: ['completion'] },
      }),
    )

    expect(result).toEqual({
      state: 'ok',
      error: '',
      models: [
        { id: 'gpt-oss:20b', name: 'gpt-oss:20b', tools: true, reasoning: true, context: 131072 },
        { id: 'tiny', name: 'tiny', tools: false, reasoning: false, context: null },
      ],
      credits: null,
    })
  })

  it('не запущен - offline; ключ не принят - unauthorized; LM Studio - по своему списку', async () => {
    const down = await probeConnection(
      { kind: 'ollama', baseUrl: 'http://ollama', key: '' },
      fakeFetch({ 'GET http://ollama/api/tags': 'down' }),
    )

    expect(down.state).toBe('offline')

    const router = fakeFetch(
      {
        'GET https://or/api/v1/key': { data: { usage: 1.25, limit: 10 } },
        'GET https://or/api/v1/models': {
          data: [
            { id: 'a/b', name: 'B', context_length: 8000, supported_parameters: ['tools'] },
            { id: 'c/d', name: 'D', context_length: 4000, supported_parameters: [] },
          ],
        },
      },
      'sk-good',
    )

    expect(
      (
        await probeConnection(
          { kind: 'openrouter', baseUrl: 'https://or/api/v1', key: 'x' },
          router,
        )
      ).state,
    ).toBe('unauthorized')
    const openRouter = await probeConnection(
      { kind: 'openrouter', baseUrl: 'https://or/api/v1', key: 'sk-good' },
      router,
    )

    expect(openRouter.credits).toEqual({ used: 1.25, limit: 10 })
    expect(openRouter.models.map((model) => [model.id, model.tools])).toEqual([
      ['a/b', true],
      ['c/d', false],
    ])

    const studio = await probeConnection(
      { kind: 'lmstudio', baseUrl: 'http://studio', key: '' },
      fakeFetch({
        'GET http://studio/api/v0/models': {
          data: [
            { id: 'qwen', type: 'llm', max_context_length: 32768, capabilities: ['tool_use'] },
            { id: 'embed', type: 'embeddings' },
          ],
        },
      }),
    )

    expect(studio.models).toEqual([
      { id: 'qwen', name: 'qwen', tools: true, reasoning: null, context: 32768 },
    ])
  })

  it('хранилище: найденные всегда есть и не убираются, ключ - в хранилище секретов', async () => {
    const { file, written } = fakeFile({
      connections: [{ id: 'bad' }, { id: 'abcdef012345', kind: 'openrouter', baseUrl: 'ftp://x' }],
    })
    const store = await ConnectionStore.load(file, fakeVault())

    expect(store.list.map((row) => row.id)).toEqual(['ollama', 'lmstudio'])

    const id = await store.add({ kind: 'openrouter', key: 'sk-1' })

    expect(store.find(id)).toMatchObject({
      kind: 'openrouter',
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    expect(store.keyOf(id)).toBe('sk-1')
    expect(JSON.stringify(written.at(-1))).not.toContain('sk-1')

    await store.remove('ollama')
    await store.remove(id)
    expect(store.list.map((row) => row.id)).toEqual(['ollama', 'lmstudio'])
    expect(store.keyOf(id)).toBe('')
  })

  it('ключ не уезжает на другой хост, адрес OpenRouter не меняется', async () => {
    const store = await ConnectionStore.load(fakeFile(null).file, fakeVault())
    const custom = await store.add({ kind: 'custom', baseUrl: 'http://a.local:8000/v1', key: 'k1' })
    const router = await store.add({ kind: 'openrouter', key: 'sk-or' })

    await store.update(custom, { baseUrl: 'http://a.local:8000/v2' })
    expect(store.keyOf(custom)).toBe('k1')

    await store.update(custom, { baseUrl: 'https://evil.example/v1' })
    expect(store.keyOf(custom)).toBe('')

    await store.update(router, { baseUrl: 'https://evil.example/api/v1' })
    expect(store.find(router)?.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(store.keyOf(router)).toBe('sk-or')
  })

  it('конфиг OpenCode: отвечающие подключения - провайдерами в формате OpenAI', async () => {
    const store = await ConnectionStore.load(fakeFile(null).file, fakeVault())
    const connections = new ModelConnections(
      store,
      () => undefined,
      fakeFetch({
        'GET http://127.0.0.1:11434/api/tags': { models: [{ name: 'gpt-oss:20b' }] },
        'show gpt-oss:20b': { capabilities: ['completion', 'tools', 'thinking'] },
        'GET http://127.0.0.1:1234/api/v0/models': 'down',
      }),
    )

    await connections.refresh()

    expect(connections.list.map((row) => [row.id, row.state])).toEqual([
      ['ollama', 'ok'],
      ['lmstudio', 'offline'],
    ])
    expect(
      providersConfig(connections.list, (connection) => ({ baseURL: openAiBaseUrl(connection) })),
    ).toEqual({
      ollama: {
        name: 'Ollama',
        package: '@ai-sdk/openai-compatible',
        settings: { baseURL: 'http://127.0.0.1:11434/v1' },
        models: {
          'gpt-oss:20b': {
            name: 'gpt-oss:20b',
            capabilities: { tools: true },
            limit: { context: 32768, output: 8192 },
            variants: [
              { id: 'low', settings: { reasoningEffort: 'low' } },
              { id: 'medium', settings: { reasoningEffort: 'medium' } },
              { id: 'high', settings: { reasoningEffort: 'high' } },
            ],
          },
        },
      },
    })
    expect(modelRefOf('ollama/gpt-oss:20b')).toEqual({ providerID: 'ollama', id: 'gpt-oss:20b' })
    expect(modelRefOf('or1/a/b')).toEqual({ providerID: 'or1', id: 'a/b' })
    expect(modelRefOf('plain')).toBeNull()
  })
})

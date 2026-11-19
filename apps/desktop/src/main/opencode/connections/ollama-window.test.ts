import { it, expect, describe } from 'vitest'

import { probeConnection } from './connection-probe'
import type { OllamaWindowFacts } from './ollama-window'
import { isWindowSure, ollamaWindow, ownContextOf, learnServerWindow } from './ollama-window'

const facts = (
  max: number | null,
  own: number | null,
  loaded: number | null,
): OllamaWindowFacts => ({
  max,
  own,
  loaded,
})

/** Ollama с моделями: предел окна, своё num_ctx и загруженные с их окном; 'down' - не запущена. */
const ollama =
  (
    models: Record<string, { max: number; own?: number }>,
    loaded: Record<string, number> | 'down',
  ) =>
  (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const { pathname } = new URL(input instanceof Request ? input.url : input)
    const { model = '' } = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
      model?: string
    }

    if (loaded === 'down') return Promise.reject(new Error('ECONNREFUSED'))
    if (pathname === '/api/tags') {
      return Promise.resolve(
        Response.json({ models: Object.keys(models).map((name) => ({ name })) }),
      )
    }
    if (pathname === '/api/ps') {
      return Promise.resolve(
        Response.json({
          models: Object.entries(loaded).map(([name, tokens]) => ({
            name,
            context_length: tokens,
          })),
        }),
      )
    }

    const spec = models[model]

    return Promise.resolve(
      Response.json({
        capabilities: ['completion', 'tools'],
        model_info: { 'qwen.context_length': spec?.max },
        parameters: `temperature                    0.6${spec?.own ? `\nnum_ctx                        ${spec.own}` : ''}`,
      }),
    )
  }

const target = { kind: 'ollama' as const, baseUrl: 'http://ollama', key: '' }

describe('окно контекста моделей Ollama', () => {
  it('своё num_ctx модели - из parameters ответа /api/show', () => {
    expect(ownContextOf('num_ctx                        16384\ntemperature 0.6')).toBe(16384)
    expect(ownContextOf('top_k 20\nnum_ctx 4096')).toBe(4096)
    expect(ownContextOf('temperature 0.6')).toBeNull()
    expect(ownContextOf('')).toBeNull()
  })

  it('окно сервера: точное по модели меньше предела, «не меньше» - по упёршейся в предел', () => {
    expect(learnServerWindow([facts(262144, null, 32768)], null)).toEqual({
      tokens: 32768,
      exact: true,
    })
    // Модель со своим num_ctx об окне сервера ничего не говорит.
    expect(learnServerWindow([facts(262144, 16384, 16384)], null)).toBeNull()
    // Упёрлась в предел: сервер даёт не меньше 40960.
    expect(learnServerWindow([facts(40960, null, 40960)], null)).toEqual({
      tokens: 40960,
      exact: false,
    })
    // Урезанную под память берём меньше настоящего: точное - наибольшее.
    expect(
      learnServerWindow([facts(262144, null, 16384), facts(131072, null, 65536)], null),
    ).toEqual({ tokens: 65536, exact: true })
  })

  it('окно сервера: ничего не загружено - прежнее; «не меньше» больше прежнего - сервер сменил окно', () => {
    const known = { tokens: 32768, exact: true }

    expect(learnServerWindow([facts(262144, null, null)], known)).toBe(known)
    expect(learnServerWindow([facts(8192, null, 8192)], known)).toBe(known)
    expect(learnServerWindow([facts(131072, null, 131072)], known)).toEqual({
      tokens: 131072,
      exact: false,
    })
  })

  it('окно модели: загруженной - её, своё - в пределе, иначе окно сервера в пределе', () => {
    const server = { tokens: 32768, exact: true }

    expect(ollamaWindow(facts(262144, null, 65536), server)).toBe(65536)
    expect(ollamaWindow(facts(262144, 300000, null), null)).toBe(262144)
    expect(ollamaWindow(facts(262144, null, null), server)).toBe(32768)
    expect(ollamaWindow(facts(8192, null, null), server)).toBe(8192)
    expect(ollamaWindow(facts(262144, null, null), null)).toBeNull()

    expect(isWindowSure(facts(262144, null, null), server)).toBe(true)
    expect(isWindowSure(facts(262144, null, null), null)).toBe(false)
    // «Не меньше 40960»: модели с пределом 32768 этого хватает, с пределом 262144 - нет.
    expect(isWindowSure(facts(32768, null, null), { tokens: 40960, exact: false })).toBe(true)
    expect(isWindowSure(facts(262144, null, null), { tokens: 40960, exact: false })).toBe(false)
  })

  it('проба: окно - то, с которым сервер держит модель, а не её предел', async () => {
    const models = {
      'qwen3.8:latest': { max: 262144 },
      small: { max: 8192 },
      own: { max: 262144, own: 16384 },
    }
    const found = await probeConnection(target, ollama(models, { 'qwen3.8:latest': 32768 }))

    expect(found.models.map((model) => [model.id, model.context])).toEqual([
      ['qwen3.8:latest', 32768],
      ['small', 8192],
      ['own', 16384],
    ])
    expect(found.serverWindow).toEqual({ tokens: 32768, exact: true })
    expect(found.unsure).toEqual([])

    // Модель выгрузилась: окно сервера помнится с прошлой пробы.
    const later = await probeConnection(target, ollama(models, {}), found.serverWindow)

    expect(later.models[0]?.context).toBe(32768)

    // Сервер не отвечал - окно забыто: поднятый заново мог взять другое.
    const down = await probeConnection(target, ollama(models, 'down'), found.serverWindow)

    expect(down).toMatchObject({ state: 'offline', serverWindow: null })
  })
})

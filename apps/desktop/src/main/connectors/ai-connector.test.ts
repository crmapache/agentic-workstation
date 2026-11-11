import { it, vi, expect, describe, afterEach } from 'vitest'

import { AiConnectorDesk } from './ai-connector'
import type { AskStructured } from './ai-connector'

const tool = {
  name: 'forecast',
  description: 'Daily forecast',
  access: 'read',
  method: 'GET',
  path: '/forecast',
  query: ['latitude'],
  body: [],
  inputSchema: { type: 'object', properties: { latitude: { type: 'number' } } },
}

const spec = {
  service: 'Weather',
  baseUrl: 'https://api.weather.dev/v1',
  auth: { type: 'none' },
  authHelp: '',
  tools: [tool],
}

const request = { service: 'Weather', goal: '', docsUrl: '' }

/** Итог работы: дождаться, пока ответ ИИ разберётся. */
const settle = async (ask: AskStructured) => {
  const desk = new AiConnectorDesk(ask, () => undefined)

  desk.generate(request)
  await vi.waitFor(() => expect(desk.state.status).not.toBe('running'))

  return desk.state
}

const answering = (output: unknown) => vi.fn<AskStructured>().mockResolvedValue({ output })

afterEach(() => {
  vi.useRealTimers()
})

describe('AiConnectorDesk', () => {
  it('схема для CLI - draft-07: другую он не принимает', async () => {
    const ask = answering({ supported: true, reason: '', spec })

    await settle(ask)

    expect(ask.mock.calls[0]?.[1]).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
    })
  })

  it('годное описание - ready, «не выйдет» - причина, мусор - invalid с пояснением', async () => {
    expect(await settle(answering({ supported: true, reason: '', spec }))).toEqual({
      status: 'ready',
      request,
      spec,
      dropped: [],
    })
    expect(await settle(answering({ supported: false, reason: 'OAuth only' }))).toEqual({
      status: 'failed',
      request,
      error: 'unsupported',
      detail: 'OAuth only',
    })

    const invalid = await settle(
      answering({ supported: true, reason: '', spec: { ...spec, baseUrl: 'http://x' } }),
    )

    expect(invalid).toMatchObject({ status: 'failed', error: 'invalid' })
    expect(invalid.status === 'failed' && invalid.detail).toContain('baseUrl')
  })

  it('один кривой инструмент выбрасывается, остальное доходит до человека', async () => {
    const broken = { ...tool, name: 'station', path: '/stations/{station_id}' }

    expect(
      await settle(
        answering({ supported: true, reason: '', spec: { ...spec, tools: [tool, broken] } }),
      ),
    ).toMatchObject({ status: 'ready', spec, dropped: ['station'] })
  })

  it('отказ CLI уходит причиной', async () => {
    expect(
      await settle(
        vi.fn<AskStructured>().mockResolvedValue({ failure: 'cli-missing', detail: '' }),
      ),
    ).toMatchObject({ status: 'failed', error: 'cli-missing' })
  })

  it('не уложился во время - timeout, а не «остановлено»', async () => {
    vi.useFakeTimers()

    const ask = vi.fn<AskStructured>(
      (_prompt, _schema, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ failure: 'cancelled', detail: '' }))
        }),
    )
    const desk = new AiConnectorDesk(ask, () => undefined)

    desk.generate(request)
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(desk.state).toMatchObject({ status: 'failed', error: 'timeout' })
  })

  it('остановка - сразу «остановлено», поздний ответ отменённой работы не пишется', async () => {
    let answer: (value: Awaited<ReturnType<AskStructured>>) => void = () => undefined
    const changed = vi.fn()
    const desk = new AiConnectorDesk(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
      changed,
    )

    desk.generate(request)
    desk.cancel()
    answer({ output: { supported: true, reason: '', spec } })
    await Promise.resolve()

    expect(desk.state).toMatchObject({ status: 'failed', error: 'cancelled', request })

    desk.dismiss()

    expect(desk.state).toEqual({ status: 'idle' })
    expect(changed).toHaveBeenCalledTimes(3)
  })
})

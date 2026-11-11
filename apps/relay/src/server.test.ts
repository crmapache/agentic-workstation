import { get } from 'node:http'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'
import { WebSocket } from 'ws'

import { FRAME_PUSH, encodeFrame, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'

import type { Config } from './config.ts'
import { readConfig } from './config.ts'
import { readEnvelope, FRAME_CONTROL } from './frame.ts'
import type { Relay } from './server.ts'
import { createRelay } from './server.ts'

/**
 * Настоящий релей на свободном порту и настоящие сокеты: проверяется ровно то, что подделка
 * сокета выдумала бы, - маршрутизация и отказы. Кадры строит протокол IDE и телефона
 * (packages/remote-protocol): заодно сверка, что конверт у них один.
 */

const address = (fill: number) => new Uint8Array(16).fill(fill)

const agent = address(0xa1)

const device = address(0xd1)

const sealed = (to: Uint8Array, from: Uint8Array, body: string, type: 1 | 3 = FRAME_SEALED) =>
  Buffer.from(encodeFrame(type, to, from, 1n, new TextEncoder().encode(body)))

const inbox = new WeakMap<WebSocket, Buffer[]>()

const id = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

/** Кадры копятся с открытия: релей отдаёт ящик в ту же секунду, слушатель после - опоздал. */
const open = (port: number, path: string, who: Uint8Array, headers: Record<string, string> = {}) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}?id=${id(who)}`, { headers })
    const frames: Buffer[] = []

    inbox.set(socket, frames)
    socket.on('message', (data: Buffer) => frames.push(data))
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })

const nextFrame = async (socket: WebSocket, timeout = 2000): Promise<Buffer> => {
  const frames = inbox.get(socket) ?? []

  for (let waited = 0; waited < timeout; waited += 10) {
    const frame = frames.shift()

    if (frame) return frame

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('no frame arrived')
}

const closedWith = (socket: WebSocket) =>
  new Promise<number>((resolve) => socket.once('close', (code: number) => resolve(code)))

const refused = (socket: WebSocket) =>
  new Promise((resolve, reject) => {
    socket.once('open', () => reject(new Error('opened')))
    socket.once('error', resolve)
  })

describe('релей', () => {
  let relay: Relay
  let port: number
  const opened: WebSocket[] = []

  const start = async (over: Partial<Config> = {}) => {
    relay = createRelay(
      {
        ...readConfig({}),
        staticDir: join(import.meta.dirname, '..', 'public'),
        logLevel: 'silent',
        ...over,
      },
      () => undefined,
    )
    port = await relay.listen(0)
  }

  beforeEach(() => start())

  afterEach(async () => {
    for (const socket of opened.splice(0)) socket.terminate()

    await relay.close()
  })

  const connect = async (path: string, who: Uint8Array, headers?: Record<string, string>) => {
    const socket = await open(port, path, who, headers)

    opened.push(socket)

    return socket
  }

  it('передаёт кадр байт в байт и не трогает тело', async () => {
    const a = await connect('/v1/agent', agent)
    const d = await connect('/v1/device', device)
    const frame = sealed(device, agent, 'x'.repeat(5000))

    a.send(frame)

    expect((await nextFrame(d)).equals(frame)).toBe(true)
  })

  it('сердцебиение IDE: кадр самому себе возвращается ей же', async () => {
    const a = await connect('/v1/agent', agent)
    const beat = sealed(agent, agent, '')

    a.send(beat)

    expect((await nextFrame(a)).equals(beat)).toBe(true)
  })

  it('кадр от чужого имени и пуш без службы пушей отбрасываются', async () => {
    const a = await connect('/v1/agent', agent)
    const d = await connect('/v1/device', device)

    d.send(sealed(agent, agent, 'forged'))
    d.send(sealed(agent, device, 'wake', FRAME_PUSH))

    await expect(nextFrame(a, 300)).rejects.toThrow('no frame arrived')
  })

  it('держит кадр для отсутствующего и отдаёт при подключении', async () => {
    const a = await connect('/v1/agent', agent)

    a.send(sealed(device, agent, 'waiting'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const d = await connect('/v1/device', device)

    expect((await nextFrame(d)).subarray(42).toString()).toBe('waiting')
  })

  it('переполненный ящик - одно слово CONTROL «переспроси» при возвращении', async () => {
    await relay.close()
    await start({ mailboxMaxFrames: 2 })

    const a = await connect('/v1/agent', agent)

    for (const text of ['1', '2', '3']) a.send(sealed(device, agent, text))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const d = await connect('/v1/device', device)
    const first = readEnvelope(await nextFrame(d), 1024)

    expect(first.type).toBe(FRAME_CONTROL)
    expect([...first.from]).toEqual([...agent])
    await expect(nextFrame(d, 300)).rejects.toThrow('no frame arrived')
  })

  it('второе соединение того же адреса вытесняет первое кодом 4009', async () => {
    const first = await connect('/v1/agent', agent)
    const closing = closedWith(first)

    await connect('/v1/agent', agent)

    expect(await closing).toBe(4009)
  })

  it('кривой адрес - 4001, текстовый кадр - 4002, переросший - 1009', async () => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}/v1/agent?id=nonsense`)

    opened.push(bad)
    expect(await closedWith(bad)).toBe(4001)

    const text = await connect('/v1/device', device)
    const textClosed = closedWith(text)

    text.send('hello?')
    expect(await textClosed).toBe(4002)

    const big = await connect('/v1/device', address(0xd2))
    const bigClosed = closedWith(big)

    big.send(Buffer.alloc(300 * 1024))
    expect(await bigClosed).toBe(1009)
  })

  it('слишком много кадров в минуту - закрытие 1008', async () => {
    await relay.close()
    await start({ rateFramesPerMinute: 3 })

    const a = await connect('/v1/agent', agent)
    const closing = closedWith(a)

    for (let index = 0; index < 5; index += 1) a.send(sealed(device, agent, 'x'))

    expect(await closing).toBe(1008)
  })

  it('соединений с одного адреса - не больше потолка', async () => {
    await relay.close()
    await start({ maxConnectionsPerIp: 2, trustProxy: true })

    const from = { 'x-forwarded-for': '203.0.113.7' }

    await connect('/v1/device', address(1), from)
    await connect('/v1/device', address(2), from)

    const third = new WebSocket(`ws://127.0.0.1:${port}/v1/device?id=${id(address(3))}`, {
      headers: from,
    })

    opened.push(third)
    await refused(third)
    await connect('/v1/device', address(4), { 'x-forwarded-for': '203.0.113.8' })
  })

  it('страница с чужого источника сокет не откроет', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/device?id=${id(device)}`, {
      origin: 'https://somebody-elses-page.example',
    })

    opened.push(socket)
    await refused(socket)
  })

  it('отвечает на /healthz, /v1/info и /privacy', async () => {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`)
    const info = (await (await fetch(`http://127.0.0.1:${port}/v1/info`)).json()) as Record<
      string,
      unknown
    >
    const privacy = await (await fetch(`http://127.0.0.1:${port}/privacy`)).text()

    expect(health.status).toBe(200)
    expect(await health.text()).toBe('ok')
    expect(info).toMatchObject({
      build: 'dev',
      wireMin: 1,
      wireMax: 1,
      maxFrameBytes: 256 * 1024,
      mailboxTtlSeconds: 120,
    })
    expect(privacy).toContain('content-blind')
    expect(privacy).toContain('7 days')
  })

  it('раздаёт клиент: адрес пары получает оболочку, наружу из папки не выйти', async () => {
    const pair = await fetch(`http://127.0.0.1:${port}/pair`)

    expect(pair.status).toBe(200)
    expect(pair.headers.get('cache-control')).toBe('no-store')
    expect(await pair.text()).toContain('Remote Control')

    // Сырой путь мимо fetch: тот нормализует «..» сам, и запрос из папки бы не вышел.
    const escape = await new Promise<string>((resolve) =>
      get({ host: '127.0.0.1', port, path: '/..%2f..%2fpackage.json' }, (response) => {
        let body = ''

        response.on('data', (chunk: Buffer) => (body += chunk.toString()))
        response.on('end', () => resolve(body))
      }),
    )

    expect(escape).not.toContain('@agentic-workstation/relay')
    expect((await fetch(`http://127.0.0.1:${port}/.env`)).status).toBe(403)
  })
})

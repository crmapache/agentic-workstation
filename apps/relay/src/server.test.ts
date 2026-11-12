import { sign, createHash, generateKeyPairSync } from 'node:crypto'
import { get } from 'node:http'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'
import { generateVAPIDKeys } from 'web-push'
import { WebSocket } from 'ws'

import {
  FRAME_PUSH,
  decodeFrame,
  encodeFrame,
  FRAME_PROOF,
  FRAME_SEALED,
  FRAME_CHALLENGE,
  FRAME_PUSH_GONE,
} from '@agentic-workstation/remote-protocol/frame'
import { encodePushBody } from '@agentic-workstation/remote-protocol/push'
import type { ClaimKind } from '@agentic-workstation/remote-protocol/relay-claim'
import { proofBody, claimInput } from '@agentic-workstation/remote-protocol/relay-claim'

import type { Config } from './config.ts'
import { readConfig } from './config.ts'
import { readEnvelope, FRAME_CONTROL } from './frame.ts'
import type { PushOrder } from './push-frame.ts'
import type { Relay, RelayOptions } from './server.ts'
import { createRelay } from './server.ts'

/**
 * Настоящий релей на свободном порту и настоящие сокеты: проверяется ровно то, что подделка
 * сокета выдумала бы, - маршрутизация и отказы. Кадры строит протокол IDE и телефона
 * (packages/remote-protocol): заодно сверка, что конверт у них один.
 */

/** Сторона со своим ключом подписи: адрес - начало SHA-256 её открытого ключа. */
type Identity = { address: Uint8Array; prove: (kind: ClaimKind, challenge: Uint8Array) => Buffer }

const identity = (): Identity => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const spki = publicKey.export({ type: 'spki', format: 'der' })
  const address = new Uint8Array(createHash('sha256').update(spki).digest().subarray(0, 16))
  const prove = (kind: ClaimKind, challenge: Uint8Array) => {
    const signature = sign('sha256', claimInput(kind, id(address), challenge), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })

    return Buffer.from(
      encodeFrame(FRAME_PROOF, new Uint8Array(16), address, 0n, proofBody(spki, signature)),
    )
  }

  return { address, prove }
}

const agent = identity()

const device = identity()

const sealed = (to: Identity, from: Identity, body: string, type: 1 | 3 = FRAME_SEALED) =>
  Buffer.from(encodeFrame(type, to.address, from.address, 1n, new TextEncoder().encode(body)))

const inbox = new WeakMap<WebSocket, Buffer[]>()

const id = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

const kindOf = (path: string): ClaimKind => (path === '/v1/agent' ? 'agent' : 'device')

/**
 * Сокет, доказавший адрес: первым приходит вызов релея, ответ - подпись ключом стороны (или
 * чем скажет answer). Кадры копятся с ответа: релей отдаёт ящик сразу за ним, слушатель после
 * - опоздал. autoPong false - сокет, который не отвечает на пинг: так выглядит уснувший ноутбук.
 */
const open = (
  port: number,
  path: string,
  who: Identity,
  options: {
    headers?: Record<string, string>
    autoPong?: boolean
    answer?: (challenge: Uint8Array) => Buffer | null
  } = {},
) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}?id=${id(who.address)}`, {
      headers: options.headers ?? {},
      autoPong: options.autoPong ?? true,
    })
    const frames: Buffer[] = []
    let challenged = false

    inbox.set(socket, frames)
    socket.on('message', (data: Buffer) => {
      if (challenged) return void frames.push(data)

      const frame = decodeFrame(new Uint8Array(data))

      if (frame.type !== FRAME_CHALLENGE) return reject(new Error('no challenge first'))

      challenged = true

      const proof = options.answer
        ? options.answer(frame.body)
        : who.prove(kindOf(path), frame.body)

      if (proof) socket.send(proof)

      resolve(socket)
    })
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

  const start = async (over: Partial<Config> = {}, options: RelayOptions = {}) => {
    relay = createRelay(
      {
        ...readConfig({}),
        staticDir: join(import.meta.dirname, '..', 'public'),
        logLevel: 'silent',
        ...over,
      },
      () => undefined,
      options,
    )
    port = await relay.listen(0)
  }

  beforeEach(() => start())

  afterEach(async () => {
    for (const socket of opened.splice(0)) socket.terminate()

    await relay.close()
  })

  const connect = async (path: string, who: Identity, options?: Parameters<typeof open>[3]) => {
    const socket = await open(port, path, who, options)

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
    expect([...first.from]).toEqual([...agent.address])
    await expect(nextFrame(d, 300)).rejects.toThrow('no frame arrived')
  })

  it('второе соединение того же адреса вытесняет первое кодом 4009', async () => {
    const first = await connect('/v1/agent', agent)
    const closing = closedWith(first)

    await connect('/v1/agent', agent)

    expect(await closing).toBe(4009)
  })

  it('вытеснение: новое соединение первым слышит «переспроси» от того, кто писал прежнему', async () => {
    const first = await connect('/v1/agent', agent)
    const d = await connect('/v1/device', device)

    d.send(sealed(agent, device, 'subscribe'))
    await nextFrame(first)

    const second = await connect('/v1/agent', agent)
    const word = readEnvelope(await nextFrame(second), 1024)

    expect(word.type).toBe(FRAME_CONTROL)
    expect([...word.from]).toEqual([...device.address])
  })

  it('сокет без ответа на пинг закрывается, кадры к нему - в ящик, вернувшийся слышит «переспроси»', async () => {
    await relay.close()
    await start({ pingIntervalMs: 150 })

    const asleep = await connect('/v1/agent', agent, { autoPong: false })
    const closing = closedWith(asleep)
    const d = await connect('/v1/device', device)

    d.send(sealed(agent, device, 'before'))
    await nextFrame(asleep)
    expect(await closing).toBe(1006)

    d.send(sealed(agent, device, 'after'))
    await new Promise((resolve) => setTimeout(resolve, 30))

    const back = await connect('/v1/agent', agent)
    const word = readEnvelope(await nextFrame(back), 1024)

    expect(word.type).toBe(FRAME_CONTROL)
    expect([...word.from]).toEqual([...device.address])
    expect((await nextFrame(back)).subarray(42).toString()).toBe('after')
  })

  it('отвечающий на пинг сокет живёт', async () => {
    await relay.close()
    await start({ pingIntervalMs: 30 })

    const awake = await connect('/v1/agent', agent)

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(awake.readyState).toBe(WebSocket.OPEN)
    expect(relay.connections()).toBe(1)
  })

  it('кривой адрес - 4001, текстовый кадр - 4002, переросший - 1009', async () => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}/v1/agent?id=nonsense`)

    opened.push(bad)
    expect(await closedWith(bad)).toBe(4001)

    const text = await connect('/v1/device', device)
    const textClosed = closedWith(text)

    text.send('hello?')
    expect(await textClosed).toBe(4002)

    const big = await connect('/v1/device', identity())
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

    await connect('/v1/device', identity(), { headers: from })
    await connect('/v1/device', identity(), { headers: from })

    const third = new WebSocket(`ws://127.0.0.1:${port}/v1/device?id=${id(identity().address)}`, {
      headers: from,
    })

    opened.push(third)
    await refused(third)
    await connect('/v1/device', identity(), { headers: { 'x-forwarded-for': '203.0.113.8' } })
  })

  it('страница с чужого источника сокет не откроет', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/device?id=${id(device.address)}`, {
      origin: 'https://somebody-elses-page.example',
    })

    opened.push(socket)
    await refused(socket)
  })

  it('адрес без ключа не занять: чужая подпись - 4003, IDE на месте, её кадры не уходят чужому', async () => {
    const a = await connect('/v1/agent', agent)
    const squatter = identity()
    // Знает адрес IDE из QR, но подписывает своим ключом.
    const thief = await connect('/v1/agent', agent, {
      answer: (challenge) => {
        const forged = squatter.prove('agent', challenge)

        // Тот же ключ и подпись, но назвался адресом IDE.
        forged.set(agent.address, 18)

        return forged
      },
    })

    expect(await closedWith(thief)).toBe(4003)
    expect(a.readyState).toBe(WebSocket.OPEN)

    const d = await connect('/v1/device', device)

    d.send(sealed(agent, device, 'still yours'))
    expect((await nextFrame(a)).subarray(42).toString()).toBe('still yours')
  })

  it('до доказательства ничего не уходит дальше: кадр вместо ответа - 4003', async () => {
    const a = await connect('/v1/agent', agent)
    const early = await connect('/v1/device', device, {
      answer: () => sealed(agent, device, 'before proof'),
    })

    expect(await closedWith(early)).toBe(4003)
    await expect(nextFrame(a, 300)).rejects.toThrow('no frame arrived')
  })

  it('нет ответа на вызов вовремя - 4004', async () => {
    await relay.close()
    await start({ claimPatienceMs: 100 })

    const silent = await connect('/v1/device', device, { answer: () => null })

    expect(await closedWith(silent)).toBe(4004)
    expect(relay.connections()).toBe(0)
  })

  it('подпись для входа IDE на входе телефона не годится, а адрес IDE не берётся телефоном', async () => {
    const a = await connect('/v1/agent', agent)
    const replayed = await connect('/v1/device', agent, {
      answer: (challenge) => agent.prove('agent', challenge),
    })

    expect(await closedWith(replayed)).toBe(4003)

    // Даже с верной подписью для своего входа: адрес держит IDE - телефон его не вытесняет.
    const other = await connect('/v1/device', agent)

    expect(await closedWith(other)).toBe(4005)
    expect(a.readyState).toBe(WebSocket.OPEN)
  })

  it('ответ на вызов дальше не пересылается, повторный ответ - тоже', async () => {
    const a = await connect('/v1/agent', agent)
    const d = await connect('/v1/device', device)

    d.send(device.prove('device', new Uint8Array(32)))
    d.send(sealed(agent, device, 'after'))
    expect((await nextFrame(a)).subarray(42).toString()).toBe('after')
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
      push: false,
    })
    expect(info).not.toHaveProperty('pushPublicKey')
    expect(privacy).toContain('content-blind')
    expect(privacy).toContain('7 days')
  })

  it('пуш: ключ VAPID в /v1/info, кадр IDE - службе пушей, дальше никому; «подписки нет» - IDE', async () => {
    const vapid = generateVAPIDKeys()
    const orders: PushOrder[] = []
    let status = 201

    await relay.close()
    await start(
      {
        push: { ...vapid, subject: 'https://relay.example' },
        pushOff: '',
      },
      {
        pushSender: (order) => {
          orders.push(order)

          return Promise.resolve(status)
        },
      },
    )

    const info = (await (await fetch(`http://127.0.0.1:${port}/v1/info`)).json()) as Record<
      string,
      unknown
    >

    expect(info).toMatchObject({ push: true, pushPublicKey: vapid.publicKey })

    const a = await connect('/v1/agent', agent)
    const d = await connect('/v1/device', device)
    const payload = new Uint8Array(48).fill(5)
    const pushFrame = (from: Identity, to: Identity) =>
      Buffer.from(
        encodeFrame(
          FRAME_PUSH,
          to.address,
          from.address,
          0n,
          encodePushBody({
            topic: null,
            p256dh: Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index)),
            auth: new Uint8Array(16).fill(1),
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
            payload,
          }),
        ),
      )

    a.send(pushFrame(agent, device))
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(orders).toHaveLength(1)
    expect(orders[0]?.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc')
    expect(orders[0]?.payload.equals(Buffer.from(payload))).toBe(true)
    // Телефон кадр не получает: пуш - разговор релея со службой, а не кадр кому-то.
    await expect(nextFrame(d, 200)).rejects.toThrow('no frame arrived')

    // Телефон будить IDE не может: его FRAME_PUSH службе не уходит.
    d.send(pushFrame(device, agent))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(orders).toHaveLength(1)

    // Служба: подписки нет - IDE слышит это словом релея от имени телефона.
    status = 410
    a.send(pushFrame(agent, device))

    const gone = decodeFrame(new Uint8Array(await nextFrame(a)))

    expect(gone.type).toBe(FRAME_PUSH_GONE)
    expect(Buffer.from(gone.to).equals(Buffer.from(agent.address))).toBe(true)
    expect(Buffer.from(gone.from).equals(Buffer.from(device.address))).toBe(true)
    expect(gone.body).toHaveLength(0)

    // Это слово - только релея: от стороны оно не пересылается.
    d.send(Buffer.from(encodeFrame(FRAME_PUSH_GONE, agent.address, device.address, 0n, payload)))
    await expect(nextFrame(a, 200)).rejects.toThrow('no frame arrived')
  })

  it('страницы - со строгой политикой, без реферера, только HTTPS и камерой для себя', async () => {
    for (const path of ['/pair', '/privacy']) {
      const page = await fetch(`http://127.0.0.1:${port}${path}`)
      const policy = page.headers.get('content-security-policy') ?? ''

      expect(policy).toContain("default-src 'self'")
      expect(policy).toContain(`connect-src 'self' ws://127.0.0.1:${port}`)
      expect(policy).toContain("img-src 'self' data: blob:")
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).toContain("object-src 'none'")
      expect(policy).toContain("base-uri 'none'")
      expect(page.headers.get('referrer-policy')).toBe('no-referrer')
      expect(page.headers.get('strict-transport-security')).toContain('max-age=')
      expect(page.headers.get('permissions-policy')).toContain('camera=(self)')
    }
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

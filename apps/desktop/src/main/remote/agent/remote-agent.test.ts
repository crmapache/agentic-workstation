import { webcrypto } from 'node:crypto'

import { it, vi, expect, describe, afterEach } from 'vitest'

import { toBase64 } from '@agentic-workstation/remote-protocol/base64'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { COMMAND_LIMITS } from '@agentic-workstation/remote-protocol/commands'
import { PAIR_REFUSED_LABEL } from '@agentic-workstation/remote-protocol/crypto-spec'
import {
  encodeFrame,
  FRAME_SEALED,
  decodeAddress,
  FRAME_CONTROL,
  FRAME_CHALLENGE,
} from '@agentic-workstation/remote-protocol/frame'
import { splitIntoParts } from '@agentic-workstation/remote-protocol/parts'
import type { PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import { mac, until, WebCryptoPhone } from '../__fixtures__/webcrypto-phone'
import type { SocketLike } from '../link/relay-link'
import type { StoredRemote } from '../store/remote-state'
import { RemoteStore } from '../store/remote-store'
import type { JsonFile } from '../../storage/json-file'
import { OFFER_LIFETIME_MS } from './pairing'
import { RemoteAgent } from './remote-agent'

/**
 * Дорога телефона до настоящего RemoteAgent и обратно через подделку сокета релея: телефон на
 * WebCrypto (`__fixtures__/webcrypto-phone.ts`), агент на node:crypto.
 */

const memoryFile = () =>
  ({
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
  }) as unknown as JsonFile<StoredRemote>

const memoryVault = {
  available: () => true,
  seal: (plain: Buffer) => plain.toString('base64'),
  open: (sealed: string) => Buffer.from(sealed, 'base64'),
}

type FakeSocket = SocketLike & { readyState: number }

const agents: RemoteAgent[] = []

afterEach(() => {
  for (const agent of agents.splice(0)) agent.stop()
})

const setup = async () => {
  const handled: { deviceId: string; message: PhoneMessage }[] = []
  const events: string[] = []
  const known = new Set<string>()
  const sockets: FakeSocket[] = []
  /** Что телефон отправил - чтобы повторить кадр как есть. */
  const fromPhone: Uint8Array[] = []
  const socketOf = (): FakeSocket => {
    const socket: FakeSocket = {
      binaryType: '',
      readyState: 0,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: (data) => phone.receive(new Uint8Array(data)),
      close: () => undefined,
    }

    sockets.push(socket)

    return socket
  }
  const store = await RemoteStore.load(memoryFile(), memoryVault)
  const agent = new RemoteAgent(
    {
      store,
      createSocket: socketOf,
      relayUrl: 'wss://relay.example',
      label: () => 'Agentic Workstation on test',
      onView: () => undefined,
    },
    {
      handle: (deviceId, message) => {
        handled.push({ deviceId, message })

        if (message.k === 'cmd') known.add(message.id)
      },
      newKeys: () => events.push('newKeys'),
      resend: () => events.push('resend'),
      woke: () => events.push('woke'),
      linkUp: () => events.push('linkUp'),
      knownCommand: (_deviceId, commandId) => known.has(commandId),
      forgotten: () => events.push('forgotten'),
    },
  )
  const current = () => sockets.at(-1) as FakeSocket
  const deliver = (frame: Uint8Array) => current().onmessage?.({ data: frame.slice().buffer })
  const phone = await WebCryptoPhone.create((frame) => {
    fromPhone.push(frame)
    deliver(frame)
  })
  /** Сокет открылся, и релей сразу спросил «докажи, что адрес твой» - как apps/relay. */
  const open = () => {
    current().readyState = 1
    current().onopen?.({})
    deliver(
      encodeFrame(
        FRAME_CHALLENGE,
        decodeAddress(store.agentId()),
        new Uint8Array(16),
        0n,
        new Uint8Array(32).fill(1),
      ),
    )
  }
  /** Пара целиком: код, просьба, Approve того, кто на экране, ответ. */
  const pair = async () => {
    const offer = await phone.pairInit(agent.startPairing().url)
    const pending = await until(() => agent.pendingPairing(), 'pending phone')

    expect(agent.approvePairing(pending)).toBe(true)
    await phone.pairAck(offer)
  }

  agents.push(agent)
  agent.start()
  open()

  return { agent, store, deliver, handled, events, phone, fromPhone, sockets, open, pair }
}

describe('телефон и IDE: пара, переподключение, печать, отзыв', () => {
  it('проходят всю дорогу', async () => {
    const { agent, handled, phone, pair } = await setup()

    await pair()

    // Ключи пары работают сразу: стук доходит наверх ровно один раз, повтор отбрасывается.
    await phone.send({ p: 1, k: 'hello' })
    await until(() => handled[0], 'hello')
    expect(handled).toEqual([{ deviceId: phone.deviceId, message: { p: 1, k: 'hello' } }])

    // Переподключение без QR: новые ключи, за которые ручается долгий.
    await phone.resume()
    await phone.send({ p: 1, k: 'inventory' })
    await until(() => handled[1], 'inventory')
    expect(handled[1]?.message).toEqual({ p: 1, k: 'inventory' })

    agent.reply(phone.deviceId, { p: 1, k: 'resync' })
    await phone.next('resync')

    // Отзыв: запечатанное «отпустили» на связи и открытое - вернувшемуся; тег - под долгим
    // ключом пары, и телефон его проверяет.
    agent.revoke(phone.deviceId)

    const sealed = await phone.next('revoked')

    expect(await phone.revokedTagValid(String(sealed['tag']))).toBe(true)
    phone.replies.length = 0
    await expect(phone.resume(300)).rejects.toThrow('sessionAck')

    const plain = phone.replies.find((reply) => reply.k === 'revoked')

    expect(plain?.k === 'revoked' && (await phone.revokedTagValid(plain.tag))).toBe(true)
  })

  it('повтор одноразового ключа отвечается копией, пока на ключах не открылся кадр, потом - нет', async () => {
    const { phone, pair, fromPhone, deliver } = await setup()

    await pair()

    const mark = fromPhone.length

    await phone.resume()

    const init = fromPhone[mark] as Uint8Array

    // Ответ «потерялся»: копия той же просьбы - тот же ответ, ключи не расходятся.
    phone.replies.length = 0
    deliver(init)

    const copy = await until(() => phone.replies[0], 'the same ack again')

    expect(copy.k).toBe('sessionAck')

    // Телефон заговорил на новых ключах - ключ отслужил. Его копия из ящика релея - без ответа.
    await phone.send({ p: 1, k: 'ping', n: 1 })
    await phone.next('pong')
    phone.replies.length = 0
    deliver(init)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(phone.replies).toEqual([])
  })

  it('незнакомцу не отвечают, а сообщение не по белому списку не доходит наверх', async () => {
    const { deliver, store, handled, phone, pair } = await setup()
    const stranger = webcrypto.getRandomValues(new Uint8Array(16))
    const to = new Uint8Array(Buffer.from(store.agentId(), 'base64url'))

    deliver(
      encodeFrame(
        FRAME_SEALED,
        to,
        stranger,
        0n,
        encodeBody({ p: 1, k: 'sessionInit', deviceId: 'x', ephemeralPub: 'y' }),
      ),
    )
    deliver(encodeFrame(FRAME_SEALED, to, stranger, 5n, new Uint8Array(40)))
    expect(phone.replies).toEqual([])

    await pair()
    await phone.send({ p: 1, k: 'bash', command: 'rm -rf ~' })
    await phone.send({ p: 1, k: 'hello' })
    await until(() => handled[0], 'hello')
    expect(handled.map((one) => one.message.k)).toEqual(['hello'])
  })

  it('стук получает pong с тем же номером, а мосту не нужен', async () => {
    const { handled, phone, pair } = await setup()

    await pair()
    await phone.send({ p: 1, k: 'ping', n: 7 })

    expect(await phone.next('pong')).toMatchObject({ n: 7 })
    expect(handled).toEqual([])
  })

  it('«забудь меня» с телефона - обычный отзыв: секрет уходит, мосту forgotten', async () => {
    const { agent, store, events, phone, pair } = await setup()

    await pair()
    await phone.send({ p: 1, k: 'unpair' })

    const revoked = await phone.next('revoked')

    expect(await phone.revokedTagValid(String(revoked['tag']))).toBe(true)
    expect(store.devices).toEqual([])
    expect(store.revokedTag(phone.deviceId)).toBe(revoked['tag'])
    expect(events).toContain('forgotten')
    expect(agent.sessions.isOpen(phone.deviceId)).toBe(false)
  })

  it('код с чужим доказательством телефон в ожидание не ставит', async () => {
    const { agent, phone } = await setup()
    const url = agent.startPairing().url

    // Код из QR, но секрет подменён: доказательство не сойдётся.
    await phone.pairInit(
      url.replace(/\.([A-Za-z0-9_-]{22})\.([0-9A-F]{16})$/, '.AAAAAAAAAAAAAAAAAAAAAA.$2'),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(agent.pendingPairing()).toBeNull()
  })
})

describe('пара: потерянный ответ и Approve того, кто на экране', () => {
  it('повтор той же просьбы после Approve получает тот же ответ, а не «начни заново»', async () => {
    const { agent, phone, fromPhone, deliver } = await setup()
    const offer = await phone.pairInit(agent.startPairing().url)
    const pending = await until(() => agent.pendingPairing(), 'pending phone')

    agent.approvePairing(pending)

    const first = await until(() => phone.replies.find((reply) => reply.k === 'pairAck'), 'ack')

    // Ответ «потерялся»: телефон шлёт ту же просьбу ещё раз.
    phone.replies.length = 0
    deliver(fromPhone[0] as Uint8Array)

    const again = await until(() => phone.replies[0], 'repeated ack')

    expect(again).toEqual(first)
    await phone.pairAck(offer)
    await phone.send({ p: 1, k: 'ping' })
  })

  it('«нет», новый код и истёкший код - ждущему «пару не пустили» под секретом его кода', async () => {
    const { agent, store, phone } = await setup()
    const refusal = async (secret: Uint8Array, reason: string) =>
      toBase64(await mac(secret, [PAIR_REFUSED_LABEL, store.agentId(), phone.deviceId, reason]))
    const refused = (reason: string) =>
      until(
        () => phone.replies.find((reply) => reply.k === 'pairRefused' && reply.reason === reason),
        reason,
      )

    const first = await phone.pairInit(agent.startPairing().url)

    await until(() => agent.pendingPairing(), 'pending phone')
    agent.refusePairing()

    const no = await refused('refused')

    expect(no.k === 'pairRefused' && no.proof).toBe(await refusal(first.secret, 'refused'))

    // Новый код, пока телефон ждал прежнего: прежний код для него - «истёк».
    const second = await phone.pairInit(agent.startPairing().url)

    await until(() => agent.pendingPairing(), 'pending again')
    agent.startPairing()

    const replaced = await refused('expired')

    expect(replaced.k === 'pairRefused' && replaced.proof).toBe(
      await refusal(second.secret, 'expired'),
    )
    expect(agent.pendingPairing()).toBeNull()
  })

  it('ждущий, чей код истёк, сам слышит «истёк», а не ждёт молча', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })

    try {
      const { agent, phone } = await setup()

      await phone.pairInit(agent.startPairing().url)
      await vi.waitFor(() => expect(agent.pendingPairing()).not.toBeNull())
      vi.advanceTimersByTime(OFFER_LIFETIME_MS + 100)
      await vi.waitFor(() =>
        expect(phone.replies.some((reply) => reply.k === 'pairRefused')).toBe(true),
      )
      expect(agent.pendingPairing()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Approve с чужим отпечатком никого не пускает', async () => {
    const { agent, phone } = await setup()

    await phone.pairInit(agent.startPairing().url)

    const pending = await until(() => agent.pendingPairing(), 'pending phone')

    expect(agent.approvePairing({ ...pending, fingerprint: '0000 0000' })).toBe(false)
    expect(agent.pendingPairing()).toEqual(pending)
    expect(phone.replies).toEqual([])
  })
})

describe('пределы частоты при получении', () => {
  const send = (id: string): PhoneMessage => ({
    p: 1,
    k: 'cmd',
    id,
    name: 'conversation.send',
    args: { conversationId: 'c', text: 'hi' },
  })

  it('лишняя команда отказывается сразу, итогом rateLimited; повтор принятой не считается', async () => {
    const { handled, phone, pair } = await setup()
    const limit = COMMAND_LIMITS['conversation.send']

    await pair()

    for (let index = 0; index < limit; index += 1) await phone.send(send(`m${index}`))

    await until(() => (handled.length === limit ? true : null), 'accepted commands')
    await phone.send(send('over'))

    expect(await phone.next('result', (message) => message['id'] === 'over')).toMatchObject({
      ok: false,
      code: 'rateLimited',
    })

    // Повтор уже принятой - доставка, а не новая команда: доходит до моста.
    await phone.send(send('m0'))
    await until(() => (handled.length === limit + 1 ? true : null), 'repeat delivered')
    expect(handled.at(-1)?.message).toMatchObject({ id: 'm0' })
  })

  it('команда частями считается так же, как целая', async () => {
    const { handled, phone, pair } = await setup()
    const limit = COMMAND_LIMITS['conversation.send']

    await pair()

    for (let index = 0; index < limit; index += 1) await phone.send(send(`m${index}`))

    const big = JSON.stringify({
      ...send('big'),
      args: { conversationId: 'c', text: 'x'.repeat(99_000) },
    })

    const parts = splitIntoParts('big', big)

    expect(parts.length).toBeGreaterThan(1)

    for (const part of parts) await phone.send(part)

    expect(await phone.next('result', (message) => message['id'] === 'big')).toMatchObject({
      code: 'rateLimited',
    })
    expect(handled).toHaveLength(limit)
  })

  it('не собравшееся сообщение частями - слово с его id, одно на сообщение, а не тишина', async () => {
    const { handled, phone, pair } = await setup()

    await pair()

    const part = (id: string, i: number, n: number) => ({ p: 1, k: 'part', id, i, n, d: 'x' })

    // Части не сходятся числом - сборка отказана.
    await phone.send(part('broken', 0, 3))
    await phone.send(part('broken', 1, 2))

    expect(await phone.next('notice')).toMatchObject({ code: 'partsRefused', about: 'broken' })

    // Третья сборка разом вытесняет первую: и о ней телефону сказано.
    await phone.send(part('a', 0, 2))
    await phone.send(part('b', 0, 2))
    await phone.send(part('c', 0, 2))

    expect(await phone.next('notice', (message) => message['about'] === 'a')).toMatchObject({
      code: 'partsRefused',
    })
    expect(handled).toEqual([])
  })

  it('отзыв не обнуляет счёт: отпущенный и спаренный заново не получает свежую квоту', async () => {
    const { agent, phone, pair } = await setup()
    const limit = COMMAND_LIMITS['conversation.send']

    await pair()

    for (let index = 0; index < limit; index += 1) await phone.send(send(`m${index}`))

    await until(() => (agent.limits.allow(phone.deviceId, 'probe') ? true : null), 'counted')
    agent.revoke(phone.deviceId)

    expect(agent.limits.allow(phone.deviceId, 'conversation.send')).toBe(false)
  })
})

describe('линия и слово релея', () => {
  it('слово релея «кадры телефона пропали» - телефону «переспроси»', async () => {
    const { store, phone, deliver, pair } = await setup()

    await pair()
    deliver(
      encodeFrame(
        FRAME_CONTROL,
        new Uint8Array(Buffer.from(store.agentId(), 'base64url')),
        new Uint8Array(Buffer.from(phone.deviceId, 'base64url')),
        0n,
        new Uint8Array(0),
      ),
    )

    expect(await phone.next('resync')).toMatchObject({ k: 'resync' })
  })

  it('линия вернулась - мосту linkUp, а ждавшее уходит сразу, не дожидаясь такта', async () => {
    const { agent, events, phone, sockets, open, pair } = await setup()

    await pair()
    sockets.at(-1)?.onclose?.({ code: 1006 })
    agent.reply(phone.deviceId, { p: 1, k: 'notice', level: 'info', code: 'notFound' })

    await until(() => (sockets.length === 2 ? true : null), 'second socket', 3000)
    events.length = 0
    open()

    expect(events).toContain('linkUp')
    expect(await phone.next('notice')).toMatchObject({ code: 'notFound' })
  })

  it('выключение и выход: готовое уходит в сокет раньше, чем он закроется', async () => {
    const { agent, phone, sockets, pair } = await setup()
    const order: string[] = []

    await pair()

    const socket = sockets.at(-1) as FakeSocket
    const send = socket.send

    socket.send = (data) => {
      order.push('send')
      send(data)
    }
    socket.close = () => order.push('close')

    // В очередь без слива - как итог команды, готовый за миг до выхода.
    agent.queue(phone.deviceId, encodeBody({ p: 1, k: 'result', id: 'last', ok: true }), 'urgent')
    agent.stop()

    expect(order).toEqual(['send', 'close'])
    expect(await phone.next('result', (message) => message['id'] === 'last')).toMatchObject({
      ok: true,
    })
  })

  it('телефон молчал дольше «на связи» и заговорил - мосту woke', async () => {
    const { agent, events, phone, pair } = await setup()

    await pair()
    await phone.send({ p: 1, k: 'ping' })
    await until(() => (agent.isAwake(phone.deviceId) ? true : null), 'awake')
    expect(events).toContain('newKeys')

    // Сон: «последний раз слышали» уехал в прошлое.
    ;(agent as unknown as { lastHeard: Map<string, number> }).lastHeard.set(phone.deviceId, 0)
    events.length = 0
    await phone.send({ p: 1, k: 'ping' })

    expect(await until(() => events.find((event) => event === 'woke'), 'woke')).toBe('woke')
  })
})

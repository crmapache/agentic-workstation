import { it, vi, expect, describe } from 'vitest'

import {
  Backoff,
  classifyClose,
  DISPLACED_LIMIT,
  DISPLACED_PAUSE_MS,
  NETWORK_CEILING_MS,
  DISPLACED_LONG_PAUSE_MS,
} from './backoff'
import type { Outgoing } from './outbox'
import { RemoteOutbox } from './outbox'
import type { SocketLike } from './relay-link'
import { RelayLink } from './relay-link'

const frame = (fill: number, size = 4): Outgoing => ({ frame: Buffer.alloc(size, fill) })

/** «Печать» для теста: тело как есть, с номером по порядку печати - как счётчик GCM. */
const counting = () => {
  let counter = 0

  return (_deviceId: string, outgoing: Outgoing) =>
    'frame' in outgoing ? outgoing.frame : Buffer.from([(counter += 1), ...outgoing.body])
}

const body = (fill: number): Outgoing => ({ body: new Uint8Array([fill]), type: 1 })

describe('пауза перед новым звонком', () => {
  it('отказ по существу - стоп; вытеснение - быстрые возвраты, потом долгая пауза, но не стоп', () => {
    const backoff = new Backoff(() => 0.5)

    expect(backoff.next('fatal')).toBeNull()

    for (let round = 0; round < DISPLACED_LIMIT; round += 1)
      expect(backoff.next('displaced')).toBe(DISPLACED_PAUSE_MS)

    for (let round = 0; round < 20; round += 1)
      expect(backoff.next('displaced')).toBe(DISPLACED_LONG_PAUSE_MS)

    // Линия простояла - вытеснение снова считается с нуля.
    backoff.heldOn()
    expect(backoff.next('displaced')).toBe(DISPLACED_PAUSE_MS)
  })

  it('сеть - растёт до потолка и сбрасывается удачным открытием', () => {
    const backoff = new Backoff(() => 0.5)
    const pauses = Array.from({ length: 12 }, () => backoff.next('network') ?? 0)

    expect(pauses[1]).toBeGreaterThan(pauses[0] ?? 0)
    expect(Math.max(...pauses)).toBeLessThanOrEqual(NETWORK_CEILING_MS * 1.25)

    backoff.succeeded()

    expect(backoff.attemptCount).toBe(0)
  })

  it('коды закрытия релея', () => {
    expect(classifyClose(4009)).toBe('displaced')
    expect(classifyClose(4001)).toBe('fatal')
    expect(classifyClose(4002)).toBe('fatal')
    expect(classifyClose(1013)).toBe('relay')
    expect(classifyClose(1006)).toBe('network')
  })
})

describe('очередь наружу', () => {
  it('у каждого устройства своя, срочное - первым', () => {
    const outbox = new RemoteOutbox()

    outbox.offer('a', frame(1))
    outbox.offerUrgent('a', frame(9))
    outbox.offer('b', frame(2))

    const sent = outbox.drain(counting(), () => null)

    expect(sent.map((item) => [item.deviceId, item.frame[0]])).toEqual([
      ['a', 9],
      ['a', 1],
      ['b', 2],
    ])
    expect(outbox.size()).toBe(0)
  })

  it('печать - при отправке: срочное, обогнавшее ленту, не уносит номер выше неё', () => {
    const outbox = new RemoteOutbox()

    for (let index = 0; index < 100; index += 1) outbox.offer('phone', body(index))

    outbox.offerUrgent('phone', body(200))

    const counters = outbox.drain(counting(), () => null).map((item) => item.frame[0] ?? 0)

    // Номера идут в порядке ухода: окно повторов телефона (64) не выбросит ленту как старую.
    expect(counters).toEqual(Array.from({ length: 101 }, (_, index) => index + 1))
  })

  it('без ключей кадр не печатается и выбрасывается', () => {
    const outbox = new RemoteOutbox()

    outbox.offer('gone', body(1))

    expect(
      outbox.drain(
        () => null,
        () => null,
      ),
    ).toEqual([])
  })

  it('переполненная схлопывается в одно «переспроси», срочное остаётся, соседняя не страдает', () => {
    const outbox = new RemoteOutbox(2, 1000)

    outbox.offer('phone', frame(1))
    outbox.offer('phone', frame(2))
    outbox.offerUrgent('phone', frame(7))
    outbox.offer('phone', frame(3))
    outbox.offer('laptop', frame(4))

    const sent = outbox.drain(counting(), (deviceId) =>
      deviceId === 'phone' ? Buffer.from([0xee]) : null,
    )

    expect(sent.map((item) => [item.deviceId, item.frame[0]])).toEqual([
      ['phone', 0xee],
      ['phone', 7],
      ['laptop', 4],
    ])
  })

  it('не ушедшее возвращается в начало своей очереди - раньше всего, что запечатается потом', () => {
    const outbox = new RemoteOutbox()

    outbox.offer('a', frame(1))
    outbox.offer('a', frame(2))

    const [, second] = outbox.drain(counting(), () => null)

    outbox.offerUrgent('a', frame(9))
    outbox.offer('a', frame(3))
    outbox.putBack(second ? [second] : [])

    expect(outbox.drain(counting(), () => null).map((item) => item.frame[0])).toEqual([2, 9, 3])
  })
})

/** Сокет-подделка: что отправили и как закрыли - видно тесту. */
const fakeSocket = () => {
  const sent: Uint8Array[] = []
  const socket: SocketLike & { readyState: number } = {
    binaryType: '',
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => sent.push(data),
    close: () => undefined,
  }

  return { socket, sent }
}

describe('линия до релея', () => {
  it('звонит агентом по своему адресу и говорит «connected» только после открытия', () => {
    const { socket } = fakeSocket()
    const states: string[] = []
    const urls: string[] = []
    const link = new RelayLink({
      address: Buffer.alloc(16, 7),
      relayUrl: 'wss://relay.example/',
      outbox: new RemoteOutbox(),
      onFrame: () => undefined,
      onState: (state) => states.push(state),
      createSocket: (url) => {
        urls.push(url)

        return socket
      },
    })

    link.start()
    expect(urls).toEqual([
      `wss://relay.example/v1/agent?id=${Buffer.alloc(16, 7).toString('base64url')}`,
    ])
    expect(states).toEqual(['connecting'])

    socket.readyState = 1
    socket.onopen?.({})
    expect(states.at(-1)).toBe('connected')

    socket.onclose?.({ code: 4001 })
    expect(states.at(-1)).toBe('refused')
    link.stop()
  })

  it('вытеснение (4009) - своё состояние, и линия продолжает звонить', () => {
    vi.useFakeTimers()

    const sockets: ReturnType<typeof fakeSocket>[] = []
    const states: string[] = []
    const link = new RelayLink({
      address: Buffer.alloc(16, 7),
      relayUrl: 'wss://relay.example',
      outbox: new RemoteOutbox(),
      onFrame: () => undefined,
      onState: (state) => states.push(state),
      createSocket: () => {
        const made = fakeSocket()

        sockets.push(made)

        return made.socket
      },
    })

    link.start()

    for (let round = 0; round < DISPLACED_LIMIT + 3; round += 1) {
      const { socket } = sockets.at(-1) ?? fakeSocket()

      socket.readyState = 1
      socket.onopen?.({})
      socket.onclose?.({ code: 4009 })
      expect(link.state).toBe('displaced')
      vi.advanceTimersByTime(DISPLACED_LONG_PAUSE_MS * 1.3)
    }

    expect(sockets).toHaveLength(DISPLACED_LIMIT + 4)
    expect(states).not.toContain('refused')
    link.stop()
    vi.useRealTimers()
  })

  it('сердцебиение - пустой кадр самому себе, а вернувшийся не уходит наверх', () => {
    vi.useFakeTimers()

    const { socket, sent } = fakeSocket()
    const frames: unknown[] = []
    const address = Buffer.alloc(16, 3)
    const link = new RelayLink({
      address,
      relayUrl: 'ws://localhost:1',
      outbox: new RemoteOutbox(),
      onFrame: (envelope) => frames.push(envelope),
      onState: () => undefined,
      createSocket: () => socket,
    })

    link.start()
    socket.readyState = 1
    socket.onopen?.({})
    link.checkAlive()

    const [echo] = sent

    expect(echo?.length).toBe(42)
    socket.onmessage?.({ data: echo ? new Uint8Array(echo).buffer : null })
    expect(frames).toHaveLength(0)
    link.stop()
    vi.useRealTimers()
  })
})

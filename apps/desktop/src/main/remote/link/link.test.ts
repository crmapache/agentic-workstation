import { it, vi, expect, describe } from 'vitest'

import { Backoff, classifyClose, DISPLACED_LIMIT, NETWORK_CEILING_MS } from './backoff'
import { RemoteOutbox } from './outbox'
import type { SocketLike } from './relay-link'
import { RelayLink } from './relay-link'

const frame = (fill: number, size = 4) => Buffer.alloc(size, fill)

describe('пауза перед новым звонком', () => {
  it('отказ по существу - стоп, вытеснение - ограниченное число возвратов', () => {
    const backoff = new Backoff(() => 0.5)

    expect(backoff.next('fatal')).toBeNull()

    for (let round = 0; round < DISPLACED_LIMIT; round += 1)
      expect(backoff.next('displaced')).not.toBeNull()

    expect(backoff.next('displaced')).toBeNull()
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

    const sent = outbox.drain(() => null)

    expect(sent.map((item) => [item.deviceId, item.frame[0]])).toEqual([
      ['a', 9],
      ['a', 1],
      ['b', 2],
    ])
    expect(outbox.size()).toBe(0)
  })

  it('переполненная схлопывается в одно «переспроси», соседняя не страдает', () => {
    const outbox = new RemoteOutbox(2, 1000)

    outbox.offer('phone', frame(1))
    outbox.offer('phone', frame(2))
    outbox.offer('phone', frame(3))
    outbox.offer('laptop', frame(4))

    const sent = outbox.drain((deviceId) => (deviceId === 'phone' ? frame(0xee) : null))

    expect(sent.map((item) => [item.deviceId, item.frame[0]])).toEqual([
      ['phone', 0xee],
      ['laptop', 4],
    ])
  })

  it('не ушедшее возвращается в начало своей очереди', () => {
    const outbox = new RemoteOutbox()

    outbox.offer('a', frame(1))
    outbox.offer('a', frame(2))

    const [, second] = outbox.drain(() => null)

    outbox.offer('a', frame(3))
    outbox.putBack(second ? [second] : [])

    expect(outbox.drain(() => null).map((item) => item.frame[0])).toEqual([2, 3])
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

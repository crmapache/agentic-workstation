import type { Socket } from 'node:net'
import { connect, createServer } from 'node:net'

import { it, expect, describe, afterEach } from 'vitest'

import { latencyFrom, startLatencyProxy } from './latency-proxy'

/**
 * Прокси задержки для сквозной проверки телефона: без него e2e не видит гонок «ответ пришёл на
 * другой экран», поэтому проверяется сам - держит байты в пути не меньше заданного, не
 * переставляет их и отдаёт конец потока после них.
 */

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Цель за прокси: отвечает эхом и помнит, когда что пришло. */
const echoServer = async () => {
  const arrived: { at: number; text: string }[] = []
  const server = createServer((socket) => {
    socket.on('data', (chunk) => {
      arrived.push({ at: Date.now(), text: chunk.toString() })
      socket.write(chunk)
    })
    socket.on('end', () => socket.end())
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())))

  const address = server.address()

  return { port: typeof address === 'object' && address ? address.port : 0, arrived }
}

const ended = (socket: Socket) =>
  new Promise<string>((resolve) => {
    let text = ''

    socket.on('data', (chunk) => (text += chunk.toString()))
    socket.on('end', () => resolve(text))
  })

describe('задержка сети для e2e', () => {
  it('держит байты в пути в обе стороны, порядок и конец потока - как были', async () => {
    const target = await echoServer()
    const proxy = await startLatencyProxy(target.port, { min: 60, max: 90 })

    cleanups.push(() => proxy.close())

    const socket = connect({ port: proxy.port, host: '127.0.0.1' })
    const echoed = ended(socket)
    const sentAt = Date.now()

    for (const part of ['one ', 'two ', 'three ', 'four']) socket.write(part)
    socket.end()

    expect(await echoed).toBe('one two three four')
    expect(Date.now() - sentAt).toBeGreaterThanOrEqual(120)
    expect(target.arrived.map((one) => one.text).join('')).toBe('one two three four')
    expect((target.arrived[0]?.at ?? 0) - sentAt).toBeGreaterThanOrEqual(60)
  })

  it('задержка из переменной: ровно, в пределах, выключена; кривое - по умолчанию', () => {
    const fallback = { min: 80, max: 150 }

    expect(latencyFrom('120', fallback)).toEqual({ min: 120, max: 120 })
    expect(latencyFrom('80-150', fallback)).toEqual({ min: 80, max: 150 })
    expect(latencyFrom(' 150 - 80 ', fallback)).toEqual({ min: 80, max: 150 })
    expect(latencyFrom('0', fallback)).toEqual({ min: 0, max: 0 })
    expect(latencyFrom(undefined, fallback)).toBe(fallback)
    expect(latencyFrom('fast', fallback)).toBe(fallback)
  })
})

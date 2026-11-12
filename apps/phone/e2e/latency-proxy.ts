import type { Socket } from 'node:net'
import { connect, createServer } from 'node:net'

/**
 * Задержка сети для сквозной проверки: TCP-прокси перед своим релеем, который отдаёт каждый
 * кусок байтов дальше не сразу, а через заданное время - в обе стороны и для страницы, и для
 * IDE. Локально кадр идёт доли миллисекунды, а у боевого релея - десятки и сотни: гонки, которые
 * видны только с задержкой (ответ пришёл, когда экран уже другой), без неё не воспроизводятся.
 * Прокси на уровне байтов, а не кадров: релей не знает о нём ничего, его код не тронут, а
 * HTTP (страница, /v1/info) и WebSocket идут одной дорогой, как через настоящую сеть.
 */

/** Задержка в одну сторону: ровно столько или случайно в пределах, мс. */
export type Latency = { min: number; max: number }

/** Без задержки: прокси не нужен вовсе. */
export const NO_LATENCY: Latency = { min: 0, max: 0 }

/**
 * Задержка из переменной окружения: `120` - ровно, `80-150` - случайно в пределах, `0` -
 * выключить. Пусто или нечитаемо - fallback.
 */
export const latencyFrom = (raw: string | undefined, fallback: Latency): Latency => {
  const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(raw ?? '')

  if (!match) return fallback

  const min = Number(match[1])
  const max = Number(match[2] ?? match[1])

  return { min: Math.min(min, max), max: Math.max(min, max) }
}

type Due = { at: number; chunk: Buffer | null }

/**
 * Одна сторона трубы: куски встают в очередь со сроком и уходят по сроку. Срок не раньше срока
 * предыдущего куска - иначе случайная задержка переставила бы байты, а TCP их не переставляет.
 * null в очереди - конец потока, тоже после всех байтов перед ним; оборванный без конца поток
 * (ошибка, сброс) кончается так же - другой стороне не остаётся висеть.
 */
const delayInto = (from: Socket, to: Socket, latency: Latency): void => {
  const queue: Due[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = 0
  let ended = false

  const delay = () => latency.min + Math.floor(Math.random() * (latency.max - latency.min + 1))

  const pump = () => {
    timer = null

    while (queue.length > 0 && (queue[0]?.at ?? 0) <= Date.now()) {
      const { chunk } = queue.shift() as Due

      if (to.destroyed) return
      if (chunk === null) to.end()
      else to.write(chunk)
    }

    if (queue.length > 0) timer = setTimeout(pump, Math.max(0, (queue[0]?.at ?? 0) - Date.now()))
  }

  const enqueue = (chunk: Buffer | null) => {
    if (ended) return
    if (chunk === null) ended = true

    last = Math.max(last, Date.now() + delay())
    queue.push({ at: last, chunk })
    timer ??= setTimeout(pump, Math.max(0, last - Date.now()))
  }

  from.on('data', (chunk: Buffer) => enqueue(chunk))
  from.on('end', () => enqueue(null))
  from.on('close', () => enqueue(null))
}

/**
 * Прокси на свободном порту перед портом цели. close - закрыть его и все трубы: сокеты,
 * оставшиеся висеть, держали бы процесс теста.
 */
export const startLatencyProxy = async (targetPort: number, latency: Latency) => {
  const pipes = new Set<Socket>()
  const server = createServer({ allowHalfOpen: true }, (inbound) => {
    const outbound = connect({ port: targetPort, host: '127.0.0.1', allowHalfOpen: true })

    for (const socket of [inbound, outbound]) {
      pipes.add(socket)
      socket.setNoDelay(true)
      // За ошибкой всегда идёт close, а он кончает и другую сторону - после её байтов в пути.
      socket.on('error', () => undefined)
      socket.on('close', () => pipes.delete(socket))
    }

    delayInto(inbound, outbound, latency)
    delayInto(outbound, inbound, latency)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of pipes) socket.destroy()
        server.close(() => resolve())
      }),
  }
}

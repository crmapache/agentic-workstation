import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { HostLink, PROBE_EVERY_MS } from './host-link'

/**
 * Связь без host (установленной IDE нет) и окно значка, которое перерисовывается по каждому
 * «изменилось»: проба host не должна сама вызывать перерисовку - иначе окно дёргалось без конца.
 */

type FakePort = {
  onMessage: { addListener: (listener: (message: unknown) => void) => void }
  onDisconnect: { addListener: (listener: () => void) => void }
  postMessage: () => void
  disconnect: () => void
}

let connects = 0
let dropPort: (() => void) | null = null

const fakeChrome = {
  runtime: {
    lastError: undefined as { message: string } | undefined,
    connectNative: (): FakePort => {
      connects += 1

      return {
        onMessage: { addListener: () => undefined },
        onDisconnect: {
          addListener: (listener) => {
            dropPort = listener
          },
        },
        postMessage: () => undefined,
        disconnect: () => undefined,
      }
    },
  },
}

/** Chrome закрыл порт: host не найден. */
const hostNotFound = () => {
  fakeChrome.runtime.lastError = { message: 'Specified native messaging host not found.' }
  dropPort?.()
  fakeChrome.runtime.lastError = undefined
}

const missingLink = () => {
  const changed = vi.fn()
  const link = new HostLink('installed', {
    hello: () => Promise.reject(new Error('unused')),
    handle: () => Promise.resolve(null),
    welcome: () => undefined,
    gone: () => undefined,
    changed,
  })

  link.connect()
  hostNotFound()
  changed.mockClear()

  return { link, changed }
}

beforeEach(() => {
  connects = 0
  dropPort = null
  vi.stubGlobal('chrome', fakeChrome)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('связь с IDE без установленного host', () => {
  it('проба из окна - тихая: состояние не прыгает, окну не шлют «изменилось»', () => {
    const { link, changed } = missingLink()

    expect(link.state).toBe('host-missing')

    link.retry(1_000_000)

    expect(connects).toBe(2)
    expect(link.state).toBe('host-missing')

    hostNotFound()

    expect(link.state).toBe('host-missing')
    expect(changed).not.toHaveBeenCalled()
  })

  it('частые пробы подряд - одна в пять секунд', () => {
    const { link } = missingLink()
    const start = 2_000_000

    link.retry(start)
    hostNotFound()
    link.retry(start + 100)
    link.retry(start + PROBE_EVERY_MS - 1)

    expect(connects).toBe(2)

    link.retry(start + PROBE_EVERY_MS)

    expect(connects).toBe(3)
  })
})

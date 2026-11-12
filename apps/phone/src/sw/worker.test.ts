import { it, expect, describe } from 'vitest'

import en from '../locales/en.json'
import type { MachineRecord } from '../remote/keystore'
import { NOTICE, pairedMachine } from '../push/__fixtures__/sealed-push'
import type {
  WorkerScope,
  ShownOptions,
  PushEventLike,
  WindowClientLike,
  NotificationClickLike,
} from './sw.types'
import { safeScreenUrl, installServiceWorker } from './worker'

/**
 * Сервис-воркер на подделке своего окружения: пуш открывается ключами пары и показывает
 * уведомление; нажатие ведёт на экран - в открытое окно словом или новым окном.
 */

type Listener = (event: never) => void

const workerWith = (machines: readonly MachineRecord[], windows: WindowClientLike[] = []) => {
  const listeners = new Map<string, Listener>()
  const shown: { title: string; options: ShownOptions }[] = []
  const opened: string[] = []
  const scope = {
    location: { origin: 'https://relay.example' },
    registration: {
      showNotification: (title: string, options: ShownOptions) => {
        shown.push({ title, options })

        return Promise.resolve()
      },
    },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url)

        return Promise.resolve(null)
      },
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => Promise.resolve(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  } as unknown as WorkerScope

  installServiceWorker(
    scope,
    { cacheName: 'aw-phone-test', shell: [], strings: en.push },
    { machines: () => Promise.resolve(machines) },
  )

  /** Событие воркеру; ответ - то, чего он ждёт (waitUntil). */
  const fire = async (type: string, event: object) => {
    let work: Promise<unknown> = Promise.resolve()

    ;(listeners.get(type) as (event: object) => void)({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        work = promise
      },
    })
    await work
  }

  return { fire, shown, opened }
}

const pushOf = (payload: Uint8Array | null): Omit<PushEventLike, 'waitUntil'> => ({
  data: payload ? { arrayBuffer: () => new Uint8Array(payload).buffer } : null,
})

describe('пуш в сервис-воркере', () => {
  it('открывается ключами пары: заголовок, текст, тег разговора и адрес экрана', async () => {
    const { machine, seal } = await pairedMachine()
    const { fire, shown } = workerWith([machine])

    await fire('push', pushOf(await seal()))

    expect(shown).toEqual([
      {
        title: 'Claude in demo needs you',
        options: {
          body: 'Fix the login bug: allow Bash?',
          tag: `${machine.agentId}:${NOTICE.tag}`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          renotify: true,
          data: {
            url: `/m/${machine.agentId}/p/${NOTICE.route.projectKey}/c/${NOTICE.tag.slice(2)}`,
          },
        },
      },
    ])
  })

  it('не открылся (пару забыли, пусто, мусор) - общее слово, но уведомление есть всегда', async () => {
    const { seal } = await pairedMachine()
    const { fire, shown } = workerWith([])

    await fire('push', pushOf(await seal()))
    await fire('push', pushOf(null))
    await fire('push', pushOf(Uint8Array.of(1, 2, 3)))

    expect(shown.map((one) => [one.title, one.options.body, one.options.data.url])).toEqual([
      ['Agentic Workstation', 'Your IDE needs you.', '/'],
      ['Agentic Workstation', 'Your IDE needs you.', '/'],
      ['Agentic Workstation', 'Your IDE needs you.', '/'],
    ])
  })
})

describe('нажатие на уведомление', () => {
  const screen = `/m/${'A'.repeat(22)}/p/p-${'k'.repeat(22)}/c/c1`

  const click = (url: unknown): Omit<NotificationClickLike, 'waitUntil'> => ({
    notification: { close: () => undefined, data: { url } },
  })

  it('окно открыто - слово «открой экран» и окно на передний план', async () => {
    const said: unknown[] = []
    let focused = 0
    const { fire, opened } = workerWith(
      [],
      [
        {
          url: 'https://relay.example/',
          postMessage: (message) => said.push(message),
          focus: () => Promise.resolve((focused += 1)),
        },
      ],
    )

    await fire('notificationclick', click(screen))

    expect(said).toEqual([{ k: 'aw-open', url: screen }])
    expect(focused).toBe(1)
    expect(opened).toEqual([])
  })

  it('окна нет - новое сразу на экране; чужой адрес - главный экран', async () => {
    const { fire, opened } = workerWith([])

    await fire('notificationclick', click(screen))
    await fire('notificationclick', click('https://evil.example/'))

    expect(opened).toEqual([screen, '/'])
    expect(safeScreenUrl('//evil.example/x')).toBe('/')
    expect(safeScreenUrl(42)).toBe('/')
  })
})

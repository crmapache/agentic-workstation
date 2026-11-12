import { it, expect, describe } from 'vitest'

import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import type { PushSubscriptionWire } from '@agentic-workstation/remote-protocol/push'

import { PushSync } from '../remote/push-sync'
import type {
  PushStatus,
  PushEnvironment,
  PushManagerLike,
  PushSubscriptionLike,
} from './push-setup'
import { PushSetup } from './push-setup'

/**
 * Включение уведомлений на подделке браузера: PushManager выдаёт подписки и помнит, каким
 * ключом их сделали; разрешение и ключ релея - руками теста.
 */

const relayKey = (fill: number) => Uint8Array.from({ length: 65 }, (_, at) => (at === 0 ? 4 : fill))

const KEY = relayKey(1)

const OTHER_KEY = relayKey(2)

const P256DH = toBase64Url(Uint8Array.from({ length: 65 }, (_, at) => (at === 0 ? 4 : at)))

const AUTH = toBase64Url(new Uint8Array(16).fill(7))

let endpoints = 0

/** Подписка браузера: адрес новый на каждую, ключ - каким подписались. */
const subscriptionOf = (key: Uint8Array, log: string[]): PushSubscriptionLike => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${(endpoints += 1)}`

  return {
    toJSON: () => ({ endpoint, keys: { p256dh: P256DH, auth: AUTH } }),
    options: { applicationServerKey: new Uint8Array(key).buffer },
    unsubscribe: () => {
      log.push(`unsubscribe ${endpoint}`)

      return Promise.resolve(true)
    },
  }
}

const browser = (
  over: Partial<{
    supported: boolean
    needsInstall: boolean
    permission: NotificationPermission
    answer: NotificationPermission
    key: Uint8Array | null
    existing: Uint8Array | null
    optedOut: boolean
  }> = {},
) => {
  const log: string[] = []
  const state = {
    permission: over.permission ?? 'default',
    optedOut: over.optedOut ?? false,
    current: null as PushSubscriptionLike | null,
  }

  if (over.existing) state.current = subscriptionOf(over.existing, log)

  const manager: PushManagerLike = {
    getSubscription: () => Promise.resolve(state.current),
    subscribe: (options) => {
      log.push(`subscribe ${options.applicationServerKey[1] ?? 0}`)
      state.current = subscriptionOf(options.applicationServerKey, log)

      return Promise.resolve(state.current)
    },
  }
  const key = over.key === undefined ? KEY : over.key
  const env: PushEnvironment = {
    supported: over.supported ?? true,
    needsInstall: over.needsInstall ?? false,
    permission: () => state.permission,
    requestPermission: () => {
      log.push('ask')
      state.permission = over.answer ?? 'granted'

      return Promise.resolve(state.permission)
    },
    pushManager: () => Promise.resolve(manager),
    relayKey: () => Promise.resolve(key ? toBase64Url(key) : null),
    optedOut: {
      read: () => state.optedOut,
      write: (value) => {
        state.optedOut = value
      },
    },
  }
  const sent: (PushSubscriptionWire | null)[] = []
  const statuses: PushStatus[] = []
  const setup = new PushSetup(
    env,
    (subscription) => sent.push(subscription),
    (status) => statuses.push(status),
  )

  return { setup, sent, statuses, log, state }
}

describe('уведомления на телефоне', () => {
  it('браузер не умеет - unsupported; iPhone во вкладке - «добавь на экран Домой»', async () => {
    const plain = browser({ supported: false })
    const iphone = browser({ supported: false, needsInstall: true })

    await plain.setup.start()
    await iphone.setup.start()

    expect(plain.setup.status).toBe('unsupported')
    expect(iphone.setup.status).toBe('install')
    expect(await iphone.setup.enable()).toBe(false)
    expect([...plain.sent, ...iphone.sent]).toEqual([])
  })

  it('релей без пушей - предлагать нечего, IDE ничего не говорится', async () => {
    const { setup, sent } = browser({ key: null })

    await setup.start()

    expect(setup.status).toBe('unavailable')
    expect(sent).toEqual([])
  })

  it('кнопка: разрешение первым шагом, подписка ключом релея, подписка - IDE', async () => {
    const { setup, sent, log, statuses } = browser()

    await setup.start()
    expect(setup.status).toBe('off')
    expect(sent).toEqual([null])

    expect(await setup.enable()).toBe(true)
    expect(log).toEqual(['ask', 'subscribe 1'])
    expect(statuses.slice(-2)).toEqual(['working', 'on'])
    expect(sent.at(-1)).toMatchObject({ p256dh: P256DH, auth: AUTH })
    expect(sent.at(-1)?.endpoint.startsWith('https://fcm.googleapis.com/')).toBe(true)
  })

  it('запретили - denied, и при запуске IDE слышит «выключено»', async () => {
    const asked = browser({ answer: 'denied' })

    await asked.setup.start()
    expect(await asked.setup.enable()).toBe(false)
    expect(asked.setup.status).toBe('denied')

    const blocked = browser({ permission: 'denied' })

    await blocked.setup.start()
    expect(blocked.setup.status).toBe('denied')
    expect(blocked.sent).toEqual([null])
  })

  it('при запуске с разрешением: своя подписка - IDE как есть; чужим ключом релея - заново', async () => {
    const same = browser({ permission: 'granted', existing: KEY })

    await same.setup.start()
    expect(same.setup.status).toBe('on')
    expect(same.log).toEqual([])
    expect(same.sent).toHaveLength(1)

    const rotated = browser({ permission: 'granted', existing: OTHER_KEY })

    await rotated.setup.start()
    expect(rotated.setup.status).toBe('on')
    expect(rotated.log).toEqual([expect.stringMatching(/^unsubscribe/), 'subscribe 1'])

    // Браузер снял подписку сам, разрешение осталось - вернуть молча, без вопроса.
    const lost = browser({ permission: 'granted' })

    await lost.setup.start()
    expect(lost.log).toEqual(['subscribe 1'])
  })

  it('выключили здесь - подписка снята, IDE «выключено», и запуск её не возвращает', async () => {
    const { setup, sent, log, state } = browser({ permission: 'granted', existing: KEY })

    await setup.start()
    await setup.disable()

    expect(setup.status).toBe('off')
    expect(state.optedOut).toBe(true)
    expect(sent.at(-1)).toBeNull()
    expect(log).toEqual([expect.stringMatching(/^unsubscribe/)])

    await setup.start()
    expect(setup.status).toBe('off')
    expect(log.filter((line) => line.startsWith('subscribe'))).toEqual([])

    await setup.enable()
    expect(state.optedOut).toBe(false)
    expect(setup.status).toBe('on')
  })
})

describe('подписка - каждой IDE', () => {
  it('пока не знаем - молчим; открытым - сразу, остальным - на их линии', () => {
    const said: [string, object][] = []
    const open = ['A']
    const sync = new PushSync(
      (agentId, message) => said.push([agentId, message]),
      () => open,
    )

    sync.opened('A')
    expect(said).toEqual([])

    sync.set({ endpoint: 'https://fcm.googleapis.com/x', p256dh: P256DH, auth: AUTH })
    sync.opened('B')
    sync.set(null)

    expect(said.map(([agentId, message]) => [agentId, (message as { k: string }).k])).toEqual([
      ['A', 'pushSet'],
      ['B', 'pushSet'],
      ['A', 'pushClear'],
    ])
  })
})

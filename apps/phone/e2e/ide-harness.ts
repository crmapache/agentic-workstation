import type { Conversation, PendingRequest } from '@shared/claude'
import type { FeedItem } from '@shared/claude-feed'
import type { QueueAction, ScenarioQueue } from '@shared/scenario-queues'

import type { Config } from '@agentic-workstation/relay/config'
import { readConfig } from '@agentic-workstation/relay/config'
import type { RelayOptions } from '@agentic-workstation/relay/server'
import { createRelay } from '@agentic-workstation/relay/server'

import { RemoteService } from '../../desktop/src/main/remote/remote-service'
import type { JsonFile } from '../../desktop/src/main/storage/json-file'
import {
  QUEUE,
  itemOf,
  fakeIde,
  PERMISSION,
  CONVERSATION_ID,
} from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { StoredRemote } from '../../desktop/src/main/remote/store/remote-state'

/**
 * Настоящий релей на свободном порту и настоящий RemoteService главного процесса с подделками
 * сервисов IDE (фикстура main/remote/__fixtures__/fake-ide.ts), которые ещё и отвечают как
 * IDE: сообщение встаёт в ленту, ответ на разрешение снимает вопрос, запуск сценария даёт
 * очередь. Телефон - кто угодно с адресом релея: ядро клиента в Node или страница в Chromium.
 */

/** Файл в памяти, который помнит записанное: перезапуск IDE видит те же пары и подписки. */
const memoryFile = () => {
  let saved: StoredRemote | null = null

  return {
    read: () => Promise.resolve(saved),
    write: (value: StoredRemote) => {
      saved = value

      return Promise.resolve()
    },
  } as unknown as JsonFile<StoredRemote>
}

const memoryVault = {
  available: () => true,
  seal: (plain: Buffer) => plain.toString('base64'),
  open: (sealed: string) => Buffer.from(sealed, 'base64'),
}

export const until = async <T>(
  probe: () => T | null | undefined | false,
  what: string,
  timeout = 5000,
): Promise<T> => {
  for (let waited = 0; waited < timeout; waited += 20) {
    const value = probe()

    if (value !== null && value !== undefined && value !== false) return value

    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error(`timed out waiting for ${what}`)
}

export const MODELS = [
  { value: 'opus', displayName: 'Opus 5.5', description: 'Most capable' },
  { value: 'sonnet', displayName: 'Sonnet 5', description: 'Fast and smart' },
]

/** Вопрос разрешения - тот же, что у подделок IDE (fake-ide.ts). */
export { PERMISSION }

export type Harness = Awaited<ReturnType<typeof startHarness>>

/**
 * Боевой релей вместо своего (проверка после выкладки): `https://…` в переменной. Страницу
 * телефона тогда раздаёт он же - та сборка, что выложена, а не локальная dist.
 */
const LIVE_RELAY = process.env['AGENTIC_WORKSTATION_PHONE_LIVE_RELAY'] ?? ''

/** Что релей отдал службе пушей - подписка и payload, как их видит он. */
export type PushOrder = Parameters<NonNullable<RelayOptions['pushSender']>>[0]

/** Свой релей на свободном порту или боевой; close - погасить свой (боевой не трогаем). */
const relayFor = async (staticDir: string, push: RelayPush | null) => {
  if (LIVE_RELAY) {
    return {
      relayUrl: LIVE_RELAY.replace(/^http/, 'ws'),
      pageUrl: LIVE_RELAY,
      close: () => Promise.resolve(),
    }
  }

  const relay = createRelay(
    {
      ...readConfig({}),
      staticDir,
      logLevel: 'silent',
      ...(push ? { push: push.keys, pushOff: '' } : {}),
    },
    () => undefined,
    push ? { pushSender: push.sender } : {},
  )
  const port = await relay.listen(0)

  return {
    relayUrl: `ws://127.0.0.1:${port}`,
    pageUrl: `http://127.0.0.1:${port}`,
    close: () => relay.close(),
  }
}

/** Пуши у своего релея: ключи VAPID теста и служба пушей - подделка, настоящим не звоним. */
type RelayPush = {
  keys: NonNullable<Config['push']>
  sender: NonNullable<RelayOptions['pushSender']>
}

export const startHarness = async (options: { staticDir?: string; push?: RelayPush } = {}) => {
  const relay = await relayFor(options.staticDir ?? '', options.push ?? null)
  const file = memoryFile()
  const { relayUrl } = relay
  const ide = fakeIde()
  const { state, feed, queues } = ide
  let service: RemoteService | null = null
  const changed = () => service?.claudeChanged(state)
  const conversation = () => state.conversations[0] as Conversation
  const update = (over: Partial<Conversation>) => {
    state.conversations = [{ ...conversation(), ...over }, ...state.conversations.slice(1)]
    changed()
  }
  const push = (...items: FeedItem[]) => {
    feed.items.push(...items)
    service?.feedPatched({ conversationId: CONVERSATION_ID, upserts: items })
  }
  const queueAct = (queueId: string, action: QueueAction) => {
    queues.queues = queues.queues.map((queue): ScenarioQueue => {
      if (queue.id !== queueId) return queue
      if (action.kind === 'stopAfter') return { ...queue, stopAfterItemId: action.itemId ?? '' }
      if (action.kind === 'rename') return { ...queue, name: action.name, nameSource: 'user' }

      return queue
    })
    service?.queuesChanged()
  }

  state.models = MODELS
  ide.ports.conversations = {
    ...ide.ports.conversations,
    send: (id, message) => {
      ide.calls.push({ name: 'send', args: [id, message] })
      push({
        id: `u${feed.items.length + 1}`,
        kind: 'user',
        text: message.text,
        time: Date.now(),
        images: message.images.map(() => ({ thumbnail: '' })),
        steering: false,
        parentToolUseId: null,
      })

      return Promise.resolve(null)
    },
    respond: (id, requestId, response) => {
      ide.calls.push({ name: 'respond', args: [id, requestId, response] })
      update({ pending: null, status: 'running' })

      return null
    },
  }
  ide.ports.scenarios = {
    ...ide.ports.scenarios,
    start: (request) => {
      ide.calls.push({ name: 'scenarios.start', args: [request] })
      queues.queues = [
        ...queues.queues,
        {
          ...QUEUE,
          id: 'q2',
          name: 'Tidy src',
          workdir:
            request.target.kind === 'new' && !request.target.worktree
              ? { kind: 'project' }
              : QUEUE.workdir,
          items: [{ ...(QUEUE.items[0] as ScenarioQueue['items'][number]), id: 'i2', runId: 'r2' }],
        },
      ]
      service?.queuesChanged()

      return Promise.resolve({ ok: true, queueId: 'q2', itemId: 'i2' })
    },
    act: (queueId, action) => {
      ide.calls.push({ name: 'scenarios.act', args: [queueId, action] })
      queueAct(queueId, action)

      return Promise.resolve(null)
    },
  }

  const load = () =>
    RemoteService.load({
      file,
      vault: memoryVault,
      ports: ide.ports,
      relayUrl,
      machine: () => ({ label: 'Agentic Workstation on test-mac', ideVersion: '0.1.0' }),
      onView: () => undefined,
    })
  let live = await load()

  service = live
  live.setEnabled(true)
  await until(() => live.view().state === 'connected', 'IDE on the relay')

  return {
    relayUrl,
    pageUrl: relay.pageUrl,
    /** Сервис IDE сейчас - после restart другой. */
    get service() {
      return live
    },
    ide,
    /** IDE перезапустили (тот же профиль): телефоны ей пока не слышны. */
    restart: async () => {
      await live.shutdown()
      live = await load()
      service = live
      await until(() => live.view().state === 'connected', 'IDE back on the relay')
    },
    /** Новый код пары - адрес, который IDE рисует QR. */
    pairingUrl: () => live.startPairing().pairing?.url ?? '',
    /** Человек в IDE нажал Approve, когда телефон попросился. */
    approve: async () => {
      const pending = await until(() => live.view().pending, 'a phone asking to pair', 15_000)

      live.approve({ deviceId: pending.deviceId, fingerprint: pending.fingerprint })

      return pending
    },
    update,
    push,
    ask: (pending: PendingRequest = PERMISSION) =>
      update({ pending, status: 'waiting', pendingCount: 1 }),
    say: (id: string, text: string) => push(itemOf(id, text)),
    close: async () => {
      await live.shutdown()
      await relay.close()
    },
  }
}

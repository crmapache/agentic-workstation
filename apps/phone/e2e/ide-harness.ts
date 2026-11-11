import type { Conversation, PendingRequest } from '@shared/claude'
import type { FeedItem } from '@shared/claude-feed'
import type { QueueAction, ScenarioQueue } from '@shared/scenario-queues'

import { readConfig } from '@agentic-workstation/relay/config'
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

export const startHarness = async (options: { staticDir?: string } = {}) => {
  const relay = createRelay(
    { ...readConfig({}), staticDir: options.staticDir ?? '', logLevel: 'silent' },
    () => undefined,
  )
  const port = await relay.listen(0)
  const relayUrl = `ws://127.0.0.1:${port}`
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

  service = await RemoteService.load({
    file: memoryFile(),
    vault: memoryVault,
    ports: ide.ports,
    relayUrl,
    machine: () => ({ label: 'Agentic Workstation on test-mac', ideVersion: '0.1.0' }),
    onView: () => undefined,
  })
  service.setEnabled(true)
  await until(() => service?.view().state === 'connected', 'IDE on the relay')

  const live = service

  return {
    relay,
    relayUrl,
    pageUrl: `http://127.0.0.1:${port}`,
    service: live,
    ide,
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

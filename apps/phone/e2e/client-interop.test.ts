import { it, expect, describe, afterEach } from 'vitest'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import type { KeyStore } from '../src/remote/keystore'
import { memoryKeyStore } from '../src/remote/keystore'
import type { SocketLike } from '../src/remote/relay-socket'
import { RemoteClient } from '../src/remote/remote-client'
import { CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'

/**
 * Ядро телефона (apps/phone/src/remote) против настоящей IDE: настоящий релей, настоящий
 * RemoteService главного процесса и его шифрование на node:crypto, телефон - на WebCrypto и
 * WebSocket, как в браузере. Сходится байт в байт - или пара не проходит вовсе.
 */

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const harness = async (): Promise<Harness> => {
  const started = await startHarness()

  cleanups.push(() => started.close())

  return started
}

type Inbox = { messages: AgentMessage[]; feeds: FeedView[] }

const phone = async (relayUrl: string, store: KeyStore = memoryKeyStore()) => {
  const client = await RemoteClient.create({
    store,
    relayUrl,
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    client: { name: 'interop-test', version: '1' },
  })
  const inbox: Inbox = { messages: [], feeds: [] }

  client.events.on('message', (_agentId, message) => inbox.messages.push(message))
  client.events.on('feed', (_agentId, view) => inbox.feeds.push(view))
  client.start()
  cleanups.push(() => client.stop())

  return { client, inbox, store }
}

const pairPhone = async (ide: Harness, label = 'Interop phone') => {
  const url = new URL(ide.pairingUrl())
  const code = parsePairingFragment(url.hash)

  if (!code) throw new Error('the IDE gave a pairing code the phone does not read')

  const side = await phone(ide.relayUrl)
  const offer = await side.client.preparePairing(code)
  const outcome = side.client.pair(offer, label)
  const pending = await ide.approve()

  return { ...side, code, offer, pending, outcome: await outcome }
}

const lastOf = <K extends AgentMessage['k']>(inbox: Inbox, kind: K) =>
  inbox.messages.findLast(
    (message): message is Extract<AgentMessage, { k: K }> => message.k === kind,
  )

describe('ядро телефона против настоящей IDE', () => {
  it('пара: отпечатки сходятся, IDE видит телефон, телефон получает список без путей', async () => {
    const ide = await harness()
    const { client, inbox, offer, pending, outcome, code } = await pairPhone(ide)

    expect(outcome.ok).toBe(true)
    // Отпечаток телефона, который человек видит на телефоне, - тот же, что IDE показала у Approve.
    expect(pending.fingerprint.replaceAll(' ', '')).toBe(offer.phoneFingerprint)
    expect(pending.label).toBe('Interop phone')
    expect(client.machines()).toEqual([
      expect.objectContaining({ agentId: code.agentId, label: 'Agentic Workstation on test-mac' }),
    ])

    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')

    expect(JSON.stringify(inventory)).not.toContain('/Users/')
    expect(inventory.projects[0]).toMatchObject({ name: 'secret-client', open: true })
    expect(client.status(code.agentId)).toBe('online')
  })

  it('лента: снимок, сообщение до сервиса, живая заплатка, ответ на разрешение без «всегда»', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    client.watch(agentId, { kind: 'conversation', conversationId: CONVERSATION_ID })

    const snapshot = await until(() => inbox.feeds.at(-1), 'feed snapshot')

    expect(snapshot.items.map((item) => item.id)).toEqual(['u1', 'a1'])

    const sent = await client.command(agentId, 'conversation.send', {
      conversationId: CONVERSATION_ID,
      text: 'Run the tests',
    })

    expect(sent).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'Run the tests', images: [] }],
    })

    ide.say('a2', 'Running them now')

    const patched = await until(
      () => inbox.feeds.find((view) => view.items.some((item) => item.id === 'a2')),
      'live patch',
    )

    expect(patched.items.map((item) => item.id)).toEqual(['u1', 'a1', 'u3', 'a2'])

    ide.ask()

    const asked = await until(
      () =>
        inbox.messages.find(
          (message) => message.k === 'conversation' && message.conversation.pending !== null,
        ),
      'permission request',
    )

    expect(asked).toMatchObject({ conversation: { pending: { kind: 'permission' } } })

    const answered = await client.command(agentId, 'conversation.respond', {
      conversationId: CONVERSATION_ID,
      requestId: 'perm-1',
      decision: { kind: 'permission', allow: true },
    })

    expect(answered).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'respond',
      args: [CONVERSATION_ID, 'perm-1', { kind: 'permission', decision: { behavior: 'allow' } }],
    })
  })

  it('фото частями: сообщение тяжелее кадра собирается в IDE целиком', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)

    await until(() => lastOf(inbox, 'inventory'), 'inventory')

    const data = 'A'.repeat(400_000)
    const sent = await client.command(code.agentId, 'conversation.send', {
      conversationId: CONVERSATION_ID,
      text: 'Look at this',
      images: [{ mediaType: 'image/png', data }],
    })

    expect(sent).toEqual({ ok: true })
    expect(ide.ide.calls).toContainEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'Look at this', images: [{ mediaType: 'image/png', data }] }],
    })
  })

  it('сценарии: запуск в новой очереди и «остановить после текущего»', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const projectKey = inventory.projects[0]?.key ?? ''

    client.watch(code.agentId, { kind: 'queues', scope: projectKey })
    await until(() => lastOf(inbox, 'queues'), 'queues')

    const started = await client.command(code.agentId, 'scenarios.start', {
      projectKey,
      scenarioId: 'tidy',
      scope: 'project',
      inputs: { what: 'src' },
      provider: 'claude',
      target: { kind: 'new', worktree: true },
      afterSuccess: false,
    })

    expect(started).toEqual({ ok: true, data: { queueId: 'q2', itemId: 'i2' } })

    const stopped = await client.command(code.agentId, 'scenarios.queue', {
      queueId: 'q1',
      action: { kind: 'stopAfter', itemId: 'i1' },
    })

    expect(stopped).toEqual({ ok: true })
    await until(
      () => lastOf(inbox, 'queues')?.queues.find((queue) => queue.stopAfterItemId === 'i1'),
      'queue stopping after the current item',
    )
  })

  it('возвращение без QR: та же пара после перезапуска страницы, потом отзыв', async () => {
    const ide = await harness()
    const first = await pairPhone(ide)

    await until(() => lastOf(first.inbox, 'inventory'), 'first inventory')
    first.client.stop()

    // Новая страница с тем же хранилищем: ключ пары тот же, ключи соединения - новые.
    const again = await phone(ide.relayUrl, first.store)

    await until(() => lastOf(again.inbox, 'inventory'), 'inventory after resume')
    expect(again.client.status(first.code.agentId)).toBe('online')

    ide.service.revoke(ide.service.view().devices[0]?.id ?? '')
    await until(() => again.client.status(first.code.agentId) === 'revoked', 'revoked')
    expect(again.client.machines()[0]?.revoked).toBe(true)
  })

  it('чужой код: доказательство не под тем секретом - IDE молчит, пара не проходит', async () => {
    const ide = await harness()
    const url = new URL(ide.pairingUrl())
    const code = parsePairingFragment(url.hash)

    if (!code) throw new Error('no code')

    const side = await phone(ide.relayUrl)
    const offer = await side.client.preparePairing({ ...code, secret: new Uint8Array(16) })
    const outcome = side.client.pair(offer, 'Wrong secret')

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(ide.service.view().pending).toBeNull()
    side.client.cancelPairing()
    expect(await outcome).toEqual({ ok: false, reason: 'cancelled' })
  })
})

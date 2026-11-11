import { createECDH } from 'node:crypto'

import { it, expect, afterEach } from 'vitest'

import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import { parseRoute } from '../src/lib/routes'
import en from '../src/locales/en.json'
import { openPush } from '../src/push/push-open'
import { shownPush } from '../src/push/push-text'
import { memoryKeyStore } from '../src/remote/keystore'
import type { SocketLike } from '../src/remote/relay-socket'
import { RemoteClient } from '../src/remote/remote-client'
import { QUEUE, CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { PushOrder } from './ide-harness'
import { until, startHarness } from './ide-harness'

/**
 * Пуш целиком, кроме службы пушей: настоящая IDE (RemoteService) печатает уведомление ключом
 * пары на node:crypto, настоящий релей отдаёт его подделке службы, а код сервис-воркера
 * телефона (push-open, push-text) открывает его ключами из хранилища ядра на WebCrypto и ведёт
 * на экран разговора. Ключи VAPID - свои на тест, настоящим службам никто не звонит.
 */

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const testVapid = () => {
  for (;;) {
    const ecdh = createECDH('prime256v1')

    ecdh.generateKeys()

    if (ecdh.getPrivateKey().length === 32) {
      return {
        publicKey: ecdh.getPublicKey().toString('base64url'),
        privateKey: ecdh.getPrivateKey().toString('base64url'),
        subject: 'https://relay.example',
      }
    }
  }
}

const SUBSCRIPTION = {
  endpoint: 'https://web.push.apple.com/QGuQyavXutnMH7j1g0kVHw',
  p256dh: toBase64Url(Uint8Array.from({ length: 65 }, (_, at) => (at === 0 ? 4 : at))),
  auth: toBase64Url(new Uint8Array(16).fill(7)),
}

it('IDE будит телефон не на связи через релей; воркер телефона открывает пуш и ведёт на экран', async () => {
  const orders: PushOrder[] = []
  let answer = 201
  const ide = await startHarness({
    push: {
      keys: testVapid(),
      sender: (order) => {
        orders.push(order)

        return Promise.resolve(answer)
      },
    },
  })

  cleanups.push(() => ide.close())

  // Пара ядром телефона и подписка на пуши - каждой IDE.
  const code = parsePairingFragment(new URL(ide.pairingUrl()).hash)

  if (!code) throw new Error('no pairing code')

  const store = memoryKeyStore()
  const client = await RemoteClient.create({
    store,
    relayUrl: ide.relayUrl,
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    client: { name: 'push-interop', version: '1' },
  })

  client.start()
  cleanups.push(() => client.stop())

  const outcome = client.pair(await client.preparePairing(code), 'Interop phone')

  await ide.approve()
  expect((await outcome).ok).toBe(true)
  client.setPushSubscription(SUBSCRIPTION)
  await until(() => ide.service.view().devices[0]?.notifications, 'the subscription at the IDE')

  // Телефон в кармане, IDE перезапустили: разговор встал на вопросе разрешения - будим.
  client.stop()
  await ide.restart()
  ide.ask()

  const order = await until(() => orders[0], 'a push at the push service')

  expect(order.endpoint).toBe(SUBSCRIPTION.endpoint)
  expect(order.p256dh).toBe(SUBSCRIPTION.p256dh)
  expect(order.payload.toString('latin1')).not.toContain('secret-client')

  const opened = await openPush(new Uint8Array(order.payload), await store.loadMachines())
  const shown = shownPush(opened, en.push)

  expect(shown).toMatchObject({
    title: 'Claude in secret-client needs you',
    body: 'Fix the login bug: allow Bash?',
  })
  expect(parseRoute(shown.url)).toMatchObject({
    name: 'conversation',
    agentId: code.agentId,
    conversationId: CONVERSATION_ID,
  })

  // Служба сказала «такой подписки нет»: релей передаёт это IDE, и она подписку снимает.
  answer = 410
  ide.ide.queues.queues = [{ ...QUEUE, hold: { reason: 'failed', itemId: 'i1', at: Date.now() } }]
  ide.service.queuesChanged()
  await until(() => orders[1], 'the queue push')
  await until(
    () => ide.service.view().devices[0]?.notifications === false,
    'the IDE dropping the subscription',
  )
})

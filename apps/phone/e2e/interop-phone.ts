import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import type { KeyStore } from '../src/remote/keystore'
import { memoryKeyStore } from '../src/remote/keystore'
import type { SocketLike } from '../src/remote/relay-socket'
import { RemoteClient } from '../src/remote/remote-client'
import type { Harness } from './ide-harness'
import { startHarness } from './ide-harness'

/**
 * Телефон-ядро против настоящей IDE для сверочных тестов: своя IDE с релеем на тест, телефон на
 * WebCrypto и WebSocket, пара с Approve человека. Что подняли - гасит runCleanups после теста.
 */

export const cleanups: (() => Promise<void> | void)[] = []

/** Погасить всё, что поднял тест: телефоны, IDE, релей - в обратном порядке. */
export const runCleanups = async (): Promise<void> => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
}

export const harness = async (): Promise<Harness> => {
  const started = await startHarness()

  cleanups.push(() => started.close())

  return started
}

export type Inbox = { messages: AgentMessage[]; feeds: FeedView[] }

export const phone = async (relayUrl: string, store: KeyStore = memoryKeyStore()) => {
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

export const pairPhone = async (ide: Harness, label = 'Interop phone') => {
  const url = new URL(ide.pairingUrl())
  const code = parsePairingFragment(url.hash)

  if (!code) throw new Error('the IDE gave a pairing code the phone does not read')

  const side = await phone(ide.relayUrl)
  const offer = await side.client.preparePairing(code)
  const outcome = side.client.pair(offer, label)
  const pending = await ide.approve()

  return { ...side, code, offer, pending, outcome: await outcome }
}

export const lastOf = <K extends AgentMessage['k']>(inbox: Inbox, kind: K) =>
  inbox.messages.findLast(
    (message): message is Extract<AgentMessage, { k: K }> => message.k === kind,
  )

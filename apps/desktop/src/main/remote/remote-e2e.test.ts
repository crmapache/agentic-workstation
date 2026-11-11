import { it, expect, describe, afterEach } from 'vitest'

import { readConfig } from '@agentic-workstation/relay/config'
import type { Relay } from '@agentic-workstation/relay/server'
import { createRelay } from '@agentic-workstation/relay/server'

import type { JsonFile } from '../storage/json-file'
import { RemoteService } from './remote-service'
import { itemOf, fakeIde, PROJECT_PATH, CONVERSATION_ID } from './__fixtures__/fake-ide'
import { until, WebCryptoPhone } from './__fixtures__/webcrypto-phone'
import type { StoredRemote } from './store/remote-state'

/**
 * Remote Control целиком на одной машине: настоящий релей (apps/relay) на свободном порту,
 * настоящий RemoteService со встроенным WebSocket Node и подделками сервисов IDE, телефон на
 * WebCrypto через свой сокет к тому же релею. Пара → Approve → инвентарь → подписка на разговор
 * → снимок → сообщение → заплатка → команда сценарию → отзыв.
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

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/**
 * Боевой релей вместо своего (проверка после выкладки): `wss://…` в переменной. Тогда счёт
 * соединений не сверяется - на боевом релее сидят и другие, а перезапуск релея не проверяется.
 */
const LIVE_RELAY = process.env['AGENTIC_WORKSTATION_REMOTE_LIVE_RELAY'] ?? ''

const startRelay = async (): Promise<{ relay: Relay | null; url: string }> => {
  if (LIVE_RELAY) return { relay: null, url: LIVE_RELAY }

  const relay = createRelay(
    { ...readConfig({}), staticDir: '', logLevel: 'silent' },
    () => undefined,
  )
  const port = await relay.listen(0)

  cleanups.push(() => relay.close())

  return { relay, url: `ws://127.0.0.1:${port}` }
}

/** Телефон со своим сокетом к релею - как страница клиента в браузере. */
const connectPhone = async (relayUrl: string) => {
  let socket: WebSocket | null = null
  const phone = new WebCryptoPhone((frame) => socket?.send(frame))
  const opened = new WebSocket(`${relayUrl}/v1/device?id=${phone.deviceId}`)

  opened.binaryType = 'arraybuffer'
  opened.onmessage = (event: { data: unknown }) =>
    phone.receive(new Uint8Array(event.data as ArrayBuffer))
  await new Promise((resolve, reject) => {
    opened.onopen = resolve
    opened.onerror = reject
  })
  socket = opened
  cleanups.push(() => opened.close())

  return phone
}

describe('Remote Control: IDE, релей и телефон', () => {
  it('пара, инвентарь, лента, сообщение, команда сценарию и отзыв', async () => {
    const { relay, url } = await startRelay()
    const ide = fakeIde()
    const service = await RemoteService.load({
      file: memoryFile(),
      vault: memoryVault,
      ports: ide.ports,
      relayUrl: url,
      machine: () => ({ label: 'Agentic Workstation on test', ideVersion: '0.1.0' }),
      onView: () => undefined,
    })

    cleanups.push(() => service.shutdown())
    expect(service.view()).toMatchObject({ enabled: false, state: 'off', fingerprint: '' })

    service.setEnabled(true)
    await until(() => (service.view().state === 'connected' ? true : null), 'IDE on the relay')

    const phone = await connectPhone(url)

    if (relay) expect(relay.connections()).toBe(2)

    // Пара: QR → доказательство → Approve человека с отпечатком на экране.
    const pairing = service.startPairing().pairing

    expect(pairing?.url.startsWith(`${url.replace(/^ws/, 'http')}/pair#aw1.`)).toBe(true)

    const offer = await phone.pairInit(pairing?.url ?? '', 'Pixel')
    const pending = await until(() => service.view().pending, 'pending phone')

    expect(pending).toMatchObject({ deviceId: phone.deviceId, label: 'Pixel' })
    service.approve()
    await phone.pairAck(offer)

    // Инвентарь: проекты ключами, разговор, провайдер.
    await phone.send({ p: 1, k: 'hello', client: { name: 'test', version: '1' } })

    const inventory = await phone.next('inventory')

    expect(JSON.stringify(inventory)).not.toContain(PROJECT_PATH)
    expect(inventory).toMatchObject({
      machine: { label: 'Agentic Workstation on test' },
      projects: [
        {
          name: 'secret-client',
          open: true,
          conversations: [{ id: CONVERSATION_ID, provider: 'claude' }],
        },
        {},
      ],
    })
    expect(service.view().devices).toEqual([
      expect.objectContaining({ id: phone.deviceId, label: 'Pixel', online: true }),
    ])

    // Подписка на разговор: состояние и снимок ленты.
    await phone.send({ p: 1, k: 'subscribe', conversationId: CONVERSATION_ID })
    await phone.next('conversation')

    const snapshot = await phone.next('feed')

    expect(snapshot).toMatchObject({
      conversationId: CONVERSATION_ID,
      seq: 0,
      items: [{ id: 'u1' }, { id: 'a1' }],
    })

    // Сообщение с телефона доходит до сервиса разговоров.
    await phone.send({
      p: 1,
      k: 'cmd',
      id: 'm1',
      name: 'conversation.send',
      args: { conversationId: CONVERSATION_ID, text: 'Run the tests' },
    })
    expect(await phone.next('result', (message) => message['id'] === 'm1')).toMatchObject({
      ok: true,
    })
    expect(ide.calls).toContainEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'Run the tests', images: [] }],
    })

    // Ответ модели - заплаткой ленты.
    service.feedPatched({
      conversationId: CONVERSATION_ID,
      upserts: [itemOf('a2', 'Running them now')],
    })

    const patch = await phone.next('patch')

    expect(patch).toMatchObject({ seq: 1, upserts: [{ id: 'a2', text: 'Running them now' }] })

    // Команда сценарию: проект прогона находит IDE.
    await phone.send({
      p: 1,
      k: 'cmd',
      id: 's1',
      name: 'scenarios.control',
      args: { runId: 'r1', action: 'pause' },
    })
    expect(await phone.next('result', (message) => message['id'] === 's1')).toMatchObject({
      ok: true,
    })
    expect(ide.calls).toContainEqual({
      name: 'scenarios.control',
      args: [PROJECT_PATH, 'r1', 'pause'],
    })

    // Запрещённое - отказ, а не исполнение.
    await phone.send({ p: 1, k: 'cmd', id: 'x1', name: 'terminal.run', args: { command: 'ls' } })
    expect(await phone.next('result', (message) => message['id'] === 'x1')).toMatchObject({
      ok: false,
      code: 'unknownCommand',
    })

    // Отзыв: телефон узнаёт сразу, а его ключ больше ничего не открывает.
    service.revoke(phone.deviceId)
    await phone.next('revoked')
    expect(service.view().devices).toEqual([])

    const sentBefore = ide.calls.length

    await phone.send({
      p: 1,
      k: 'cmd',
      id: 'm2',
      name: 'conversation.send',
      args: { conversationId: CONVERSATION_ID, text: 'still here?' },
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(ide.calls.length).toBe(sentBefore)
  })

  it.skipIf(LIVE_RELAY)(
    'выключенная связь не держит линию, включённая переживает перезапуск релея',
    async () => {
      const started = await startRelay()
      const relay = started.relay as Relay
      const url = started.url
      const service = await RemoteService.load({
        file: memoryFile(),
        vault: memoryVault,
        ports: fakeIde().ports,
        relayUrl: url,
        machine: () => ({ label: 'test', ideVersion: '0' }),
        onView: () => undefined,
      })

      cleanups.push(() => service.shutdown())
      service.setEnabled(true)
      await until(() => (relay.connections() === 1 ? true : null), 'IDE on the relay')
      service.setEnabled(false)
      await until(() => (relay.connections() === 0 ? true : null), 'IDE gone from the relay')
      expect(service.view().state).toBe('off')
    },
  )
})

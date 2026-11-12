import { createECDH } from 'node:crypto'

import { it, expect, describe, afterEach } from 'vitest'

import { readConfig } from '@agentic-workstation/relay/config'
import type { Relay, RelayOptions } from '@agentic-workstation/relay/server'
import { createRelay } from '@agentic-workstation/relay/server'
import { fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import type { JsonFile } from '../storage/json-file'
import { RemoteService } from './remote-service'
import {
  itemOf,
  fakeIde,
  PERMISSION,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from './__fixtures__/fake-ide'
import { until, WebCryptoPhone } from './__fixtures__/webcrypto-phone'
import { projectKey as projectKeyOf } from './bridge/project-keys'
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

/** Что релей отдал службе пушей: подписка и payload, как их видит он. */
type PushOrder = Parameters<NonNullable<RelayOptions['pushSender']>>[0]

/** Файл в памяти, который помнит записанное: IDE перезапускается с тем же состоянием. */
const keptFile = () => {
  let saved: StoredRemote | null = null

  return {
    read: () => Promise.resolve(saved),
    write: (value: StoredRemote) => {
      saved = value

      return Promise.resolve()
    },
  } as unknown as JsonFile<StoredRemote>
}

/** Ключи VAPID на тест: служба пушей - подделка, настоящим звонить не нужно. */
const testVapid = () => {
  for (;;) {
    const ecdh = createECDH('prime256v1')

    ecdh.generateKeys()

    if (ecdh.getPrivateKey().length === 32) {
      return {
        publicKey: ecdh.getPublicKey().toString('base64url'),
        privateKey: ecdh.getPrivateKey().toString('base64url'),
      }
    }
  }
}

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

/**
 * Телефон со своим сокетом к релею - как страница клиента в браузере: сначала вызов релея и
 * подпись своим ключом, только потом адрес его.
 */
const connectPhone = async (relayUrl: string) => {
  let socket: WebSocket | null = null
  const phone = await WebCryptoPhone.create((frame) => socket?.send(frame))
  const opened = new WebSocket(`${relayUrl}/v1/device?id=${phone.deviceId}`)

  socket = opened
  opened.binaryType = 'arraybuffer'
  opened.onmessage = (event: { data: unknown }) =>
    phone.receive(new Uint8Array(event.data as ArrayBuffer))
  await new Promise((resolve, reject) => {
    opened.onopen = resolve
    opened.onerror = reject
  })
  cleanups.push(() => opened.close())
  await until(() => (phone.proven ? true : null), 'the phone proving its address')

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
    service.approve(pending)
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

    // Стук - лёгкий pong тем же номером: по нему телефон знает, что IDE жива.
    await phone.send({ p: 1, k: 'ping', n: 3 })
    expect(await phone.next('pong')).toMatchObject({ n: 3 })

    // Ответ на вопрос, которого уже нет, - отказ questionGone, а не «ок».
    await phone.send({
      p: 1,
      k: 'cmd',
      id: 'q1',
      name: 'conversation.respond',
      args: {
        conversationId: CONVERSATION_ID,
        requestId: 'gone',
        decision: { kind: 'permission', allow: true },
      },
    })
    expect(await phone.next('result', (message) => message['id'] === 'q1')).toMatchObject({
      ok: false,
      code: 'questionGone',
    })

    // Команда сценарию: проект прогона находит IDE; кнопка - для того состояния, что на экране.
    await phone.send({
      p: 1,
      k: 'cmd',
      id: 's1',
      name: 'scenarios.control',
      args: { runId: 'r1', action: 'pause', seen: 'running' },
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

    // Отзыв: телефон узнаёт сразу и верит этому по тегу, а его ключ больше ничего не открывает.
    service.revoke(phone.deviceId)

    const revoked = await phone.next('revoked')

    expect(await phone.revokedTagValid(String(revoked['tag']))).toBe(true)
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
    'адрес IDE из QR не занять без её ключа, а «забудь меня» с телефона отзывает его в IDE',
    async () => {
      const { relay, url } = await startRelay()
      const views: number[] = []
      const service = await RemoteService.load({
        file: memoryFile(),
        vault: memoryVault,
        ports: fakeIde().ports,
        relayUrl: url,
        machine: () => ({ label: 'test', ideVersion: '0' }),
        onView: (view) => views.push(view.devices.length),
      })

      cleanups.push(() => service.shutdown())
      service.setEnabled(true)
      await until(() => (service.view().state === 'connected' ? true : null), 'IDE on the relay')

      // Кто-то знает адрес IDE (он в QR) и звонит с ним, подписывая своим ключом.
      const agentId = parsePairingFragment(
        new URL(service.startPairing().pairing?.url ?? '').hash,
      )?.agentId
      const thief = await WebCryptoPhone.create(() => undefined)
      const squat = new WebSocket(`${url}/v1/agent?id=${agentId ?? ''}`)
      const closed = new Promise<number>((resolve) => {
        squat.onclose = (event: { code: number }) => resolve(event.code)
      })

      squat.binaryType = 'arraybuffer'
      squat.onmessage = (event: { data: unknown }) => {
        // Ответ телефона-вора с его адресом в заголовке переписан на адрес IDE.
        thief.receive(new Uint8Array(event.data as ArrayBuffer))
      }
      thief.onSend((frame) => {
        frame.set(fromBase64Url(agentId ?? '') ?? new Uint8Array(16), 18)
        squat.send(frame)
      })

      expect(await closed).toBe(4003)
      expect(service.view().state).toBe('connected')
      expect(relay?.connections()).toBe(1)

      // Пара и «забудь меня» с телефона: IDE отзывает его обычным путём, окно видит.
      const phone = await connectPhone(url)
      const offer = await phone.pairInit(service.startPairing().pairing?.url ?? '')
      const pending = await until(() => service.view().pending, 'pending phone')

      service.approve(pending)
      await phone.pairAck(offer)
      await until(() => (service.view().devices.length === 1 ? true : null), 'paired')
      await phone.send({ p: 1, k: 'unpair' })
      await phone.next('revoked')
      await until(() => (service.view().devices.length === 0 ? true : null), 'forgotten in IDE')
      await until(() => (views.at(-1) === 0 ? true : null), 'window told')
    },
  )

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

  it.skipIf(LIVE_RELAY)(
    'пуш: телефон не на связи будится через релей, текст открывает только он; на связи - не будится',
    async () => {
      const orders: PushOrder[] = []
      const relay = createRelay(
        {
          ...readConfig({}),
          staticDir: '',
          logLevel: 'silent',
          push: { ...testVapid(), subject: 'https://relay.example' },
          pushOff: '',
        },
        () => undefined,
        {
          pushSender: (order) => {
            orders.push(order)

            return Promise.resolve(201)
          },
        },
      )
      const url = `ws://127.0.0.1:${await relay.listen(0)}`

      cleanups.push(() => relay.close())

      const file = keptFile()
      const ide = fakeIde()
      const load = () =>
        RemoteService.load({
          file,
          vault: memoryVault,
          ports: ide.ports,
          relayUrl: url,
          machine: () => ({ label: 'test', ideVersion: '0' }),
          onView: () => undefined,
        })
      const first = await load()

      first.setEnabled(true)
      await until(() => (first.view().state === 'connected' ? true : null), 'IDE on the relay')

      const phone = await connectPhone(url)
      const offer = await phone.pairInit(first.startPairing().pairing?.url ?? '')

      first.approve(await until(() => first.view().pending, 'pending phone'))
      await phone.pairAck(offer)
      await phone.send({
        p: 1,
        k: 'pushSet',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: Buffer.from(
          Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index)),
        ).toString('base64url'),
        auth: Buffer.alloc(16, 7).toString('base64url'),
      })
      await until(
        () => (first.view().devices[0]?.notifications ? true : null),
        'the subscription in the IDE',
      )
      await first.shutdown()

      // IDE перезапустили, телефон в кармане: разговор встал на вопросе - будим.
      const second = await load()

      cleanups.push(() => second.shutdown())
      await until(() => (second.view().state === 'connected' ? true : null), 'IDE back')
      ide.state.conversations = [conversationOf({ pending: PERMISSION, status: 'waiting' })]
      second.claudeChanged(ide.state)

      const order = await until(() => orders[0], 'a push at the push service')
      const notice = await phone.openPush(order.payload)

      expect(order.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc')
      expect(notice).toMatchObject({
        reason: 'permission',
        project: 'secret-client',
        title: 'Fix the login bug',
        tool: 'Bash',
        route: { screen: 'conversation', conversationId: CONVERSATION_ID },
      })
      expect(order.payload.toString('latin1')).not.toContain('secret-client')

      // Телефон вернулся и говорит: новый вопрос он видит сам - пуша нет.
      await phone.resume()
      await phone.send({ p: 1, k: 'ping', n: 1 })
      await phone.next('pong')
      ide.state.conversations = [
        conversationOf({ pending: { ...PERMISSION, requestId: 'perm-2' }, status: 'waiting' }),
      ]
      second.claudeChanged(ide.state)
      await new Promise((resolve) => setTimeout(resolve, 300))
      await phone.send({ p: 1, k: 'ping', n: 2 })
      await phone.next('pong', (message) => message['n'] === 2)
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(orders).toHaveLength(1)
    },
  )

  it('команды уровня ACC через настоящий релей: очередь, вопрос сбоку, аккаунты, журнал шага, запрет', async () => {
    const { url } = await startRelay()
    const ide = fakeIde()
    const service = await RemoteService.load({
      file: memoryFile(),
      vault: memoryVault,
      ports: ide.ports,
      relayUrl: url,
      machine: () => ({ label: 'test', ideVersion: '0' }),
      onView: () => undefined,
    })

    cleanups.push(() => service.shutdown())
    service.setEnabled(true)
    await until(() => (service.view().state === 'connected' ? true : null), 'IDE on the relay')

    const phone = await connectPhone(url)
    const offer = await phone.pairInit(service.startPairing().pairing?.url ?? '', 'Pixel')

    service.approve(await until(() => service.view().pending, 'pending phone'))
    await phone.pairAck(offer)

    let counter = 0
    const command = async (name: string, args: object) => {
      counter += 1

      const id = `x${counter}`

      await phone.send({ p: 1, k: 'cmd', id, name, args })

      return phone.next('result', (message) => message['id'] === id)
    }
    const conversationId = CONVERSATION_ID

    // Очередь: отложить, убрать - тем же id, что дала IDE.
    expect(
      await command('conversation.enqueue', { conversationId, text: 'after this' }),
    ).toMatchObject({ ok: true })

    const queuedId = ide.state.conversations[0]?.queue[0]?.id ?? ''

    expect(await command('conversation.unqueue', { conversationId, queuedId })).toMatchObject({
      ok: true,
    })
    expect(ide.state.conversations[0]?.queue).toEqual([])

    // Вопрос сбоку: ответ - итогом команды, без папок машины.
    const aside = await command('conversation.aside', {
      conversationId,
      askId: 'a1',
      question: 'status?',
    })

    expect(aside).toMatchObject({
      ok: true,
      data: { state: 'answered', text: 'Working in {project}/src on it.' },
    })

    // Аккаунты: почта замаскирована, по проводу целиком не уходит.
    const accounts = await command('accounts.list', {})

    expect(JSON.stringify(accounts)).not.toContain('mzpizote@')
    expect(accounts).toMatchObject({
      ok: true,
      data: { accounts: [{ id: '', current: true }, {}, {}] },
    })

    // Журнал головы прогона - конец, сколько влезло, и «есть выше».
    const log = await command('scenarios.log', {
      projectKey: projectKeyOf(PROJECT_PATH),
      runId: 'r1',
      key: 'head',
    })

    expect(log).toMatchObject({ ok: true, data: { found: true, hasEarlier: true } })
    expect(JSON.stringify(log)).not.toContain(PROJECT_PATH)

    // Запрещённое так и остаётся запрещённым: терминал, «разрешать всегда», вход в браузере Mac.
    for (const name of [
      'conversation.shell',
      'conversation.allowAlways',
      'accounts.add',
      'voice.token',
    ]) {
      expect(await command(name, {})).toMatchObject({ ok: false, code: 'unknownCommand' })
    }
  })
})

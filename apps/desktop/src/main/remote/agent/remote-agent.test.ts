import { webcrypto } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { encodeFrame, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'
import type { PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import { until, WebCryptoPhone } from '../__fixtures__/webcrypto-phone'
import type { SocketLike } from '../link/relay-link'
import type { StoredRemote } from '../store/remote-state'
import { RemoteStore } from '../store/remote-store'
import type { JsonFile } from '../../storage/json-file'
import { RemoteAgent } from './remote-agent'

/**
 * Дорога телефона до настоящего RemoteAgent и обратно через подделку сокета релея: телефон на
 * WebCrypto (`__fixtures__/webcrypto-phone.ts`), агент на node:crypto.
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

const setup = async () => {
  const handled: { deviceId: string; message: PhoneMessage }[] = []
  const socket: SocketLike & { readyState: number } = {
    binaryType: '',
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => phone.receive(new Uint8Array(data)),
    close: () => undefined,
  }
  const store = await RemoteStore.load(memoryFile(), memoryVault)
  const agent = new RemoteAgent(
    {
      store,
      createSocket: () => socket,
      relayUrl: 'wss://relay.example',
      label: () => 'Agentic Workstation on test',
      onView: () => undefined,
    },
    {
      handle: (deviceId, message) => handled.push({ deviceId, message }),
      startedAgain: () => undefined,
      forgotten: () => undefined,
    },
  )
  const deliver = (frame: Uint8Array) => socket.onmessage?.({ data: frame.slice().buffer })
  const phone = new WebCryptoPhone(deliver)

  agent.start()
  socket.readyState = 1
  socket.onopen?.({})

  return { agent, store, deliver, handled, phone }
}

describe('телефон и IDE: пара, переподключение, печать, отзыв', () => {
  it('проходят всю дорогу', async () => {
    const { agent, handled, phone } = await setup()
    const offer = await phone.pairInit(agent.startPairing().url)

    await until(() => agent.pendingPairing(), 'pending phone')
    expect(agent.pendingPairing()?.deviceId).toBe(phone.deviceId)

    agent.approvePairing()
    await phone.pairAck(offer)

    // Ключи пары работают сразу: стук доходит наверх ровно один раз, повтор отбрасывается.
    await phone.send({ p: 1, k: 'hello' })
    await until(() => handled[0], 'hello')
    expect(handled).toEqual([{ deviceId: phone.deviceId, message: { p: 1, k: 'hello' } }])

    // Переподключение без QR: новые ключи, за которые ручается долгий.
    await phone.resume()
    await phone.send({ p: 1, k: 'inventory' })
    await until(() => handled[1], 'inventory')
    expect(handled[1]?.message).toEqual({ p: 1, k: 'inventory' })

    agent.reply(phone.deviceId, { p: 1, k: 'resync' })
    await phone.next('resync')

    // Отзыв: запечатанное «отпустили» на связи и открытое - вернувшемуся.
    agent.revoke(phone.deviceId)
    await phone.next('revoked')
    phone.replies.length = 0
    await expect(phone.resume(300)).rejects.toThrow('sessionAck')
    expect(phone.replies.some((reply) => reply.k === 'revoked')).toBe(true)
    agent.stop()
  })

  it('незнакомцу не отвечают, а сообщение не по белому списку не доходит наверх', async () => {
    const { agent, deliver, store, handled, phone } = await setup()
    const stranger = webcrypto.getRandomValues(new Uint8Array(16))
    const to = new Uint8Array(Buffer.from(store.agentId(), 'base64url'))

    deliver(
      encodeFrame(
        FRAME_SEALED,
        to,
        stranger,
        0n,
        encodeBody({ p: 1, k: 'sessionInit', deviceId: 'x', ephemeralPub: 'y' }),
      ),
    )
    deliver(encodeFrame(FRAME_SEALED, to, stranger, 5n, new Uint8Array(40)))
    expect(phone.replies).toEqual([])

    const offer = await phone.pairInit(agent.startPairing().url)

    await until(() => agent.pendingPairing(), 'pending phone')
    agent.approvePairing()
    await phone.pairAck(offer)
    await phone.send({ p: 1, k: 'bash', command: 'rm -rf ~' })
    await phone.send({ p: 1, k: 'ping' })
    await until(() => handled[0], 'ping')
    expect(handled.map((one) => one.message.k)).toEqual(['ping'])
    agent.stop()
  })

  it('код с чужим доказательством телефон в ожидание не ставит', async () => {
    const { agent, phone } = await setup()
    const url = agent.startPairing().url

    // Код из QR, но секрет подменён: доказательство не сойдётся.
    await phone.pairInit(
      url.replace(/\.([A-Za-z0-9_-]{22})\.([0-9A-F]{16})$/, '.AAAAAAAAAAAAAAAAAAAAAA.$2'),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(agent.pendingPairing()).toBeNull()
    agent.stop()
  })
})

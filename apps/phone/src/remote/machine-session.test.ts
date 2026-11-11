import { it, vi, expect, describe, afterEach } from 'vitest'

import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import { decodeFrame } from '@agentic-workstation/remote-protocol/frame'

import type { SessionKeys } from './crypto'
import { exportPublic, generateKeyPair } from './crypto'
import { PING_MS, Liveness, PONG_PATIENCE_MS } from './liveness'
import { MachineSession } from './machine-session'

const AGENT = 'A'.repeat(22)

const session = async () => {
  const keys = await generateKeyPair()

  return new MachineSession(
    {
      agentId: AGENT,
      relayUrl: 'wss://relay.example',
      label: 'IDE',
      agentStaticPub: await exportPublic(keys.publicKey),
      fingerprint: '0'.repeat(16),
      staticPrivateKey: keys.privateKey,
      staticPub: await exportPublic(keys.publicKey),
      pairedAt: 0,
      revoked: false,
    },
    'D'.repeat(22),
    new Uint8Array(16),
  )
}

const pubOf = (frame: Uint8Array) => decodeBody(decodeFrame(frame).body)?.['ephemeralPub']

afterEach(() => vi.useRealTimers())

describe('одноразовый ключ рукопожатия', () => {
  it('повторяется, только пока ответа нет; после ключей - всегда свежий', async () => {
    const machine = await session()
    const first = pubOf(await machine.sessionInit(false, 0))

    expect(pubOf(await machine.sessionInit(false, 1))).toBe(first)
    expect(pubOf(await machine.sessionInit(true, 2))).not.toBe(first)

    machine.open({} as SessionKeys)

    const afterOpen = pubOf(await machine.sessionInit(false, 3))

    expect(afterOpen).not.toBe(first)

    machine.close()
    expect(pubOf(await machine.sessionInit(false, 4))).not.toBe(afterOpen)
  })
})

describe('жива ли IDE - по pong, а не переспросом списка', () => {
  it('стук с номером; ответ снимает ожидание, молчание - IDE не отвечает и новое рукопожатие', async () => {
    const machine = await session()
    const sent: object[] = []
    const statuses: string[] = []
    const handshakes: boolean[] = []
    let now = 0
    const liveness = new Liveness({
      sessions: () => [machine],
      sockets: () => [],
      socketOpen: () => true,
      send: (_agentId, message) => {
        sent.push(message)

        return Promise.resolve(true)
      },
      handshake: (_session, fresh) => {
        handshakes.push(fresh)

        return Promise.resolve()
      },
      setStatus: (_session, status) => statuses.push(status),
      now: () => now,
    })

    machine.open({} as SessionKeys)
    now = PING_MS
    liveness.tick()
    expect(sent).toEqual([{ p: 1, k: 'ping', n: 1 }])

    // IDE ответила (клиент снимает ожидание на любом открывшемся слове).
    machine.awaitingPong = 0
    now += PONG_PATIENCE_MS
    liveness.tick()
    expect(statuses).toEqual([])

    now += PING_MS
    liveness.tick()
    expect(sent.at(-1)).toEqual({ p: 1, k: 'ping', n: 2 })
    now += PONG_PATIENCE_MS
    liveness.tick()
    // Ни одного слова за терпение - не отвечает: ключи этой линии - вон, свежий ключ.
    expect(statuses).toEqual(['offline'])
    expect(machine.isOpen).toBe(false)
    expect(handshakes).toEqual([true])
    // Список машины ради проверки больше не переспрашивается.
    expect(sent.some((message) => (message as { k: string }).k === 'inventory')).toBe(false)
  })
})

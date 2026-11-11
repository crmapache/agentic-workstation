import { it, expect, describe } from 'vitest'

import { COMMAND_LIMITS } from '@agentic-workstation/remote-protocol/commands'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

import { deviceProof, exportPublic, generateKeyPair } from '../wire/crypto'
import { RemoteLimits, MAX_MESSAGE_BYTES } from './limits'
import { PairingDesk, MAX_ATTEMPTS, OFFER_LIFETIME_MS } from './pairing'
import { RemoteParts, mayArriveInParts } from './parts'

const AGENT = 'G'.repeat(22)

const DEVICE = 'D'.repeat(22)

describe('частота и вес', () => {
  it('команд - не больше своего числа в минуту, у каждой своё', () => {
    const limits = new RemoteLimits()
    const limit = COMMAND_LIMITS['conversation.send']

    for (let index = 0; index < limit; index += 1)
      expect(limits.allow('d', 'conversation.send', 1000)).toBe(true)

    expect(limits.allow('d', 'conversation.send', 1000)).toBe(false)
    expect(limits.allow('d', 'conversation.interrupt', 1000)).toBe(true)
    expect(limits.allow('d', 'conversation.send', 1000 + 61_000)).toBe(true)
  })

  it('незнакомое - строгим пределом, кадр тяжелее потолка - не пускается вовсе', () => {
    const limits = new RemoteLimits()
    const allowed = Array.from({ length: 30 }, () => limits.allow('d', 'somethingNew', 0)).filter(
      Boolean,
    )

    expect(allowed.length).toBeLessThan(30)
    expect(new RemoteLimits().allowBytes('d', MAX_MESSAGE_BYTES + 1)).toBe(false)
  })
})

describe('сообщение частями', () => {
  const part = (id: string, i: number, n: number, d: string) => ({
    p: 1 as const,
    k: 'part' as const,
    id,
    i,
    n,
    d,
  })

  it('склеивается из кусков в любом порядке', () => {
    const parts = new RemoteParts(() => 0)

    expect(parts.take('d', part('m1', 1, 2, 'world')).kind).toBe('waiting')
    expect(parts.take('d', part('m1', 0, 2, 'hello '))).toEqual({
      kind: 'whole',
      text: 'hello world',
    })
  })

  it('кусок вне ряда и чужое число частей - отказ', () => {
    const parts = new RemoteParts(() => 0)

    expect(parts.take('d', part('m', 2, 2, '')).kind).toBe('refused')
    expect(parts.take('d', part('m', 0, 99, '')).kind).toBe('refused')
    expect(parts.take('d', part('x', 0, 2, 'a')).kind).toBe('waiting')
    expect(parts.take('d', part('x', 1, 3, 'b')).kind).toBe('refused')
  })

  it('частями может прийти только сообщение с фото', () => {
    expect(mayArriveInParts({ k: 'cmd', name: 'conversation.send' })).toBe(true)
    expect(mayArriveInParts({ k: 'cmd', name: 'scenarios.start' })).toBe(false)
    expect(mayArriveInParts({ k: 'subscribe' })).toBe(false)
  })
})

describe('пара', () => {
  const identity = generateKeyPair()
  const device = { static: generateKeyPair(), ephemeral: generateKeyPair() }
  const init = (proof: string) => ({
    p: 1 as const,
    k: 'pairInit' as const,
    deviceId: DEVICE,
    label: 'iPhone',
    staticPub: exportPublic(device.static.publicKey),
    ephemeralPub: exportPublic(device.ephemeral.publicKey),
    proof,
  })
  const address = Buffer.alloc(16, 1)

  it('код - адрес страницы релея, секрет и отпечаток - после #', () => {
    const { url } = new PairingDesk().start('wss://relay.example/', AGENT, identity)

    expect(url.startsWith('https://relay.example/pair#aw1.')).toBe(true)
    expect(parsePairingFragment(new URL(url).hash)?.agentId).toBe(AGENT)
  })

  it('верное доказательство ставит телефон ждать человека и тратит код', () => {
    const desk = new PairingDesk()
    const { url } = desk.start('wss://relay.example', AGENT, identity)
    const code = parsePairingFragment(new URL(url).hash)!
    const proof = deviceProof(
      code.secret,
      AGENT,
      init('').staticPub,
      init('').ephemeralPub,
      DEVICE,
    ).toString('base64')

    expect(desk.take(init(proof), address, AGENT, identity)).toBe(true)
    expect(desk.pending()?.label).toBe('iPhone')
    expect(desk.current()).toBeNull()
    expect(desk.take(init(proof), address, AGENT, identity)).toBe(false)
  })

  it('серия неверных ответов сжигает код, и через три минуты код ничего не стоит', () => {
    const desk = new PairingDesk()

    desk.start('wss://relay.example', AGENT, identity)

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1)
      desk.take(init('AAAA'), address, AGENT, identity)

    expect(desk.current()).toBeNull()

    let now = 0
    const late = new PairingDesk(() => now)

    late.start('wss://relay.example', AGENT, identity)
    now = OFFER_LIFETIME_MS + 1
    expect(late.current()).toBeNull()
  })
})

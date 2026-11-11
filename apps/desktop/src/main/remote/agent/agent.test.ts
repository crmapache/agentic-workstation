import { it, expect, describe } from 'vitest'

import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { COMMAND_LIMITS } from '@agentic-workstation/remote-protocol/commands'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'
import { splitIntoParts, MAX_ASSEMBLED_CHARS } from '@agentic-workstation/remote-protocol/parts'

import { deviceProof, exportPublic, generateKeyPair } from '../wire/crypto'
import { WINDOW_MS, limitKindOf, RemoteLimits, MAX_MESSAGE_BYTES } from './limits'
import { PairingDesk, MAX_ATTEMPTS, ANSWER_KEPT_MS, OFFER_LIFETIME_MS } from './pairing'
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

  it('ведро наполняется ровно: через шесть секунд - одна новая команда из десяти', () => {
    const limits = new RemoteLimits()

    for (let index = 0; index < 10; index += 1) limits.allow('d', 'conversation.send', 0)

    expect(limits.allow('d', 'conversation.send', 1000)).toBe(false)
    expect(limits.allow('d', 'conversation.send', 6000)).toBe(true)
    expect(limits.allow('d', 'conversation.send', 6001)).toBe(false)
  })

  it('работа на кадр постоянная: сто тысяч кадров за минуту считаются мгновенно', () => {
    const limits = new RemoteLimits()
    const started = performance.now()

    // Список времён за минуту делал бы на каждый кадр проход по всем прежним - миллиарды шагов.
    for (let index = 0; index < 100_000; index += 1) limits.allowBytes('d', 1, index / 2)

    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('за минуту проходят три самых тяжёлых сообщения с фото, четвёртое - нет', () => {
    const limits = new RemoteLimits()
    const image = { mediaType: 'image/jpeg', data: 'A'.repeat(MAX_ASSEMBLED_CHARS - 400) }
    const message = JSON.stringify({
      p: 1,
      k: 'cmd',
      id: 'photo',
      name: 'conversation.send',
      args: { conversationId: 'c', text: 'look', images: [image] },
    })
    const frames = splitIntoParts('photo', message).map((part) => encodeBody(part).length)
    const send = (now: number) => frames.every((bytes) => limits.allowBytes('d', bytes, now))

    expect(frames.every((bytes) => bytes <= MAX_MESSAGE_BYTES)).toBe(true)
    expect([send(0), send(1), send(2)]).toEqual([true, true, true])
    expect(send(3)).toBe(false)
    expect(send(WINDOW_MS)).toBe(true)
  })

  it('уборка снимает полные вёдра, а отзыв квоту не обнуляет - её съедает только время', () => {
    const limits = new RemoteLimits()

    limits.allow('d', 'conversation.send', 0)
    limits.allowBytes('d', 200_000, 0)
    limits.sweep(100)
    expect(limits.size()).toBe(2)
    limits.sweep(WINDOW_MS)
    expect(limits.size()).toBe(0)
  })

  it('команда считается своим именем, отказы - одной кучей', () => {
    const cmd = (name: string, args: unknown) => ({
      p: 1 as const,
      k: 'cmd' as const,
      id: 'x',
      name,
      args,
    })

    expect(limitKindOf(cmd('conversation.interrupt', { conversationId: 'c' }))).toBe(
      'conversation.interrupt',
    )
    expect(limitKindOf(cmd('terminal.run', {}))).toBe('cmd.refused')
    expect(limitKindOf(cmd('conversation.interrupt', { nope: 1 }))).toBe('cmd.refused')
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

  const proofFor = (desk: PairingDesk) => {
    const { url } = desk.start('wss://relay.example', AGENT, identity)
    const code = parsePairingFragment(new URL(url).hash)!

    return deviceProof(
      code.secret,
      AGENT,
      init('').staticPub,
      init('').ephemeralPub,
      DEVICE,
    ).toString('base64')
  }

  it('ждущий телефон истекает вместе с кодом: Approve после - никого не пускает', () => {
    let now = 0
    const desk = new PairingDesk(() => now)

    expect(desk.take(init(proofFor(desk)), address, AGENT, identity)).toBe(true)
    now = OFFER_LIFETIME_MS + 1

    const print = desk.pending()?.fingerprint ?? ''

    expect(desk.pending()).toBeNull()
    expect(desk.approve({ deviceId: DEVICE, fingerprint: print })).toBeNull()
  })

  it('Approve пускает только телефон с экрана: другой адрес или отпечаток - никого', () => {
    const desk = new PairingDesk()

    desk.take(init(proofFor(desk)), address, AGENT, identity)

    const shown = desk.pending()!

    expect(desk.approve({ deviceId: DEVICE, fingerprint: 'AAAA BBBB' })).toBeNull()
    expect(desk.approve({ deviceId: 'X'.repeat(22), fingerprint: shown.fingerprint })).toBeNull()
    expect(desk.approve(shown)?.deviceId).toBe(DEVICE)
    expect(desk.pending()).toBeNull()
  })

  it('повтор отвеченной просьбы получает тот же ответ; чужая просьба и старый ответ - нет', () => {
    let now = 0
    const desk = new PairingDesk(() => now)
    const request = init(proofFor(desk))
    const reply = {
      p: 1 as const,
      k: 'pairAck' as const,
      agentId: AGENT,
      label: 'IDE',
      staticPub: 'S',
      ephemeralPub: 'E',
      proof: 'P',
    }

    desk.answer(request, reply)

    expect(desk.repeatOf(request)).toBe(reply)
    expect(desk.repeatOf({ ...request, proof: Buffer.alloc(32).toString('base64') })).toBeNull()
    now = ANSWER_KEPT_MS + 1
    expect(desk.repeatOf(request)).toBeNull()
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

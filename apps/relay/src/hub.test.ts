import { it, expect, describe } from 'vitest'
import type { WebSocket } from 'ws'

import { readEnvelope, FRAME_CONTROL } from './frame.ts'
import { Hub } from './hub.ts'
import { Mailboxes } from './mailbox.ts'

/**
 * Хаб на подделках сокета: состояние «закрывается» настоящим сокетом не поймать в нужный
 * миг, а здесь его можно поставить руками.
 */

const address = (fill: number) => Buffer.alloc(16, fill)

const socketIn = (readyState: number) => {
  const sent: Buffer[] = []

  return {
    sent,
    socket: {
      readyState,
      send: (frame: Buffer) => sent.push(frame),
      close: () => undefined,
    } as unknown as WebSocket,
  }
}

const envelope = (to: Buffer, from: Buffer) => ({ type: 1, to, from })

const setup = () => {
  const mailboxes = new Mailboxes({
    ttlMs: 120_000,
    maxFrames: 200,
    maxBytes: 4 * 1024 * 1024,
    totalBytes: 64 * 1024 * 1024,
  })

  return { mailboxes, hub: new Hub(mailboxes, () => undefined) }
}

describe('хаб', () => {
  it('закрывающемуся сокету кадр не шлётся - он ждёт в ящике', () => {
    const { hub, mailboxes } = setup()
    const closing = socketIn(2)
    const agent = address(1)

    hub.open(agent, 'agent', closing.socket, 0)
    hub.route(envelope(agent, address(2)), Buffer.from('frame'), 1)

    expect(closing.sent).toEqual([])
    expect(mailboxes.size()).toBe(1)
  })

  it('сердцебиение себе не считается отправителем, которого надо переспросить', () => {
    const { hub } = setup()
    const agent = address(1)
    const first = socketIn(1)
    const second = socketIn(1)

    hub.open(agent, 'agent', first.socket, 0)
    hub.route(envelope(agent, agent), Buffer.from('beat'), 1)
    hub.route(envelope(agent, address(7)), Buffer.from('frame'), 2)
    hub.open(agent, 'agent', second.socket, 3)

    expect(second.sent).toHaveLength(1)
    expect(readEnvelope(second.sent[0] as Buffer, 1024)).toMatchObject({ type: FRAME_CONTROL })
    expect(second.sent[0]?.subarray(18, 34)[0]).toBe(7)
  })

  it('адрес одного вида соединение другого вида не берёт', () => {
    const { hub } = setup()
    const shared = address(5)
    const ide = socketIn(1)

    expect(hub.open(shared, 'agent', ide.socket, 0)).toBe(true)
    expect(hub.open(shared, 'device', socketIn(1).socket, 1)).toBe(false)
    expect(hub.open(shared, 'agent', socketIn(1).socket, 2)).toBe(true)
  })
})

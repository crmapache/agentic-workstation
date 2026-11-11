import { it, expect, describe } from 'vitest'

import { readEnvelope, FRAME_CONTROL } from './frame.ts'
import type { MailboxLimits } from './mailbox.ts'
import { Mailboxes } from './mailbox.ts'

const address = (fill: number) => Buffer.alloc(16, fill)

const key = address(1).toString('base64url')

const sender = address(2)

const boxes = (over: Partial<MailboxLimits> = {}) =>
  new Mailboxes({
    ttlMs: 120_000,
    maxFrames: 200,
    maxBytes: 4 * 1024 * 1024,
    totalBytes: 64 * 1024 * 1024,
    ...over,
  })

const isControl = (frame: Buffer | undefined) =>
  frame !== undefined && readEnvelope(frame, 1024).type === FRAME_CONTROL

describe('ящик для мигнувшей стороны', () => {
  it('отдаёт в порядке прихода, один раз', () => {
    const held = boxes()

    held.hold(key, sender, Buffer.from('first'), 0)
    held.hold(key, sender, Buffer.from('second'), 1)

    expect(held.take(key, 2).map(String)).toEqual(['first', 'second'])
    expect(held.take(key, 3)).toEqual([])
    expect(held.heldBytes()).toBe(0)
  })

  it('протухший кадр не отдаётся - вместо него слово «переспроси»', () => {
    const held = boxes({ ttlMs: 1000 })

    held.hold(key, sender, Buffer.from('old'), 0)

    const taken = held.take(key, 5000)

    expect(taken).toHaveLength(1)
    expect(isControl(taken[0])).toBe(true)
    expect([...(taken[0]?.subarray(18, 34) ?? [])]).toEqual([...sender])
  })

  it('переполненный ящик - одно слово «переспроси», а не хвост с дырой', () => {
    const held = boxes({ maxFrames: 2 })

    for (const text of ['a', 'b', 'c']) held.hold(key, sender, Buffer.from(text), 0)

    const taken = held.take(key, 1)

    expect(taken).toHaveLength(1)
    expect(isControl(taken[0])).toBe(true)
  })

  it('все ящики вместе не съедают больше общего потолка', () => {
    const held = boxes({ totalBytes: 10 })

    held.hold(address(5).toString('base64url'), sender, Buffer.alloc(8), 0)
    held.hold(key, sender, Buffer.alloc(8), 0)

    expect(held.heldBytes()).toBeLessThanOrEqual(10)
    expect(isControl(held.take(key, 1)[0])).toBe(true)
  })

  it('уборка по таймеру снимает старое и оставляет заметку', () => {
    const held = boxes({ ttlMs: 1000 })

    held.hold(key, sender, Buffer.from('x'), 0)
    held.sweep(5000)

    expect(held.size()).toBe(0)
    expect(held.notes()).toBe(1)
    expect(held.heldBytes()).toBe(0)
  })
})

import { it, expect, describe, afterEach } from 'vitest'

import type { TrackerBoard, TrackerRepeat } from '@shared/tracker'

import { PLACE, trackerKit } from './tracker-test-kit'

const kits: { service: { close: () => Promise<void> } }[] = []

afterEach(async () => {
  await Promise.all(kits.splice(0).map((kit) => kit.service.close()))
})

/** Местный полдень дня: 16 ноября 2026 - понедельник. */
const noon = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).getTime()
}

const weekly = (weekdays: number[]): TrackerRepeat => ({
  every: 1,
  unit: 'week',
  weekdays,
  start: '',
  fromDone: false,
})

const boardKit = async (today = '2026-11-16') => {
  const now = noon(today)
  const kit = await trackerKit({ now: () => now })

  kits.push(kit)

  const projectId = await kit.make({ kind: 'project.create', title: 'P' })
  const flowId = await kit.make({ kind: 'flow.create', projectId, title: 'F' })
  const groupId = await kit.make({ kind: 'group.create', flowId, title: 'G' })
  const cards = async () =>
    (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks ?? []

  return {
    ...kit,
    groupId,
    cards,
  }
}

const firstTask = (board: TrackerBoard) => board.projects[0]?.flows[0]?.groups[0]?.tasks[0]

describe('повтор и срок', () => {
  it('повтор без срока ставит срок на свой первый день', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'Отчёт', repeat: weekly([5]) },
    })
    const [card] = await kit.cards()

    expect(card?.id).toBe(id)
    expect(card?.due).toEqual({ date: '2026-11-20', time: null })
    expect(card?.repeat).toEqual({ ...weekly([5]), start: '2026-11-16' })
  })

  it('новое правило переносит неподходящий срок, присланный тем же вызовом срок - нет', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'A', due: { date: '2026-11-18', time: '10:00' } },
    })
    const moved = await kit.apply({ kind: 'card.update', id, fields: { repeat: weekly([1]) } })

    expect(firstTask(moved.board)?.due).toEqual({ date: '2026-11-23', time: '10:00' })

    const kept = await kit.apply({
      kind: 'card.update',
      id,
      fields: { repeat: weekly([3]), due: { date: '2026-11-26', time: null } },
    })

    expect(firstTask(kept.board)?.due).toEqual({ date: '2026-11-26', time: null })
    expect(firstTask(kept.board)?.repeat?.weekdays).toEqual([3])
  })

  it('недельный повтор без дней - день срока; снятый срок снимает повтор', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'A', due: { date: '2026-11-19', time: null }, repeat: weekly([]) },
    })

    expect((await kit.cards())[0]?.repeat?.weekdays).toEqual([4])

    const cleared = await kit.apply({ kind: 'card.update', id, fields: { due: null } })

    expect([firstTask(cleared.board)?.due, firstTask(cleared.board)?.repeat]).toEqual([null, null])
  })

  it('сделанная карточка, получившая повтор, снова открыта', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'A', due: { date: '2026-11-16', time: null }, done: true },
    })
    const ruled = await kit.apply({ kind: 'card.update', id, fields: { repeat: weekly([1]) } })

    expect([firstTask(ruled.board)?.done, firstTask(ruled.board)?.doneAt]).toEqual([false, null])
  })

  it('правило, скрытое снятым на другой машине сроком, не оживает с новым сроком', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'A', due: { date: '2026-11-16', time: null }, repeat: weekly([1]) },
    })

    // Слияние встречных правок: срок снят там, правило поправлено здесь и новее.
    kit.book.write(id, { due: null })
    expect((await kit.cards())[0]?.repeat).toBeNull()

    const dated = await kit.apply({
      kind: 'card.update',
      id,
      fields: { due: { date: '2026-11-20', time: null } },
    })

    expect(firstTask(dated.board)?.repeat).toBeNull()
    expect(kit.book.get(id)?.fields.repeat?.[0]).toBeNull()
  })

  it('кривое правило - отказ', async () => {
    const kit = await boardKit()
    const id = await kit.make({ kind: 'card.create', groupId: kit.groupId, fields: { title: 'A' } })
    const refuse = (repeat: unknown) =>
      kit.service.apply(PLACE, {
        kind: 'card.update',
        id,
        fields: { repeat: repeat as TrackerRepeat },
      })

    for (const repeat of [
      { unit: 'hour' },
      { unit: 'day', every: 0 },
      { unit: 'day', every: 1.5 },
      { unit: 'week', weekdays: [8] },
      { unit: 'month', start: '2026-02-30' },
      { unit: 'day', fromDone: 'yes' },
      'every day',
    ])
      expect(await refuse(repeat)).toEqual({ ok: false, code: 'badRepeat' })
  })
})

describe('сделано у повторяющейся', () => {
  it('срок уходит вперёд, карточка открыта, продолжения сброшены; Undo возвращает всё', async () => {
    const kit = await boardKit()
    const id = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'Отчёт', due: { date: '2026-11-16', time: '09:00' }, repeat: weekly([1]) },
    })
    const step = await kit.make({
      kind: 'card.create',
      groupId: '',
      followUpOf: id,
      fields: { title: 'Разослать', done: true },
    })
    const done = await kit.apply({ kind: 'card.update', id, fields: { done: true } })
    const task = firstTask(done.board)

    expect([task?.done, task?.due, task?.followUps[0]?.done]).toEqual([
      false,
      { date: '2026-11-23', time: '09:00' },
      false,
    ])
    expect(done.repeated).toEqual({
      cardId: id,
      due: { date: '2026-11-23', time: '09:00' },
      undo: [
        { kind: 'card.update', id, fields: { due: { date: '2026-11-16', time: '09:00' } } },
        { kind: 'card.update', id: step, fields: { done: true } },
      ],
    })

    for (const op of done.repeated?.undo ?? []) await kit.apply(op)

    const back = firstTask(await kit.service.board(PLACE))

    expect([back?.due, back?.repeat?.weekdays, back?.followUps[0]?.done]).toEqual([
      { date: '2026-11-16', time: '09:00' },
      [1],
      true,
    ])
  })

  it('обычная карточка просто сделана; повторяющаяся не рождается сделанной', async () => {
    const kit = await boardKit()
    const plain = await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'A' },
    })
    const done = await kit.apply({ kind: 'card.update', id: plain, fields: { done: true } })

    expect([firstTask(done.board)?.done, done.repeated]).toEqual([true, null])

    await kit.make({
      kind: 'card.create',
      groupId: kit.groupId,
      fields: { title: 'B', done: true, repeat: weekly([2]) },
    })

    expect((await kit.cards())[1]?.done).toBe(false)
  })
})

import { it, expect, describe, afterEach } from 'vitest'

import type { TrackerOp } from '@shared/tracker'

import { scenario } from './tracker-scenarios-fake'
import { PLACE, runsKit } from './tracker-test-kit'

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

/** Карточка A со сценарием, отправленная в новую очередь: её элемент правит проверка. */
const sentCard = async () => {
  const kit = await runsKit([scenario('fix', ['task'])])

  closers.push(() => kit.service.close())

  const id = await kit.card('A', {})

  await kit.runs.send(PLACE, {
    source: { kind: 'card', cardId: id },
    target: { kind: 'new', worktree: false },
  })

  const item = kit.queues[0]?.items[0]

  if (!item) throw new Error('нет элемента')

  const cardNow = async () => {
    const board = await kit.service.board(PLACE)
    const cards = board.projects.flatMap((project) =>
      project.flows.flatMap((flow) =>
        flow.groups.flatMap((group) => group.tasks.flatMap((task) => [task, ...task.followUps])),
      ),
    )

    return cards.find((card) => card.id === id)
  }
  const tryOp = async (op: TrackerOp) => {
    const outcome = await kit.service.apply(PLACE, op)

    return outcome.ok ? 'ok' : outcome.code
  }
  const update = (fields: Extract<TrackerOp, { kind: 'card.update' }>['fields']) =>
    tryOp({ kind: 'card.update', id, fields })

  return { ...kit, id, item, cardNow, tryOp, update }
}

describe('карточка со сценарием в работе', () => {
  it('в очереди, у очереди на человеке и в прогоне правятся только описание и «сделано»', async () => {
    const kit = await sentCard()

    expect((await kit.cardNow())?.lock).toBe('run')
    expect(await kit.update({ title: 'B' })).toBe('locked')
    expect(await kit.update({ priority: 1 })).toBe('locked')
    expect(await kit.update({ due: { date: '2026-11-30', time: null } })).toBe('locked')
    expect(await kit.update({ scenario: null })).toBe('locked')
    expect(await kit.update({ autoRun: true })).toBe('locked')
    expect(await kit.update({ description: 'заметка' })).toBe('ok')
    // Поле с прежним значением - не правка: модель может прислать его вместе с описанием.
    expect(await kit.update({ title: 'A', description: 'ещё заметка' })).toBe('ok')

    kit.item.refusal = 'untrusted'
    kit.runs.queuesChanged()
    expect((await kit.cardNow())?.run?.state).toBe('refused')
    expect(await kit.update({ title: 'B' })).toBe('locked')

    kit.item.refusal = null
    kit.item.state = 'running'
    kit.runs.queuesChanged()
    expect((await kit.cardNow())?.lock).toBe('run')
    expect(await kit.update({ subtitle: 'B' })).toBe('locked')
    expect((await kit.cardNow())?.title).toBe('A')
  })

  it('упавший или остановленный прогон открывает карточку', async () => {
    const kit = await sentCard()

    kit.item.state = 'failed'
    kit.runs.queuesChanged()
    expect((await kit.cardNow())?.lock).toBeNull()
    expect(await kit.update({ title: 'B' })).toBe('ok')

    kit.item.state = 'stopped'
    kit.runs.queuesChanged()
    expect(await kit.update({ title: 'C' })).toBe('ok')
  })

  it('выполненная сценарием закрыта и после закрытия очереди; снятая «сделано» открывает её той же правкой', async () => {
    const kit = await sentCard()

    kit.item.state = 'done'
    kit.runs.queuesChanged()
    expect(await kit.cardNow()).toMatchObject({ done: true, lock: 'done' })

    // Очередь закрыли и убрали: связь с элементом пропала, отметка записи - нет.
    kit.queues.splice(0)
    kit.runs.queuesChanged()
    expect(await kit.cardNow()).toMatchObject({ run: { state: 'gone' }, lock: 'done' })
    expect(await kit.update({ title: 'B' })).toBe('locked')
    expect(await kit.update({ description: 'итог' })).toBe('ok')

    expect(await kit.update({ done: false, title: 'B' })).toBe('ok')
    expect(await kit.cardNow()).toMatchObject({ done: false, title: 'B', lock: null })

    // Отмеченная снова руками - сделана человеком, а не сценарием: открыта.
    expect(await kit.update({ done: true })).toBe('ok')
    expect((await kit.cardNow())?.lock).toBeNull()
  })

  it('отмеченная руками карточка со сценарием и карточка-пометка не закрыты', async () => {
    const kit = await runsKit([scenario('fix', ['task'])])

    closers.push(() => kit.service.close())

    const byHand = await kit.card('Руками', {}, { done: true })
    const note = await kit.card('О колонке', null)

    await kit.card('B', {})
    await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    const tasks = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks ?? []

    expect(tasks.map((task) => [task.id, task.lock])).toEqual([
      [byHand, null],
      [note, null],
      [expect.any(String), 'run'],
    ])
  })

  it('повторяющаяся, отмеченная руками во время прогона, уже в следующем круге, и «Undo» её возвращает', async () => {
    const kit = await runsKit([scenario('fix', ['task'])])

    closers.push(() => kit.service.close())

    const id = await kit.card('A', {})

    await kit.apply({
      kind: 'card.update',
      id,
      fields: {
        due: { date: '2026-11-16', time: '09:00' },
        repeat: { every: 1, unit: 'week', weekdays: [1], start: '', fromDone: false },
      },
    })
    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: id },
      target: { kind: 'new', worktree: false },
    })

    const lockOf = async () =>
      (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]?.lock

    expect(await lockOf()).toBe('run')

    const { repeated } = await kit.apply({ kind: 'card.update', id, fields: { done: true } })

    expect(repeated?.due.date).toBe('2026-11-23')
    expect(await lockOf()).toBeNull()

    for (const op of repeated?.undo ?? []) await kit.apply(op)

    expect(await lockOf()).toBe('run')
  })
})

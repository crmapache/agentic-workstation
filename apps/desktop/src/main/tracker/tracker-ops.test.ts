import { it, expect, describe, afterEach } from 'vitest'

import type { TrackerBoard } from '@shared/tracker'

import { PLACE, trackerKit } from './tracker-test-kit'

const DAY = 24 * 60 * 60 * 1000

const kits: { service: { close: () => Promise<void> } }[] = []

afterEach(async () => {
  await Promise.all(kits.splice(0).map((kit) => kit.service.close()))
})

/** Доска с проектом, потоком и группой. */
const boardKit = async (now?: () => number) => {
  const kit = await trackerKit(now ? { now } : {})

  kits.push(kit)

  const projectId = await kit.make({ kind: 'project.create', title: 'Релиз' })
  const flowId = await kit.make({ kind: 'flow.create', projectId, title: 'Бэкенд' })
  const groupId = await kit.make({ kind: 'group.create', flowId, title: 'Неделя 1' })
  const card = (title: string, extra: { followUpOf?: string; beforeId?: string } = {}) =>
    kit.make({ kind: 'card.create', groupId, fields: { title }, ...extra })

  return { ...kit, projectId, flowId, groupId, card }
}

const titles = (board: TrackerBoard) =>
  board.projects[0]?.flows[0]?.groups[0]?.tasks.map((task) => [
    task.title,
    ...task.followUps.map((one) => one.title),
  ])

describe('доска', () => {
  it('задачи по порядку, продолжения цепочкой справа', async () => {
    const { card, service } = await boardKit()
    const first = await card('A')

    await card('B')
    await card('A2', { followUpOf: first })
    const a3 = await card('A3', { followUpOf: first })

    await card('A4', { followUpOf: a3 })
    await card('C', { beforeId: first })

    expect(titles(await service.board(PLACE))).toEqual([['C'], ['A', 'A2', 'A3', 'A4'], ['B']])
  })

  it('выполненная задача остаётся на месте и помнит время', async () => {
    const { card, apply } = await boardKit(() => 5000)
    const first = await card('A')

    await card('B')
    const { board } = await apply({ kind: 'card.update', id: first, fields: { done: true } })
    const tasks = board.projects[0]?.flows[0]?.groups[0]?.tasks ?? []

    expect(tasks.map((task) => [task.title, task.done, task.doneAt])).toEqual([
      ['A', true, 5000],
      ['B', false, null],
    ])

    const undone = await apply({ kind: 'card.update', id: first, fields: { done: false } })

    expect(undone.board.projects[0]?.flows[0]?.groups[0]?.tasks[0]?.doneAt).toBeNull()
  })

  it('задача с продолжениями переезжает в чужую цепочку целиком', async () => {
    const { card, apply } = await boardKit()
    const a = await card('A')
    const b = await card('B')

    await card('B2', { followUpOf: b })
    await card('B3', { followUpOf: b })
    await card('A2', { followUpOf: a })

    const { board } = await apply({
      kind: 'card.move',
      id: b,
      groupId: '',
      followUpOf: a,
      beforeId: null,
    })

    expect(titles(board)).toEqual([['A', 'A2', 'B', 'B2', 'B3']])
  })

  it('продолжение становится задачей другой группы, задача переезжает с продолжениями', async () => {
    const { card, apply, make, flowId, groupId } = await boardKit()
    const a = await card('A')
    const a2 = await card('A2', { followUpOf: a })
    const other = await make({ kind: 'group.create', flowId, title: 'Неделя 2' })

    await apply({ kind: 'card.move', id: a2, groupId: other, followUpOf: null, beforeId: null })
    const { board } = await apply({
      kind: 'card.move',
      id: a,
      groupId: other,
      followUpOf: null,
      beforeId: a2,
    })
    const groups = board.projects[0]?.flows[0]?.groups ?? []

    expect(groups.map((group) => group.id)).toEqual([groupId, other])
    expect(groups[1]?.tasks.map((task) => task.title)).toEqual(['A', 'A2'])
  })

  it('задачу нельзя сделать продолжением самой себя', async () => {
    const kit = await boardKit()
    const a = await kit.card('A')
    const a2 = await kit.card('A2', { followUpOf: a })
    const outcome = await kit.service.apply(PLACE, {
      kind: 'card.move',
      id: a,
      groupId: '',
      followUpOf: a2,
      beforeId: null,
    })

    expect(outcome).toEqual({ ok: false, code: 'badFollowUp' })
  })

  it('удаление задачи уносит продолжения, Undo возвращает всё', async () => {
    const { card, apply } = await boardKit()
    const a = await card('A')

    await card('A2', { followUpOf: a })
    const removed = await apply({ kind: 'card.delete', id: a })

    expect(removed.removed).toHaveLength(2)
    expect(titles(removed.board)).toEqual([])

    const back = await apply({ kind: 'undelete', ids: removed.removed })

    expect(titles(back.board)).toEqual([['A', 'A2']])
  })

  it('проверки полей', async () => {
    const kit = await boardKit()
    const a = await kit.card('A')
    const refuse = (fields: Record<string, unknown>) =>
      kit.service.apply(PLACE, { kind: 'card.update', id: a, fields })

    expect(await refuse({ title: '   ' })).toEqual({ ok: false, code: 'badTitle' })
    expect(await refuse({ due: { date: '2026-02-30', time: null } })).toEqual({
      ok: false,
      code: 'badDue',
    })
    expect(await refuse({ due: { date: '2026-02-03', time: '24:00' } })).toEqual({
      ok: false,
      code: 'badDue',
    })
    expect(await refuse({ scenario: { scenarioId: '', scope: 'project' } })).toEqual({
      ok: false,
      code: 'badScenario',
    })

    const fine = await kit.apply({
      kind: 'card.update',
      id: a,
      fields: { due: { date: '2026-11-21', time: '09:30' }, priority: 1, subtitle: ' sub ' },
    })
    const task = fine.board.projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.due, task?.priority, task?.subtitle]).toEqual([
      { date: '2026-11-21', time: '09:30' },
      1,
      'sub',
    ])
  })
})

describe('проекты трекера', () => {
  it('архив: не правится, возвращается, удаляется сам через 30 дней', async () => {
    let now = 1_000_000
    const kit = await boardKit(() => now)

    await kit.apply({ kind: 'project.archive', id: kit.projectId })
    const refused = await kit.service.apply(PLACE, {
      kind: 'flow.create',
      projectId: kit.projectId,
      title: 'X',
    })

    expect(refused).toEqual({ ok: false, code: 'archived' })

    const back = await kit.apply({ kind: 'project.restore', id: kit.projectId })

    expect(back.board.projects.map((project) => project.title)).toEqual(['Релиз'])

    const archived = await kit.apply({ kind: 'project.archive', id: kit.projectId })

    expect(archived.board.archived[0]?.purgeAt).toBe(now + 30 * DAY)

    now += 30 * DAY
    await kit.service.close()

    const later = await trackerKit({ now: () => now, book: kit.book })

    kits.push(later)

    expect((await later.service.board(PLACE)).archived).toEqual([])
  })

  it('порядок вкладок и правка другой доски', async () => {
    const kit = await boardKit()
    const second = await kit.make({ kind: 'project.create', title: 'Второй' })
    const moved = await kit.apply({ kind: 'project.move', id: second, beforeId: kit.projectId })

    expect(moved.board.projects.map((project) => project.title)).toEqual(['Второй', 'Релиз'])

    const elsewhere = await kit.service.apply(
      { rootPath: '/work/other', name: 'other', home: false },
      { kind: 'project.update', id: second, title: 'Чужой' },
    )

    expect(elsewhere).toEqual({ ok: false, code: 'wrongBoard' })
  })
})

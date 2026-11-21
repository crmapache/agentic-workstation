import { it, expect, describe, afterEach } from 'vitest'

import type { TrackerDue, TrackerRepeat } from '@shared/tracker'

import { TrackerAutoRuns } from './tracker-auto-runs'
import { TrackerRuns } from './tracker-runs'
import { scenario, scenariosFake } from './tracker-scenarios-fake'
import { PLACE, trackerKit } from './tracker-test-kit'

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

/** Местное время: 16 ноября 2026 - понедельник. */
const at = (date: string, clock: string) => {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = clock.split(':').map(Number)

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours, minutes).getTime()
}

const MONDAYS: TrackerRepeat = { every: 1, unit: 'week', weekdays: [1], start: '', fromDone: false }

const setup = async (options: { waitForSync?: boolean; shelf?: string[] } = {}) => {
  const clock = { now: at('2026-11-16', '08:00') }
  const kit = await trackerKit({ now: () => clock.now, waitForSync: options.waitForSync === true })
  const shelf = (options.shelf ?? ['fix']).map((id) => scenario(id, ['task']))
  const fake = scenariosFake(shelf)
  const runs = new TrackerRuns(kit.service, fake.port, () => clock.now)
  const autoRuns = new TrackerAutoRuns(kit.service, runs, () => clock.now)
  const projectId = await kit.make({ kind: 'project.create', title: 'P' })
  const flowId = await kit.make({ kind: 'flow.create', projectId, title: 'F' })
  const groupId = await kit.make({ kind: 'group.create', flowId, title: 'G' })
  const card = (due: TrackerDue, extra: { repeat?: TrackerRepeat; scenarioId?: string } = {}) =>
    kit.make({
      kind: 'card.create',
      groupId,
      fields: {
        title: 'Обновить зависимости',
        due,
        autoRun: true,
        scenario: {
          scenarioId: extra.scenarioId ?? 'fix',
          scope: 'project',
          provider: null,
          inputs: {},
        },
        ...(extra.repeat ? { repeat: extra.repeat } : {}),
      },
    })
  const task = async () =>
    (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

  closers.push(async () => {
    await autoRuns.stop()
    await kit.service.close()
  })

  return { ...kit, ...fake, shelf, clock, runs, autoRuns, card, task, projectId }
}

describe('запуск в срок', () => {
  it('в срок уходит в очередь один раз, до срока - нет', async () => {
    const kit = await setup()

    await kit.card({ date: '2026-11-16', time: '09:00' })
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(0)

    kit.clock.now = at('2026-11-16', '09:00')
    await kit.autoRuns.tick()
    await kit.autoRuns.tick()

    expect(kit.started).toHaveLength(1)
    expect(kit.started[0]?.projectPath).toBe(PLACE.rootPath)
    expect(kit.started[0]?.target).toEqual({ kind: 'new', worktree: false })
    expect((await kit.task())?.run?.state).toBe('waiting')
  })

  it('повторяющаяся: успех сдвигает срок, следующий срок - новый запуск', async () => {
    const kit = await setup()

    await kit.card({ date: '2026-11-16', time: null }, { repeat: MONDAYS })
    await kit.autoRuns.tick()

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'done'
    kit.runs.queuesChanged()
    expect((await kit.task())?.due).toEqual({ date: '2026-11-23', time: null })

    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)

    kit.clock.now = at('2026-11-23', '00:00')
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(2)
  })

  it('IDE была закрыта несколько ежедневных сроков - наверстывается одним прогоном', async () => {
    const kit = await setup()
    const daily: TrackerRepeat = { every: 1, unit: 'day', weekdays: [], start: '', fromDone: false }

    await kit.card({ date: '2026-11-21', time: null }, { repeat: daily })
    kit.clock.now = at('2026-11-23', '08:00')
    await kit.autoRuns.tick()

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'done'
    kit.clock.now = at('2026-11-23', '08:30')
    kit.runs.queuesChanged()

    // Сегодняшний круг прогон закрыл тоже: следующий - завтра, а не ещё один сегодня.
    expect((await kit.task())?.due?.date).toBe('2026-11-24')
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)
  })

  it('отмеченная руками за время прогона второй раз не сдвигается', async () => {
    const kit = await setup()
    const id = await kit.card({ date: '2026-11-16', time: '09:00' }, { repeat: MONDAYS })

    kit.clock.now = at('2026-11-16', '09:00')
    await kit.autoRuns.tick()
    kit.clock.now = at('2026-11-16', '09:10')
    await kit.apply({ kind: 'card.update', id, fields: { done: true } })

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'done'
    kit.runs.queuesChanged()

    expect((await kit.task())?.due?.date).toBe('2026-11-23')
  })

  it('отказ отправки виден на карточке и сам не повторяется; новый срок пробует снова', async () => {
    const kit = await setup({ shelf: [] })
    const id = await kit.card({ date: '2026-11-15', time: null })

    await kit.autoRuns.tick()
    await kit.autoRuns.tick()
    expect((await kit.task())?.autoRunFailure).toBe('scenarioGone')
    // Второй такт на тот же срок отправку даже не пробует.
    expect(kit.fetched).toEqual(['fix'])

    kit.shelf.push(scenario('fix', ['task']))
    await kit.apply({
      kind: 'card.update',
      id,
      fields: { due: { date: '2026-11-16', time: null } },
    })
    await kit.autoRuns.tick()

    expect(kit.started).toHaveLength(1)
    expect((await kit.task())?.autoRunFailure).toBeNull()
  })

  it('копия устарела (сон, обрыв связи) - ждёт захода, начатого после этого', async () => {
    const kit = await setup()

    await kit.card({ date: '2026-11-10', time: null })
    kit.service.markStale()
    await kit.autoRuns.tick()
    // Заход, начатый до сна, свежим не считается.
    kit.service.markSynced(kit.clock.now - 1)
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(0)

    kit.service.markSynced(kit.clock.now)
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)
  })

  it('до сверки с облаком часы стоят', async () => {
    const kit = await setup({ waitForSync: true })

    await kit.card({ date: '2026-11-10', time: null })
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(0)

    kit.service.markSynced()
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)
  })

  it('отправленную руками второй раз не шлёт; выключенный и архивный не уходят', async () => {
    const kit = await setup()
    const id = await kit.card({ date: '2026-11-16', time: '07:00' })

    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: id },
      target: { kind: 'new', worktree: true },
    })
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)

    await kit.apply({
      kind: 'card.update',
      id,
      fields: { due: { date: '2026-11-16', time: '07:30' }, autoRun: false },
    })
    await kit.autoRuns.tick()
    expect([kit.started.length, (await kit.task())?.autoRun]).toEqual([1, false])

    await kit.apply({ kind: 'card.update', id, fields: { autoRun: true } })
    await kit.apply({ kind: 'project.archive', id: kit.projectId })
    await kit.autoRuns.tick()
    expect(kit.started).toHaveLength(1)
  })

  it('отвязка сценария выключает запуск в срок', async () => {
    const kit = await setup()
    const id = await kit.card({ date: '2026-11-20', time: null })

    await kit.apply({ kind: 'card.update', id, fields: { scenario: null } })

    expect(kit.book.autoRuns()[id]).toBeUndefined()
  })

  it('отметка живёт только в книге этого компьютера, а не в записи для облака', async () => {
    const kit = await setup()
    const id = await kit.card({ date: '2026-11-20', time: null })

    expect(kit.book.get(id)?.fields.autoRun).toBeUndefined()
    expect(kit.book.autoRuns()[id]).toEqual({
      projectPath: PLACE.rootPath,
      firedFor: null,
      failure: null,
    })
  })
})

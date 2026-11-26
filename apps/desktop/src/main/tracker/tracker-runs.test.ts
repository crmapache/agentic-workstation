import { it, expect, describe, afterEach } from 'vitest'

import type { Scenario } from '@shared/scenarios'

import { scenario } from './tracker-scenarios-fake'
import { PLACE, runsKit } from './tracker-test-kit'

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

const setup = async (shelf: Scenario[]) => {
  const kit = await runsKit(shelf)

  closers.push(() => kit.service.close())

  return kit
}

describe('отправка в очередь', () => {
  it('группа уходит одной очередью по порядку доски; без сценария - пометкой, сделанные - нет', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.card('A2', {}, { followUpOf: a })
    await kit.card('Без сценария', null)
    await kit.card('Сделано', {}, { done: true })
    await kit.card('B', { inputs: { task: 'Сделай {{title}}: {{description}}' } })

    const outcome = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: true },
    })

    expect(outcome.ok).toBe(true)
    expect(kit.started.map((request) => request.inputs.task)).toEqual([
      'A\n\nabout A',
      'A2\n\nabout A2',
      'Сделай B: about B',
    ])
    expect(kit.started.map((request) => request.target.kind)).toEqual(['new', 'queue', 'queue'])
    expect(kit.started[0]?.provider).toBe('claude')
    expect(kit.placeholders.map(({ title, target }) => [title, target.kind])).toEqual([
      ['Без сценария', 'queue'],
    ])
    // Пометка стоит на месте карточки: между A2 и B, как на доске.
    expect(kit.queues[0]?.items.map((item) => item.placeholder === true)).toEqual([
      false,
      false,
      true,
      false,
    ])
    expect(kit.actions).toEqual([{ kind: 'rename', name: 'Неделя 1' }])

    const again = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    expect(again).toEqual({ ok: false, code: 'nothingToSend', cardId: null })
  })

  it('пометка первой открывает очередь; одни пометки - отправлять нечего', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('О колонке', null)
    await kit.card('A', {})

    const outcome = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: true },
    })

    expect(outcome).toMatchObject({ ok: true, sent: [expect.any(String)] })
    expect(kit.placeholders[0]).toMatchObject({
      title: 'О колонке',
      provider: 'claude',
      target: { kind: 'new', worktree: true },
    })
    expect(kit.started.map((request) => request.target.kind)).toEqual(['queue'])

    const plain = await setup([scenario('fix', ['task'])])

    await plain.card('О колонке', null)

    expect(
      await plain.runs.send(PLACE, {
        source: { kind: 'group', groupId: plain.groupId },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'nothingToSend', cardId: null })
    expect(plain.placeholders).toEqual([])
  })

  it('«рядом сразу» новой очереди доходит и до сценариев за пометкой, открывшей её', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('О колонке', null)
    await kit.card('A', {})
    await kit.card('B', {})

    await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false, alongside: true },
    })

    const queueId = kit.queues[0]?.id

    expect(kit.placeholders[0]?.target).toEqual({ kind: 'new', worktree: false, alongside: true })
    expect(kit.started.map((request) => request.target)).toEqual([
      { kind: 'queue', queueId, alongside: true },
      { kind: 'queue', queueId, alongside: true },
    ])
  })

  it('пометка в ту же очередь второй раз не встаёт, в новую - встаёт; сделанной её не отметить', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('О колонке', null)
    await kit.card('A', {})

    const first = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    if (!first.ok) throw new Error('не ушла')

    const queue = kit.queues[0]

    if (!queue) throw new Error('нет очереди')

    // Очередь прошла пометку и сделала A; в колонку добавили B и переслали в ту же очередь.
    for (const item of queue.items) item.state = item.placeholder ? 'skipped' : 'done'
    kit.runs.queuesChanged()
    await kit.card('B', {})

    const again = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'queue', queueId: first.queueId },
    })

    expect(again).toMatchObject({ ok: true, placeholders: [] })
    expect(queue.items.map((item) => item.placeholder === true)).toEqual([true, false, false])

    const note = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([note?.title, note?.done]).toEqual(['О колонке', false])

    await kit.card('C', {})

    const fresh = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    expect(fresh).toMatchObject({ ok: true, placeholders: [note?.id] })
    expect(kit.placeholders.map((request) => request.target.kind)).toEqual(['new', 'new'])
  })

  it('отказ исполнителя у пометки, открывающей очередь, называет карточку со сценарием', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('О колонке', null)
    const a = await kit.card('A', {})

    kit.port.placeholder = () => Promise.resolve({ ok: false, code: 'chatOnly' })

    expect(
      await kit.runs.send(PLACE, {
        source: { kind: 'group', groupId: kit.groupId },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'chatOnly', cardId: a })
  })

  it('сломанная привязка останавливает всё до первого запуска', async () => {
    const kit = await setup([scenario('fix', ['task'])])

    await kit.card('A', {})
    const broken = await kit.card('B', { scenarioId: 'gone' })
    const outcome = await kit.runs.send(PLACE, {
      source: { kind: 'group', groupId: kit.groupId },
      target: { kind: 'new', worktree: false },
    })

    expect(outcome).toEqual({ ok: false, code: 'scenarioGone', cardId: broken })
    expect(kit.started).toEqual([])
  })

  it('пустое обязательное поле - отказ, карточка без сценария - отказ', async () => {
    const kit = await setup([scenario('fix', ['task', 'notes'])])
    const a = await kit.card('A', { inputs: { task: '{{card}}', notes: '{{subtitle}}' } })
    const plain = await kit.card('B', null)

    expect(
      await kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: a },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'scenarioMissingInput', cardId: a })
    expect(
      await kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: plain },
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'noScenario', cardId: plain })
  })
})

describe('статус карточки', () => {
  it('сделанный элемент отмечает карточку один раз', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: a },
      target: { kind: 'new', worktree: false },
    })

    const item = kit.queues[0]?.items[0]

    if (!item) throw new Error('нет элемента')

    item.state = 'running'
    kit.runs.queuesChanged()
    let task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.done, task?.run?.state]).toEqual([false, 'running'])

    item.state = 'done'
    kit.runs.queuesChanged()
    task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]
    expect([task?.done, task?.doneAt, task?.run?.state]).toEqual([true, 7000, 'done'])

    await kit.apply({ kind: 'card.update', id: a, fields: { done: false } })
    kit.runs.queuesChanged()
    task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]
    expect(task?.done).toBe(false)
  })

  it('сделанный элемент повторяющейся карточки переносит её на следующий срок', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.apply({
      kind: 'card.update',
      id: a,
      fields: {
        due: { date: '2026-11-16', time: '09:00' },
        repeat: { every: 1, unit: 'week', weekdays: [1], start: '', fromDone: false },
      },
    })
    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: a },
      target: { kind: 'new', worktree: false },
    })

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'done'
    kit.runs.queuesChanged()

    const task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.done, task?.due?.date, task?.run?.state]).toEqual([false, '2026-11-23', 'done'])
    // Сделанный прогон не держит карточку: в следующий срок она уходит снова.
    expect(
      (
        await kit.runs.send(PLACE, {
          source: { kind: 'card', cardId: a },
          target: { kind: 'new', worktree: false },
        })
      ).ok,
    ).toBe(true)
  })

  it('упавший элемент карточку не отмечает', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})

    await kit.runs.send(PLACE, {
      source: { kind: 'card', cardId: a },
      target: { kind: 'new', worktree: false },
    })

    const item = kit.queues[0]?.items[0]

    if (item) item.state = 'failed'
    kit.runs.queuesChanged()

    const task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect([task?.done, task?.run?.state]).toEqual([false, 'failed'])
  })

  it('карточку в очереди второй раз не отправить; закрытая очередь её отпускает', async () => {
    const kit = await setup([scenario('fix', ['task'])])
    const a = await kit.card('A', {})
    const send = () =>
      kit.runs.send(PLACE, {
        source: { kind: 'card', cardId: a },
        target: { kind: 'new', worktree: false },
      })

    await send()
    expect(await send()).toEqual({ ok: false, code: 'alreadyQueued', cardId: a })

    const queue = kit.queues[0]

    if (!queue) throw new Error('нет очереди')

    // Очередь закрыли с живым worktree: элемент так и «ждёт», но запускать его уже некому.
    queue.closedAt = 1
    kit.runs.queuesChanged()

    const task = (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]

    expect(task?.run?.state).toBe('gone')
    expect((await send()).ok).toBe(true)
  })
})

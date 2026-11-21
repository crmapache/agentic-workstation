import { it, expect, describe, afterEach } from 'vitest'

import { accountOf } from '@agentic-workstation/cloud-protocol/node-account'
import { openRecord, sealRecord } from '@agentic-workstation/cloud-protocol/node-seal'

import { PLACE, trackerKit } from '../tracker/tracker-test-kit'
import { FakeCloud } from './cloud-fake'
import { CloudSync } from './cloud-sync'

const DAY = 24 * 60 * 60 * 1000
const account = accountOf(Buffer.alloc(32, 21))
const seal = {
  seal: (id: string, text: string) => sealRecord(account.sealKey, id, text),
  open: (id: string, blob: string) => openRecord(account.sealKey, id, blob),
}

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

const machine = async (cloud: FakeCloud, options: { now?: () => number } = {}) => {
  const kit = await trackerKit({
    remote: 'github.com/me/app',
    ...(options.now ? { now: options.now } : {}),
  })
  const sync = new CloudSync({
    collection: kit.book,
    transport: cloud.transport(),
    seal,
    onReport: () => undefined,
  })

  closers.push(() => kit.service.close())

  return { ...kit, sync }
}

const tasksOf = async (kit: Awaited<ReturnType<typeof machine>>) =>
  (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups.map((group) => [
    group.title,
    ...group.tasks.map((task) => [task.title, ...task.followUps.map((one) => one.title)]),
  ])

/** Доска с проектом, потоком и группой на первой машине, у второй - её копия. */
const twoMachines = async () => {
  const cloud = new FakeCloud()
  const mac = await machine(cloud)
  const projectId = await mac.make({ kind: 'project.create', title: 'P' })
  const flowId = await mac.make({ kind: 'flow.create', projectId, title: 'F' })
  const groupId = await mac.make({ kind: 'group.create', flowId, title: 'G' })

  await mac.sync.syncOnce()

  const windows = await machine(cloud)

  await windows.sync.syncOnce()
  await windows.service.board(PLACE)

  return { cloud, mac, windows, projectId, flowId, groupId }
}

describe('встречные правки двух машин', () => {
  it('новая карточка в группе, удалённой на другой машине, возвращает группу', async () => {
    const { mac, windows, groupId } = await twoMachines()

    await mac.apply({ kind: 'group.delete', id: groupId })
    await windows.make({ kind: 'card.create', groupId, fields: { title: 'Офлайн' } })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    expect(await tasksOf(mac)).toEqual([['G', ['Офлайн']]])
    expect(await tasksOf(windows)).toEqual([['G', ['Офлайн']]])
  })

  it('перенос задачи в цепочку и продолжение к ней с другой машины - всё в одной цепочке', async () => {
    const { mac, windows, groupId } = await twoMachines()
    const t1 = await mac.make({ kind: 'card.create', groupId, fields: { title: 'T1' } })
    const t2 = await mac.make({ kind: 'card.create', groupId, fields: { title: 'T2' } })

    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.apply({ kind: 'card.move', id: t1, groupId: '', followUpOf: t2, beforeId: null })
    await windows.make({ kind: 'card.create', groupId, followUpOf: t1, fields: { title: 'F' } })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    // Место F и T1 в цепочке могло совпасть (оба - первые в своих цепочках): порядок решает id,
    // одинаково на обеих машинах. Главное - никто не пропал и корень один.
    const [group] = (await tasksOf(mac)) ?? []
    const [, chain] = group ?? []

    expect(group?.length).toBe(2)
    expect(chain?.[0]).toBe('T2')
    expect([...(chain ?? [])].sort()).toEqual(['F', 'T1', 'T2'])
    expect(await tasksOf(windows)).toEqual(await tasksOf(mac))
  })

  it('встречные переносы задач друг к другу - цикл рвётся одинаково, ничего не пропадает', async () => {
    const { mac, windows, groupId } = await twoMachines()
    const a = await mac.make({ kind: 'card.create', groupId, fields: { title: 'A' } })
    const b = await mac.make({ kind: 'card.create', groupId, fields: { title: 'B' } })

    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.apply({ kind: 'card.move', id: a, groupId: '', followUpOf: b, beforeId: null })
    await windows.apply({ kind: 'card.move', id: b, groupId: '', followUpOf: a, beforeId: null })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    const cards = (await tasksOf(mac))?.[0]?.slice(1).flat()

    expect(cards?.sort()).toEqual(['A', 'B'])
    expect(await tasksOf(windows)).toEqual(await tasksOf(mac))
  })
})

describe('повторяющаяся карточка', () => {
  it('две машины отметили один круг без сети - срок уходит на один шаг, а не на два', async () => {
    // Вторник 17 ноября 2026, полдень по часам машины.
    const now = () => new Date(2026, 10, 17, 12).getTime()
    const cloud = new FakeCloud()
    const mac = await machine(cloud, { now })
    const projectId = await mac.make({ kind: 'project.create', title: 'P' })
    const flowId = await mac.make({ kind: 'flow.create', projectId, title: 'F' })
    const groupId = await mac.make({ kind: 'group.create', flowId, title: 'G' })
    const card = await mac.make({
      kind: 'card.create',
      groupId,
      fields: {
        title: 'Отчёт',
        due: { date: '2026-11-16', time: null },
        repeat: { every: 1, unit: 'week', weekdays: [1], start: '', fromDone: false },
      },
    })

    await mac.sync.syncOnce()

    const windows = await machine(cloud, { now })

    await windows.sync.syncOnce()
    await windows.service.board(PLACE)
    await mac.apply({ kind: 'card.update', id: card, fields: { done: true } })
    await windows.apply({ kind: 'card.update', id: card, fields: { done: true } })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    const dueOf = async (kit: typeof mac) =>
      (await kit.service.board(PLACE)).projects[0]?.flows[0]?.groups[0]?.tasks[0]?.due

    expect(await dueOf(mac)).toEqual({ date: '2026-11-23', time: null })
    expect(await dueOf(windows)).toEqual({ date: '2026-11-23', time: null })
  })
})

describe('облако откатилось назад', () => {
  it('записи, которых там больше нет, уходят снова, правка проходит', async () => {
    const { cloud, mac, groupId } = await twoMachines()
    const card = await mac.make({ kind: 'card.create', groupId, fields: { title: 'До' } })

    await mac.sync.syncOnce()

    // Облако подняли из бэкапа, где этой карточки ещё нет.
    cloud.records.delete(card)
    cloud.rev -= 1

    await mac.apply({ kind: 'card.update', id: card, fields: { title: 'После' } })
    await mac.sync.syncOnce()
    await mac.sync.syncOnce()

    expect(mac.book.pending).toBe(0)
    expect(cloud.records.has(card)).toBe(true)
  })
})

describe('срок архива', () => {
  it('до сверки с облаком машина не удаляет проект, который вернули на другой', async () => {
    let now = 1_000_000
    const cloud = new FakeCloud()
    const mac = await machine(cloud, { now: () => now })
    const projectId = await mac.make({ kind: 'project.create', title: 'Живой' })

    await mac.apply({ kind: 'project.archive', id: projectId })
    await mac.sync.syncOnce()

    const stale = await trackerKit({
      remote: 'github.com/me/app',
      now: () => now,
      waitForSync: true,
    })

    closers.push(() => stale.service.close())
    stale.book.absorb(
      [...cloud.records.values()].map((record) => ({
        id: record.id,
        rev: record.rev,
        text: seal.open(record.id, record.blob) ?? '',
      })),
    )

    now += 5 * DAY
    await mac.apply({ kind: 'project.restore', id: projectId })
    await mac.sync.syncOnce()
    now += 26 * DAY

    // Вторая машина просыпается через месяц: срок по её копии вышел, но сверки ещё не было.
    await stale.service.board(PLACE)
    expect(stale.book.get(projectId)?.fields.deleted).toBeUndefined()

    const sync = new CloudSync({
      collection: stale.book,
      transport: cloud.transport(),
      seal,
      onReport: () => undefined,
    })

    await sync.syncOnce()
    stale.service.markSynced()

    expect((await stale.service.board(PLACE)).projects.map((one) => one.title)).toEqual(['Живой'])
  })
})

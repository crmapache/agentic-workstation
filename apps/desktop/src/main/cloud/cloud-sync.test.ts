import { it, expect, describe, afterEach } from 'vitest'

import { accountOf } from '@agentic-workstation/cloud-protocol/node-account'
import { openRecord, sealRecord } from '@agentic-workstation/cloud-protocol/node-seal'

import { PLACE, trackerKit } from '../tracker/tracker-test-kit'
import { FakeCloud } from './cloud-fake'
import { CloudSync } from './cloud-sync'

const account = accountOf(Buffer.alloc(32, 11))
const seal = {
  seal: (id: string, text: string) => sealRecord(account.sealKey, id, text),
  open: (id: string, blob: string) => openRecord(account.sealKey, id, blob),
}

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

/** Компьютер: трекер на своей книге и синхронизация с общим облаком. */
const machine = async (cloud: FakeCloud, remote = 'github.com/me/app') => {
  const kit = await trackerKit({ remote })
  const sync = new CloudSync({
    collection: kit.book,
    transport: cloud.transport(),
    seal,
    onReport: () => undefined,
  })

  closers.push(() => kit.service.close())

  return { ...kit, sync }
}

const projectTitles = async (kit: Awaited<ReturnType<typeof machine>>) =>
  (await kit.service.board(PLACE)).projects.map((project) => project.title)

describe('синхронизация двух компьютеров', () => {
  it('доска первого появляется на втором, проект узнаётся по origin', async () => {
    const cloud = new FakeCloud()
    const mac = await machine(cloud)
    const windows = await machine(cloud)

    await mac.make({ kind: 'project.create', title: 'Релиз' })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()

    expect(await projectTitles(windows)).toEqual(['Релиз'])
    expect(mac.book.pending).toBe(0)
    expect(windows.book.pending).toBe(0)

    for (const record of cloud.records.values()) {
      expect(Buffer.from(record.blob, 'base64url').toString('utf8')).not.toContain('Релиз')
    }
  })

  it('пространства, заведённые до встречи, сливаются в одно', async () => {
    const cloud = new FakeCloud()
    const mac = await machine(cloud)
    const windows = await machine(cloud)

    await mac.make({ kind: 'project.create', title: 'С мака' })
    await windows.make({ kind: 'project.create', title: 'С винды' })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()
    // Слияние пространств - своя правка: ещё круг, чтобы она дошла до второго компьютера.
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    expect((await projectTitles(mac)).sort()).toEqual(['С винды', 'С мака'])
    expect((await projectTitles(windows)).sort()).toEqual(['С винды', 'С мака'])
  })

  it('правки одного поля и разных полей сходятся без потерь', async () => {
    const cloud = new FakeCloud()
    const mac = await machine(cloud)
    const windows = await machine(cloud)
    const projectId = await mac.make({ kind: 'project.create', title: 'Релиз' })

    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.apply({ kind: 'project.update', id: projectId, title: 'Релиз 2' })
    await windows.apply({ kind: 'project.update', id: projectId, description: 'Описание' })
    await mac.sync.syncOnce()
    await windows.sync.syncOnce()
    await mac.sync.syncOnce()

    for (const kit of [mac, windows]) {
      const board = await kit.service.board(PLACE)

      expect([board.projects[0]?.title, board.projects[0]?.description]).toEqual([
        'Релиз 2',
        'Описание',
      ])
    }
  })

  it('запись, обогнанная другим компьютером, сливается и уходит снова', async () => {
    const cloud = new FakeCloud()
    const mac = await machine(cloud)
    const projectId = await mac.make({ kind: 'project.create', title: 'Релиз' })

    await mac.sync.syncOnce()

    const windowsKit = await trackerKit({ remote: 'github.com/me/app' })
    const base = cloud.transport()
    let overtaken = false
    const windows = new CloudSync({
      collection: windowsKit.book,
      transport: {
        pull: base.pull,
        push: async (records) => {
          if (!overtaken) {
            overtaken = true
            await mac.apply({ kind: 'project.update', id: projectId, title: 'С мака' })
            await mac.sync.syncOnce()
          }

          return base.push(records)
        },
      },
      seal,
      onReport: () => undefined,
    })

    closers.push(() => windowsKit.service.close())
    await windows.syncOnce()
    await windowsKit.apply({ kind: 'project.update', id: projectId, description: 'С винды' })
    overtaken = false
    await windows.syncOnce()
    await mac.sync.syncOnce()

    expect(cloud.disputes).toBeGreaterThan(0)
    expect(windowsKit.book.pending).toBe(0)

    const board = await mac.service.board(PLACE)

    expect([board.projects[0]?.title, board.projects[0]?.description]).toEqual([
      'С мака',
      'С винды',
    ])
  })

  it('забор страницами и чужой ключ не открывает записи', async () => {
    const cloud = new FakeCloud(2)
    const mac = await machine(cloud)

    for (const title of ['A', 'B', 'C', 'D']) await mac.make({ kind: 'project.create', title })
    await mac.sync.syncOnce()

    const windows = await machine(cloud)

    await windows.sync.syncOnce()
    expect(await projectTitles(windows)).toEqual(['A', 'B', 'C', 'D'])

    const stranger = await trackerKit({ remote: 'github.com/me/app' })
    const other = accountOf(Buffer.alloc(32, 12))
    const strangerSync = new CloudSync({
      collection: stranger.book,
      transport: cloud.transport(),
      seal: {
        seal: (id, text) => sealRecord(other.sealKey, id, text),
        open: (id, blob) => openRecord(other.sealKey, id, blob),
      },
      onReport: () => undefined,
    })

    closers.push(() => stranger.service.close())
    await strangerSync.syncOnce()

    expect((await stranger.service.board(PLACE)).projects).toEqual([])
  })
})

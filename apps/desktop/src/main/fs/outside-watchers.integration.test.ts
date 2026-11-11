import { rm, mkdir, rename, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { OutsideWatchers } from './outside-watchers'

// Настоящее слежение macOS во временной папке: события приходят сами, тест только ждёт.
const WAIT_MS = 5_000

/** Тишина, после которой лишнего события уже не будет: пачка уходит через 150 мс. */
const SETTLE_MS = 600

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('OutsideWatchers', () => {
  let base = ''
  let watchers: OutsideWatchers | null = null
  let events: { projectId: string; paths: string[] }[] = []

  /** Дождаться события с этим путём или упасть по сроку. */
  const waitFor = async (path: string) => {
    const deadline = Date.now() + WAIT_MS

    while (!events.some((event) => event.paths.includes(path))) {
      if (Date.now() > deadline) throw new Error(`события про ${path} не было`)

      await pause(50)
    }
  }

  beforeAll(async () => {
    // realpath: /var у macOS - ссылка на /private/var, слежение отдаёт настоящий путь.
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-outside-watch-')))
    await mkdir(join(base, 'plans'))
    await writeFile(join(base, 'plans', 'plan.md'), '# 1\n')
    await writeFile(join(base, 'plans', 'other.md'), 'x')
  })

  afterAll(async () => {
    watchers?.dispose()
    await rm(base, { recursive: true, force: true })
  })

  it('правка, сохранение переименованием и смена набора', async () => {
    const plan = join(base, 'plans', 'plan.md')

    watchers = new OutsideWatchers((projectId, paths) => events.push({ projectId, paths }))
    watchers.set([{ projectId: 'p1', path: plan }])
    // Слежение системы начинает присылать события не сразу после подписки.
    await pause(300)

    await writeFile(plan, '# 2\n')
    await waitFor(plan)
    expect(events.at(-1)).toEqual({ projectId: 'p1', paths: [plan] })

    // Запись через временный файл и переименование - как наш редактор и Claude Code.
    events = []
    await writeFile(join(base, 'plans', '.plan.md.tmp'), '# 3\n')
    await rename(join(base, 'plans', '.plan.md.tmp'), plan)
    await waitFor(plan)

    // Соседний файл в той же папке - не вкладка, о нём не говорят.
    events = []
    await writeFile(join(base, 'plans', 'other.md'), 'y')
    await pause(SETTLE_MS)
    expect(events).toEqual([])

    // Вкладку закрыли - набор пуст, слежение снято.
    watchers.set([])
    await writeFile(plan, '# 4\n')
    await pause(SETTLE_MS)
    expect(events).toEqual([])
  })
})

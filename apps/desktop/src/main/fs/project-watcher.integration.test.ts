import { execFileSync } from 'node:child_process'
import { rm, mkdir, rename, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { readGitScope, readGitStatus } from '../git/git-status'
import { ProjectWatcher } from './project-watcher'
import type { WatchBatch } from './watch-batch'

// Настоящее слежение macOS (FSEvents) во временной папке: пачки приходят сами, тест
// только ждёт нужную.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

const WAIT_MS = 5_000

describe('ProjectWatcher', () => {
  let root = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } })

  /** Следит за папкой, пока действие не даст пачку, подходящую под условие. */
  const watchUntil = async (
    rootPath: string,
    act: () => Promise<void>,
    matches: (batch: WatchBatch) => boolean,
  ): Promise<WatchBatch> => {
    let found: (batch: WatchBatch) => void = () => undefined
    const batch = new Promise<WatchBatch>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('пачка не пришла')), WAIT_MS)

      found = (next) => {
        clearTimeout(timer)
        resolve(next)
      }
    })
    const watcher = new ProjectWatcher(rootPath, (next) => {
      if (matches(next)) found(next)
    })

    // FSEvents начинает присылать события не сразу после подписки.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await act()

    try {
      return await batch
    } finally {
      watcher.close()
    }
  }

  beforeAll(async () => {
    // realpath: /var у macOS - ссылка на /private/var, FSEvents отдаёт настоящий путь.
    root = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-watch-')))
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it('новый файл - перечитать его папку; он сам - среди переименованных', async () => {
    const project = join(root, 'plain')

    await mkdir(join(project, 'src'), { recursive: true })

    const batch = await watchUntil(
      project,
      () => writeFile(join(project, 'src', 'new.ts'), 'x\n'),
      ({ directories }) => directories?.includes('src') ?? false,
    )

    expect(batch.renamed).toContain('src/new.ts')
    expect(batch.paths).toContain('src/new.ts')
  })

  it('папку переименовали - события о ней самой, путь старой и новой', async () => {
    const project = join(root, 'moved')

    await mkdir(join(project, 'old', 'inner'), { recursive: true })

    const batch = await watchUntil(
      project,
      () => rename(join(project, 'old'), join(project, 'new')),
      ({ renamed }) => renamed.includes('old') && renamed.includes('new'),
    )

    expect(batch.directories).toEqual([''])
  })

  it('коммит в терминале - поменялся .git', async () => {
    const project = join(root, 'repo')

    await mkdir(project)
    gitIn(project, 'init', '--initial-branch=main')
    await writeFile(join(project, 'a.txt'), 'one\n')

    const batch = await watchUntil(
      project,
      () => {
        gitIn(project, 'add', '.')
        gitIn(project, 'commit', '-m', 'one')

        return Promise.resolve()
      },
      ({ git }) => git,
    )

    expect(batch.git).toBe(true)
  })

  it('проект - подпапка репозитория: .git выше корня тоже под слежением', async () => {
    const repo = join(root, 'outer')
    const project = join(repo, 'web')

    await mkdir(project, { recursive: true })
    gitIn(repo, 'init', '--initial-branch=main')
    await writeFile(join(project, 'page.ts'), 'one\n')
    // Дать слежению за .git подняться: его папку ищет git, это не мгновенно.
    const batch = await watchUntil(
      project,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        gitIn(repo, 'add', '.')
      },
      ({ git }) => git,
    )

    expect(batch.git).toBe(true)
  })

  it('проект - подпапка: правка .gitignore выше корня - тоже повод перечитать статус', async () => {
    const repo = join(root, 'monorepo')
    const project = join(repo, 'apps', 'web')

    await mkdir(project, { recursive: true })
    gitIn(repo, 'init', '--initial-branch=main')

    const batch = await watchUntil(
      project,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await writeFile(join(repo, '.gitignore'), 'dist/\n')
      },
      ({ git }) => git,
    )

    expect(batch.git).toBe(true)
  })

  it('с git fsmonitor чтение статуса не будит слежение за .git', async () => {
    // Демон fsmonitor пишет куки в .git на каждый git status. Если бы слежение считало
    // это изменением, статус перечитывался бы сам по кругу.
    const project = join(root, 'fsmonitor')

    await mkdir(project)
    gitIn(project, 'init', '--initial-branch=main')
    gitIn(project, 'config', 'core.fsmonitor', 'true')
    await writeFile(join(project, 'a.txt'), 'one\n')

    const scope = (await readGitScope(project)) ?? { prefix: '', ignoreCase: true }
    const batches: WatchBatch[] = []
    const watcher = new ProjectWatcher(project, (batch) => batches.push(batch))

    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await readGitStatus(project, scope)
      await readGitStatus(project, scope)
      await new Promise((resolve) => setTimeout(resolve, 1_500))

      expect(batches.filter(({ git }) => git)).toEqual([])
    } finally {
      watcher.close()
      gitIn(project, 'fsmonitor--daemon', 'stop')
    }
  })
})

import { it, vi, expect, describe } from 'vitest'

import type { GitStatus, GitChanges, GitLineStats } from '@shared/git'

import { GitStatusService } from './git-status-service'
import type { GitStatusReader } from './git-status-service'

const statusWith = (files: GitStatus['files'], folders: GitStatus['folders'] = {}): GitStatus => ({
  files,
  folders,
  changedFolders: {},
  truncated: false,
  ignoreCase: false,
})

const changesWith = (...paths: string[]): GitChanges => ({
  kind: 'listed',
  files: paths.map((path) => ({ path, kind: 'modified', origin: null })),
  truncated: false,
})

const linesWith = (added: number, deleted = 0): GitLineStats => ({
  added,
  deleted,
  files: 1,
  partial: false,
})

/**
 * Чтение без git: проект в корне репозитория, статусы - по очереди из списка, список
 * изменений и счёт строк - всегда одни и те же, если их не подменить.
 */
const fakeReader = (...statuses: (GitStatus | null)[]) => {
  const scope = vi.fn<GitStatusReader['scope']>(() =>
    Promise.resolve({ prefix: '', ignoreCase: false }),
  )
  const status = vi.fn<GitStatusReader['status']>(() => Promise.resolve(statuses.shift() ?? null))
  const changes = vi.fn<GitStatusReader['changes']>(() => Promise.resolve(changesWith('a.ts')))
  const lines = vi.fn<GitStatusReader['lines']>(() => Promise.resolve(linesWith(1)))

  return { scope, status, changes, lines }
}

/** Слушатели: заданные, остальные - молча. */
const listen = (status = vi.fn(), changes = vi.fn(), lines = vi.fn()) => ({
  status,
  changes,
  lines,
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('GitStatusService', () => {
  it('рассылает статус, только когда он стал другим', async () => {
    const onStatus = vi.fn()
    const reader = fakeReader(
      statusWith({ 'a.ts': 'modified' }),
      statusWith({ 'a.ts': 'modified' }),
      statusWith({}),
    )
    const service = new GitStatusService(listen(onStatus), reader)

    await service.get('p1', '/repo')
    await service.get('p1', '/repo')
    await service.get('p1', '/repo')

    expect(reader.status).toHaveBeenCalledTimes(3)
    expect(onStatus.mock.calls).toEqual([
      ['p1', statusWith({ 'a.ts': 'modified' })],
      ['p1', statusWith({})],
    ])
  })

  it('изменения на диске не читают проект, о котором окно не спрашивало', () => {
    const reader = fakeReader()
    const service = new GitStatusService(listen(), reader)

    service.changed('p1', { git: true, paths: null })

    expect(reader.scope).not.toHaveBeenCalled()
    expect(reader.status).not.toHaveBeenCalled()
  })

  it('изменения только внутри игнорируемого статус не перечитывают', async () => {
    const ignored = statusWith({ 'debug.log': 'ignored' }, { out: 'ignored' })
    const reader = fakeReader(ignored, ignored)
    const service = new GitStatusService(listen(), reader)

    await service.get('p1', '/repo')
    service.changed('p1', { git: false, paths: ['out/bundle.js', 'debug.log'] })
    await settle()
    expect(reader.status).toHaveBeenCalledTimes(1)

    service.changed('p1', { git: false, paths: ['out/bundle.js', 'src/app.ts'] })
    await settle()
    expect(reader.status).toHaveBeenCalledTimes(2)
  })

  it('место в репозитории узнаётся один раз и заново - после изменений в .git', async () => {
    const reader = fakeReader()
    const service = new GitStatusService(listen(), reader)

    await service.get('p1', '/repo')
    service.changed('p1', { git: false, paths: ['src/app.ts'] })
    await settle()
    expect(reader.scope).toHaveBeenCalledTimes(1)

    service.changed('p1', { git: true, paths: [] })
    await settle()
    expect(reader.scope).toHaveBeenCalledTimes(2)
  })

  it('не репозиторий - статус null без чтения git status', async () => {
    const reader = fakeReader()

    reader.scope.mockResolvedValue(null)

    const service = new GitStatusService(listen(), reader)

    expect(await service.get('p1', '/plain')).toBeNull()
    expect(await service.getChanges('p1', '/plain')).toEqual({ kind: 'notGit' })
    expect(await service.getLineStats('p1', '/plain')).toBeNull()
    expect(reader.status).not.toHaveBeenCalled()
    expect(reader.changes).not.toHaveBeenCalled()
    expect(reader.lines).not.toHaveBeenCalled()
  })

  it('закрытый во время чтения проект окну не рассылается', async () => {
    const onStatus = vi.fn()
    let finish: (status: GitStatus) => void = () => undefined
    const service = new GitStatusService(listen(onStatus), {
      scope: () => Promise.resolve({ prefix: '', ignoreCase: false }),
      status: () => new Promise((resolve) => (finish = resolve)),
      changes: () => Promise.resolve({ kind: 'failed' }),
      lines: () => Promise.resolve(null),
    })
    const pending = service.get('p1', '/repo')

    await settle()
    service.forget('p1')
    finish(statusWith({}))
    await pending

    expect(onStatus).not.toHaveBeenCalled()
  })

  it('список изменений читается только после вопроса окна и дальше - с каждым статусом', async () => {
    const reader = fakeReader()
    const service = new GitStatusService(listen(), reader)

    await service.get('p1', '/repo')
    service.changed('p1', { git: false, paths: ['src/app.ts'] })
    await settle()
    expect(reader.changes).not.toHaveBeenCalled()

    expect(await service.getChanges('p1', '/repo')).toEqual(changesWith('a.ts'))
    service.changed('p1', { git: false, paths: ['src/app.ts'] })
    await settle()
    expect(reader.changes).toHaveBeenCalledTimes(2)
  })

  it('рассылает список изменений, только когда он стал другим', async () => {
    const onChanges = vi.fn()
    const reader = fakeReader()
    const service = new GitStatusService(listen(vi.fn(), onChanges), reader)

    reader.changes
      .mockResolvedValueOnce(changesWith('a.ts'))
      .mockResolvedValueOnce(changesWith('a.ts'))
      .mockResolvedValueOnce(changesWith('a.ts', 'b.ts'))

    await service.getChanges('p1', '/repo')
    await service.getChanges('p1', '/repo')
    await service.getChanges('p1', '/repo')

    expect(onChanges.mock.calls).toEqual([
      ['p1', changesWith('a.ts')],
      ['p1', changesWith('a.ts', 'b.ts')],
    ])
  })

  it('счёт строк читается только после вопроса окна и дальше - с каждым статусом', async () => {
    const reader = fakeReader()
    const service = new GitStatusService(listen(), reader)

    await service.get('p1', '/repo')
    expect(reader.lines).not.toHaveBeenCalled()

    expect(await service.getLineStats('p1', '/repo')).toEqual(linesWith(1))
    expect(reader.lines.mock.calls[0]?.[1]).toEqual(changesWith('a.ts'))

    service.changed('p1', { git: false, paths: ['src/app.ts'] })
    await settle()
    expect(reader.lines).toHaveBeenCalledTimes(2)
  })

  it('список изменений ради счёта строк читается, но окну не рассылается', async () => {
    const onChanges = vi.fn()
    const onLines = vi.fn()
    const reader = fakeReader()
    const service = new GitStatusService(listen(vi.fn(), onChanges, onLines), reader)

    await service.getLineStats('p1', '/repo')

    expect(reader.changes).toHaveBeenCalledTimes(1)
    expect(onChanges).not.toHaveBeenCalled()
    expect(onLines.mock.calls).toEqual([['p1', linesWith(1)]])
  })

  it('рассылает счёт строк, только когда он стал другим', async () => {
    const onLines = vi.fn()
    const reader = fakeReader()
    const service = new GitStatusService(listen(vi.fn(), vi.fn(), onLines), reader)

    reader.lines
      .mockResolvedValueOnce(linesWith(3))
      .mockResolvedValueOnce(linesWith(3))
      .mockResolvedValueOnce(linesWith(3, 1))

    await service.getLineStats('p1', '/repo')
    await service.getLineStats('p1', '/repo')
    await service.getLineStats('p1', '/repo')

    expect(onLines.mock.calls).toEqual([
      ['p1', linesWith(3)],
      ['p1', linesWith(3, 1)],
    ])
  })

  it('git не ответил списком изменений - счёта строк нет', async () => {
    const reader = fakeReader()

    reader.changes.mockResolvedValue({ kind: 'failed' })

    const service = new GitStatusService(listen(), reader)

    expect(await service.getLineStats('p1', '/repo')).toBeNull()
    expect(reader.lines).not.toHaveBeenCalled()
  })
})

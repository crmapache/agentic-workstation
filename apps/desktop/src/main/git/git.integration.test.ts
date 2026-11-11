import { execFileSync } from 'node:child_process'
import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { createBranch, listBranches, switchBranch, checkoutRevision } from './git-branches'
import { cloneRepository } from './git-clone'
import { readHead } from './git-head'
import { pull, push, readPushInfo } from './git-remote'

// Настоящий git во временной папке: «удалённый» репозиторий - bare рядом. Разбор
// вывода и поведение проверяются на живом git, а не на придуманных строках.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

describe('git', () => {
  let root = ''
  let origin = ''
  let repo = ''
  let other = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } })
      .toString()
      .trim()

  const commit = async (cwd: string, file: string, text: string) => {
    await writeFile(join(cwd, file), text)
    gitIn(cwd, 'add', '.')
    gitIn(cwd, 'commit', '-m', text)
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-git-'))
    origin = join(root, 'origin.git')
    repo = join(root, 'repo')
    other = join(root, 'other')
    gitIn(root, 'init', '--bare', '--initial-branch=main', origin)
    gitIn(root, 'clone', origin, repo)
    await commit(repo, 'a.txt', 'one\n')
    gitIn(repo, 'push', '-u', 'origin', 'main')
    gitIn(repo, 'push', 'origin', 'main:feature/remote-only')
    gitIn(repo, 'tag', 'v1')
    gitIn(root, 'clone', origin, other)
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it('ветка, локальные и удалённые ветки', async () => {
    expect(await readHead(repo)).toEqual({ kind: 'branch', name: 'main' })
    expect(await listBranches(repo)).toEqual({
      local: ['main'],
      remote: ['origin/feature/remote-only', 'origin/main'],
    })
  })

  it('не репозиторий - ни ветки, ни списков', async () => {
    expect(await readHead(root)).toBeNull()
    expect(await listBranches(root)).toEqual({ local: [], remote: [] })
  })

  it('удалённая ветка без локальной - создаётся отслеживающая', async () => {
    const result = await switchBranch(repo, 'origin/feature/remote-only', 'remote')

    expect(result.ok).toBe(true)
    expect(await readHead(repo)).toEqual({ kind: 'branch', name: 'feature/remote-only' })
    expect(gitIn(repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe(
      'origin/feature/remote-only',
    )
    await switchBranch(repo, 'main', 'local')
  })

  it('несуществующая ветка или опция вместо имени - отказ без git switch', async () => {
    expect(await switchBranch(repo, 'nope', 'local')).toMatchObject({ ok: false })
    expect(await switchBranch(repo, '--orphan=x', 'local')).toMatchObject({ ok: false })
    expect(await readHead(repo)).toEqual({ kind: 'branch', name: 'main' })
  })

  it('новая ветка: создаётся и становится текущей; плохое имя - отказ', async () => {
    expect((await createBranch(repo, 'feature/new')).ok).toBe(true)
    expect(await readHead(repo)).toEqual({ kind: 'branch', name: 'feature/new' })
    expect(await createBranch(repo, 'bad name..')).toMatchObject({ ok: false })
    expect(await createBranch(repo, '-x')).toMatchObject({ ok: false })
    await switchBranch(repo, 'main', 'local')
  })

  it('тег или коммит - без ветки; чужое - отказ', async () => {
    expect((await checkoutRevision(repo, 'v1')).ok).toBe(true)
    expect((await readHead(repo))?.kind).toBe('detached')
    expect(await checkoutRevision(repo, 'no-such-tag')).toMatchObject({ ok: false })
    expect(await checkoutRevision(repo, '--help')).toMatchObject({ ok: false })
    await switchBranch(repo, 'main', 'local')
  })

  it('push с upstream и сведения для подтверждения', async () => {
    await commit(repo, 'b.txt', 'two\n')

    expect(await readPushInfo(repo)).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      remote: 'origin',
      ahead: 1,
    })
    expect((await push(repo)).ok).toBe(true)
    expect((await readPushInfo(repo))?.ahead).toBe(0)
  })

  it('push ветки без upstream - публикует её', async () => {
    await createBranch(repo, 'feature/publish')

    expect((await readPushInfo(repo))?.upstream).toBeNull()
    expect((await push(repo)).ok).toBe(true)
    expect(gitIn(repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/feature/publish')
    await switchBranch(repo, 'main', 'local')
  })

  it('pull перематывает вперёд, разошедшиеся ветки - отказ без изменений', async () => {
    expect((await pull(other)).ok).toBe(true)
    expect(gitIn(other, 'log', '-1', '--format=%s')).toBe('two')

    await commit(repo, 'c.txt', 'three\n')
    gitIn(repo, 'push')
    await commit(other, 'd.txt', 'local only\n')

    const result = await pull(other)

    expect(result.ok).toBe(false)
    expect(gitIn(other, 'log', '-1', '--format=%s')).toBe('local only')
  })

  it('клон в новую папку; существующая папка и не адрес - отказ', async () => {
    const result = await cloneRepository(origin, root)

    expect(result).toEqual({ ok: true, rootPath: join(root, 'origin') })
    expect(await cloneRepository(origin, root)).toMatchObject({ ok: false })
    expect(await cloneRepository('--upload-pack=x', root)).toMatchObject({ ok: false })
  })

  it('pull и checkout, запущенные разом, идут по очереди в порядке вызова', async () => {
    // Без очереди checkout успевает пройти, пока pull качает, и pull перематывает уже
    // отсоединённый HEAD: итог - HEAD на новом коммите, а ветка main не обновлена.
    const racer = join(root, 'racer')

    gitIn(root, 'clone', origin, racer)

    const before = gitIn(racer, 'rev-parse', 'HEAD')

    await commit(repo, 'e.txt', 'four\n')
    gitIn(repo, 'push')

    const [pulled, checkedOut] = await Promise.all([pull(racer), checkoutRevision(racer, before)])

    expect(pulled.ok).toBe(true)
    expect(checkedOut.ok).toBe(true)
    // Сначала pull целиком на ветке main, потом переход на старый коммит.
    expect(gitIn(racer, 'rev-parse', 'main')).toBe(gitIn(repo, 'rev-parse', 'HEAD'))
    expect((await readHead(racer))?.kind).toBe('detached')
    expect(gitIn(racer, 'rev-parse', 'HEAD')).toBe(before)
  })
})

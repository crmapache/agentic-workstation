import { execFileSync } from 'node:child_process'
import { rm, stat, mkdir, rename, utimes, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { readGitScope, readGitStatus as readStatus } from './git-status'

// Настоящий git во временной папке: статусы проверяются на живом выводе, а не на
// придуманных строках.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

/** Как читает сервис: сначала место проекта в репозитории, потом статус. */
const readGitStatus = async (rootPath: string) => {
  const prefix = await readGitScope(rootPath)

  return prefix === null ? null : readStatus(rootPath, prefix)
}

describe('readGitStatus', () => {
  let root = ''
  let repo = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } }).toString()

  const write = async (path: string, text: string) => {
    await mkdir(join(repo, path, '..'), { recursive: true })
    await writeFile(join(repo, path), text)
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-status-'))
    repo = join(root, 'repo')
    gitIn(root, 'init', '--initial-branch=main', repo)
    await write('.gitignore', 'out/\n*.log\n')
    await write('src/app.ts', 'one\n')
    await write('src/gone.ts', 'one\n')
    await write('web/page.ts', 'one\n')
    gitIn(repo, 'add', '.')
    gitIn(repo, 'commit', '-m', 'init')

    await write('src/app.ts', 'two\n')
    await rm(join(repo, 'src/gone.ts'))
    await write('src/staged.ts', 'new\n')
    gitIn(repo, 'add', 'src/staged.ts')
    await write('drafts/idea.md', 'idea\n')
    await write('notes.txt', 'note\n')
    await write('out/bundle.js', 'built\n')
    await write('debug.log', 'log\n')
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it('статусы файлов и папок проекта', async () => {
    expect(await readGitStatus(repo)).toEqual({
      files: {
        'src/app.ts': 'modified',
        'src/staged.ts': 'added',
        'notes.txt': 'untracked',
        'debug.log': 'ignored',
      },
      folders: { drafts: 'untracked', out: 'ignored' },
      changedFolders: { src: 'modified' },
      truncated: false,
      ignoreCase: true,
    })
  })

  it('проект - подпапка репозитория: пути от неё, остальное не видно', async () => {
    await write('web/page.ts', 'two\n')

    expect(await readGitStatus(join(repo, 'web'))).toEqual({
      files: { 'page.ts': 'modified' },
      folders: {},
      changedFolders: {},
      truncated: false,
      ignoreCase: true,
    })
  })

  it('чтение статуса не переписывает индекс', async () => {
    // Сам git status переписал бы индекс, увидев файл с новой датой и прежним
    // содержимым, - и слежение за .git проснулось бы от собственного чтения.
    const index = join(repo, '.git', 'index')
    const before = (await stat(index)).mtimeMs
    const future = new Date(Date.now() + 60_000)

    await utimes(join(repo, '.gitignore'), future, future)
    await readGitStatus(repo)

    expect((await stat(index)).mtimeMs).toBe(before)
  })

  it('папку переименовали только регистром - статус по ключу без регистра', async () => {
    // git отдаёт путь с регистром из индекса (Lib), дерево видит регистр с диска (lib).
    await write('Lib/util.ts', 'one\n')
    gitIn(repo, 'add', 'Lib/util.ts')
    gitIn(repo, 'commit', '-m', 'lib')
    await rename(join(repo, 'Lib'), join(repo, 'lib'))
    await write('lib/util.ts', 'two\n')

    const status = await readGitStatus(repo)

    expect(status?.files['lib/util.ts']).toBe('modified')
    expect(status?.changedFolders['lib']).toBe('modified')
  })

  it('не репозиторий - статуса нет', async () => {
    const plain = join(root, 'plain')

    await mkdir(plain)

    expect(await readGitStatus(plain)).toBeNull()
  })
})

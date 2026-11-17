import { execFileSync } from 'node:child_process'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { FileLineCounter } from './file-line-counter'
import { readGitLineStats } from './git-line-stats'
import { readGitScope, readGitChanges } from './git-status'

// Настоящий git во временной папке: счёт строк сверяется с живым выводом diff и status.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

/** Как читает сервис: место в репозитории, список изменений, потом счёт по нему. */
const readLines = async (rootPath: string) => {
  const scope = await readGitScope(rootPath)
  const changes = scope === null ? null : await readGitChanges(rootPath, scope)

  if (changes?.kind !== 'listed') throw new Error('список изменений не прочитался')

  return readGitLineStats(rootPath, changes, new FileLineCounter())
}

describe('счёт строк с последнего коммита', () => {
  let root = ''
  let repo = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } }).toString()

  const write = async (path: string, content: string | Buffer) => {
    await mkdir(join(repo, path, '..'), { recursive: true })
    await writeFile(join(repo, path), content)
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-line-stats-'))
    repo = join(root, 'repo')
    gitIn(root, 'init', '--initial-branch=main', repo)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const commitBase = async () => {
    await write('.gitignore', 'out/\n')
    await write('src/app.ts', 'one\ntwo\nthree\n')
    await write('src/gone.ts', 'a\nb\n')
    await write('src/old.ts', 'moved\nkept\nlines\nhere\n')
    await write('web/page.ts', 'page\n')
    gitIn(repo, 'add', '.')
    gitIn(repo, 'commit', '-m', 'init')
  }

  it('чистое дерево - ноль файлов и строк', async () => {
    await commitBase()

    expect(await readLines(repo)).toEqual({ added: 0, deleted: 0, files: 0, partial: false })
  })

  it('правки, удаление, новый в индексе и новый вне git - вместе; двоичный и игнорируемое - без строк', async () => {
    await commitBase()
    await write('src/app.ts', 'one\nTWO\nthree\nfour\n')
    await rm(join(repo, 'src/gone.ts'))
    await write('src/staged.ts', 'x\ny\n')
    gitIn(repo, 'add', 'src/staged.ts')
    await write('src/fresh.ts', 'p\nq\nr')
    await write('logo.png', Buffer.from([0x89, 0x50, 0x00, 0x01]))
    await write('out/bundle.js', 'ignored\n')

    // app: +2 -1, gone: -2, staged: +2, fresh: +3, logo: файл без строк.
    expect(await readLines(repo)).toEqual({ added: 7, deleted: 3, files: 5, partial: false })
  })

  it('переименованный в индексе файл - только его правки, а не удаление и новый целиком', async () => {
    await commitBase()
    gitIn(repo, 'mv', 'src/old.ts', 'src/new.ts')
    await write('src/new.ts', 'moved\nkept\nlines\nhere\nmore\n')

    expect(await readLines(repo)).toEqual({ added: 1, deleted: 0, files: 1, partial: false })
  })

  it('без коммитов - все файлы новые, строки с диска', async () => {
    await write('a.ts', 'one\ntwo\n')
    await write('b.ts', 'three\n')
    gitIn(repo, 'add', 'a.ts')

    expect(await readLines(repo)).toEqual({ added: 3, deleted: 0, files: 2, partial: false })
  })

  it('проект - подпапка репозитория: строки только его файлов', async () => {
    await commitBase()
    await write('src/app.ts', 'changed\n')
    await write('web/page.ts', 'page\nmore\n')
    await write('web/new.ts', 'n\n')

    expect(await readLines(join(repo, 'web'))).toEqual({
      added: 2,
      deleted: 0,
      files: 2,
      partial: false,
    })
  })
})

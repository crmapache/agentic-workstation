import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, rename, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { readHeadFile } from './git-head-file'
import { readGitScope, readGitChanges as readChanges } from './git-status'

// Настоящий git во временной папке: список изменений и версия из HEAD проверяются на
// живом выводе, а не на придуманных строках.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

/** Как читает сервис: сначала место проекта в репозитории, потом список. */
const readGitChanges = async (rootPath: string) => {
  const scope = await readGitScope(rootPath)
  const changes = scope === null ? null : await readChanges(rootPath, scope)

  return changes?.kind === 'listed' ? changes : null
}

describe('список изменений и версия из HEAD', () => {
  let root = ''
  let repo = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } }).toString()

  const write = async (path: string, content: string | Buffer, base = repo) => {
    await mkdir(join(base, path, '..'), { recursive: true })
    await writeFile(join(base, path), content)
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-changes-'))
    repo = join(root, 'repo')
    gitIn(root, 'init', '--initial-branch=main', repo)
    await write('.gitignore', 'out/\n*.log\n')
    await write('src/app.ts', 'one\n')
    await write('src/gone.ts', 'one\n')
    await write('src/old.ts', 'moved\n')
    await write('src/[id].tsx', 'page\n')
    await write('web/page.ts', 'one\n')
    await write('logo.bin', Buffer.from([0x89, 0x50, 0x00, 0x01]))
    gitIn(repo, 'add', '.')
    gitIn(repo, 'commit', '-m', 'init')

    await write('src/app.ts', 'two\n')
    await rm(join(repo, 'src/gone.ts'))
    gitIn(repo, 'mv', 'src/old.ts', 'src/new.ts')
    await write('src/staged.ts', 'new\n')
    gitIn(repo, 'add', 'src/staged.ts')
    await write('src/brief.ts', 'brief\n')
    gitIn(repo, 'add', 'src/brief.ts')
    await rm(join(repo, 'src/brief.ts'))
    await write('drafts/idea.md', 'idea\n')
    await write('drafts/deep/more.md', 'more\n')
    await write('notes.txt', 'note\n')
    await write('out/bundle.js', 'built\n')
    await write('debug.log', 'log\n')
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it('каждый файл со своим видом, новые - по одному и внутри новых папок', async () => {
    expect(await readGitChanges(repo)).toEqual({
      kind: 'listed',
      files: [
        { path: 'src/app.ts', kind: 'modified', origin: null },
        { path: 'src/gone.ts', kind: 'deleted', origin: null },
        { path: 'src/new.ts', kind: 'renamed', origin: 'src/old.ts' },
        { path: 'src/staged.ts', kind: 'added', origin: null },
        { path: 'drafts/deep/more.md', kind: 'untracked', origin: null },
        { path: 'drafts/idea.md', kind: 'untracked', origin: null },
        { path: 'notes.txt', kind: 'untracked', origin: null },
      ],
      truncated: false,
    })
  })

  it('проект в подпапке репозитория видит только своё, пути - от своей папки', async () => {
    const changes = await readGitChanges(join(repo, 'src'))

    expect(changes?.files.map((change) => [change.path, change.kind, change.origin])).toEqual([
      ['app.ts', 'modified', null],
      ['gone.ts', 'deleted', null],
      ['new.ts', 'renamed', 'old.ts'],
      ['staged.ts', 'added', null],
    ])
  })

  it('версия из HEAD: текст, нет в коммите, не текст', async () => {
    expect(await readHeadFile(repo, 'src/app.ts')).toEqual({
      kind: 'text',
      text: 'one\n',
      bom: false,
    })
    expect(await readHeadFile(repo, 'src/old.ts')).toEqual({
      kind: 'text',
      text: 'moved\n',
      bom: false,
    })
    expect(await readHeadFile(repo, 'src/staged.ts')).toEqual({ kind: 'missing' })
    expect(await readHeadFile(repo, 'logo.bin')).toEqual({ kind: 'binary' })
  })

  it('путь читается как есть: скобки - не шаблон, подпапка проекта - от себя', async () => {
    expect(await readHeadFile(repo, 'src/[id].tsx')).toEqual({
      kind: 'text',
      text: 'page\n',
      bom: false,
    })
    expect(await readHeadFile(join(repo, 'src'), 'app.ts')).toEqual({
      kind: 'text',
      text: 'one\n',
      bom: false,
    })
  })

  it('путь за корень проекта не читается', async () => {
    await expect(readHeadFile(join(repo, 'src'), '../web/page.ts')).rejects.toThrow()
  })

  it('имя в NFD в старом коммите находится по пути окна в NFC', async () => {
    const legacy = join(root, 'legacy')
    const nfd = 'заметки/мой.txt'.normalize('NFD')

    gitIn(root, 'init', '--initial-branch=main', legacy)
    gitIn(legacy, 'config', 'core.precomposeunicode', 'false')
    await write(nfd, 'старое\n', legacy)
    gitIn(legacy, 'add', '.')
    gitIn(legacy, 'commit', '-m', 'init')

    expect(await readHeadFile(legacy, 'заметки/мой.txt'.normalize('NFC'))).toEqual({
      kind: 'text',
      text: 'старое\n',
      bom: false,
    })
  })

  it('абсолютный путь окна читается как проверенный путь от папки проекта', async () => {
    const src = join(repo, 'src')

    expect(await readHeadFile(src, join(src, 'app.ts'))).toEqual({
      kind: 'text',
      text: 'one\n',
      bom: false,
    })
  })

  it('версия из HEAD - через фильтры git, как при checkout, и с меткой BOM', async () => {
    const filtered = join(root, 'filtered')

    gitIn(root, 'init', '--initial-branch=main', filtered)
    gitIn(filtered, 'config', 'filter.upper.smudge', 'tr a-z A-Z')
    gitIn(filtered, 'config', 'filter.upper.clean', 'tr A-Z a-z')
    await write('.gitattributes', '*.up filter=upper\n', filtered)
    await write('docs/note.up', 'hello\n', filtered)
    await write('bom.txt', Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]), filtered)
    gitIn(filtered, 'add', '.')
    gitIn(filtered, 'commit', '-m', 'init')

    expect(await readHeadFile(filtered, 'docs/note.up')).toEqual({
      kind: 'text',
      text: 'HELLO\n',
      bom: false,
    })
    expect(await readHeadFile(join(filtered, 'docs'), 'note.up')).toMatchObject({
      text: 'HELLO\n',
    })
    expect(await readHeadFile(filtered, 'bom.txt')).toEqual({ kind: 'text', text: 'hi', bom: true })
  })

  it('без различия регистра переименованный только регистром на диске - в регистре диска', async () => {
    const folded = join(root, 'folded')

    gitIn(root, 'init', '--initial-branch=main', folded)
    gitIn(folded, 'config', 'core.ignorecase', 'true')
    await write('Lib/Foo.ts', 'one\n', folded)
    gitIn(folded, 'add', '.')
    gitIn(folded, 'commit', '-m', 'init')
    await rename(join(folded, 'Lib/Foo.ts'), join(folded, 'Lib/foo.ts'))
    await write('Lib/foo.ts', 'two\n', folded)

    // Файловая система различает регистр (не macOS) - git увидит два файла, проверять нечего.
    if (!existsSync(join(folded, 'Lib/FOO.ts'))) return

    expect((await readGitChanges(folded))?.files).toEqual([
      { path: 'Lib/foo.ts', kind: 'modified', origin: null },
    ])
  })

  it('репозиторий без коммитов: в HEAD ничего нет, все файлы новые', async () => {
    const fresh = join(root, 'fresh')

    gitIn(root, 'init', '--initial-branch=main', fresh)
    await write('a.ts', 'a\n', fresh)

    expect(await readHeadFile(fresh, 'a.ts')).toEqual({ kind: 'missing' })
    expect((await readGitChanges(fresh))?.files).toEqual([
      { path: 'a.ts', kind: 'untracked', origin: null },
    ])
  })
})

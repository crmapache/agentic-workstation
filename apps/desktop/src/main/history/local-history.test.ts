import { execFileSync } from 'node:child_process'
import { rm, mkdir, rename, mkdtemp, symlink, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FeedPatch } from '@shared/claude-feed'
import { DAY_MS, MINUTE_MS, SECOND_MS } from '@shared/time-units'

import { FileOpsService } from '../fs/file-ops-service'
import { listProjectFiles } from '../search/project-files'
import { contentKey } from './content-key'
import { HISTORY_DB_NAME, HISTORY_DIR_NAME } from './history.constants'
import { LocalHistory } from './local-history'

/**
 * Локальная история на настоящем репозитории во временной папке: первая сверка, правки
 * извне, редактора и агента, удаление и возврат, переносы, срок хранения.
 */

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let base = ''
let repo = ''
let dataDir = ''
let clock = 0
let history: LocalHistory

const keyOf = (text: string) => contentKey(Buffer.from(text))

const put = async (path: string, text: string) => {
  await mkdir(join(repo, path, '..'), { recursive: true })
  await writeFile(join(repo, path), text)
}

const openHistory = async () => {
  history = await LocalHistory.open({
    dataDir,
    listFiles: listProjectFiles,
    onChange: () => undefined,
    now: () => clock,
    firstScanDelayMs: 0,
  })
  history.projectsChanged([repo])
  await history.idle(repo)
}

const changed = async (...paths: string[]) => {
  history.diskChanged(repo, paths)
  await history.idle(repo)
}

const entries = async (path: string) => (await history.list(repo, path)).entries

/** Что лежит в базе истории - мимо сервиса, чтобы видеть, что она хранит сама. */
const query = (sql: string, ...args: string[]) => {
  const db = new DatabaseSync(join(dataDir, HISTORY_DIR_NAME, HISTORY_DB_NAME))

  try {
    return db.prepare(sql).all(...args)
  } finally {
    db.close()
  }
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'local-history-'))
  repo = join(base, 'repo')
  dataDir = join(base, 'data')
  clock = Date.now()
  execFileSync('git', ['init', '-q', '--initial-branch=main', repo])
  await put('.gitignore', 'dist/\n.env\n')
  await put('src/app.ts', 'one\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-qm', 'init'], {
    cwd: repo,
    env: { ...process.env, ...IDENTITY },
  })
  await put('notes.md', 'draft\n')
  await put('.env', 'SECRET=1\n')
  await put('dist/out.js', 'built\n')
  await openHistory()
})

afterEach(async () => {
  await history.close()
  await rm(base, { recursive: true, force: true })
})

describe('локальная история', () => {
  it('первая сверка запоминает проект без игнорируемого и без копий закоммиченного', async () => {
    const tracked = query('SELECT path FROM files ORDER BY path').map((row) => row['path'])

    expect(tracked).toEqual(['.gitignore', 'notes.md', 'src/app.ts'])
    expect(await entries('')).toEqual([])
    // Закоммиченное отдаёт git, история хранит только новое.
    expect(query('SELECT key FROM blobs').map((row) => row['key'])).toEqual([keyOf('draft\n')])
  })

  it('правка извне - событие с прежней версией, её можно прочитать', async () => {
    await put('src/app.ts', 'two\n')
    await changed('src/app.ts')

    expect((await history.list(repo, 'src')).scope).toBe('folder')
    expect((await history.list(repo, 'src/app.ts')).scope).toBe('file')
    expect(await entries('src/app.ts')).toMatchObject([
      { cause: 'outside', previous: keyOf('one\n'), version: keyOf('two\n') },
    ])
    expect(await history.content(repo, keyOf('one\n'))).toEqual({ kind: 'text', text: 'one\n' })
    expect(await history.content(repo, keyOf('two\n'))).toEqual({ kind: 'text', text: 'two\n' })
  })

  it('сохранения редактора за минуту - одна версия; вернул как было - события нет', async () => {
    const save = async (text: string) => {
      history.expect(repo, 'notes.md', 'edit')
      await put('notes.md', text)
      await history.settle(repo, ['notes.md'])
    }

    await save('draft 2\n')
    clock += 10 * SECOND_MS
    await save('draft 3\n')

    expect(await entries('notes.md')).toMatchObject([
      { cause: 'edit', previous: keyOf('draft\n'), version: keyOf('draft 3\n') },
    ])

    clock += 10 * SECOND_MS
    await save('draft\n')

    expect(await entries('notes.md')).toEqual([])

    clock += 2 * MINUTE_MS
    await save('final\n')
    clock += 2 * MINUTE_MS
    await save('final 2\n')

    expect((await entries('notes.md')).map((entry) => entry.version)).toEqual([
      keyOf('final 2\n'),
      keyOf('final\n'),
    ])
  })

  it('правка агента - его причиной; игнорируемый .env запоминается до правки', async () => {
    const tool = (status: 'running' | 'done'): FeedPatch => ({
      conversationId: 'c1',
      upserts: [
        {
          id: 'tool-1',
          parentToolUseId: null,
          kind: 'tool',
          name: 'Write',
          input: { file_path: join(repo, '.env'), content: 'SECRET=2\n' },
          status,
          result: null,
          startedAt: clock,
          endedAt: status === 'done' ? clock : 0,
          closedReason: null,
        },
      ],
    })

    history.agentFeed(tool('running'))
    await history.idle(repo)
    await put('.env', 'SECRET=2\n')
    history.agentFeed(tool('done'))
    await changed('.env')

    expect(await entries('.env')).toMatchObject([{ cause: 'agent', previous: keyOf('SECRET=1\n') }])
    expect(await history.content(repo, keyOf('SECRET=1\n'))).toEqual({
      kind: 'text',
      text: 'SECRET=1\n',
    })
  })

  it('игнорируемое git, которое никто не открывал, истории не нужно', async () => {
    await put('dist/out.js', 'rebuilt\n')
    await put('dist/new/chunk.js', 'x\n')
    await changed('dist/out.js', 'dist/new')

    expect(await entries('dist')).toEqual([])
    expect(query('SELECT 1 FROM blobs WHERE key = ?', keyOf('rebuilt\n'))).toEqual([])
  })

  it('удалённый файл возвращается, а то, что было, остаётся в истории', async () => {
    await rm(join(repo, 'notes.md'))
    await changed('notes.md')

    const [deleted] = await entries('notes.md')

    expect(deleted).toMatchObject({ cause: 'deleted', version: keyOf('draft\n') })
    expect(await history.restore(repo, 'notes.md', deleted?.version ?? '')).toEqual({ ok: true })
    expect(await readFile(join(repo, 'notes.md'), 'utf8')).toBe('draft\n')
    expect((await entries('notes.md')).map((entry) => entry.cause)).toEqual(['restored', 'deleted'])
  })

  it('перенос в терминале и папкой целиком - история едет за файлом', async () => {
    await put('src/util.ts', 'util\n')
    await changed('src/util.ts')
    await mkdir(join(repo, 'lib'))
    await rename(join(repo, 'src/util.ts'), join(repo, 'lib/util.ts'))
    await changed('src/util.ts', 'lib/util.ts')

    expect((await entries('lib/util.ts')).map(({ cause, origin }) => [cause, origin])).toEqual([
      ['moved', 'src/util.ts'],
      ['created', null],
    ])

    await rename(join(repo, 'lib'), join(repo, 'pkg'))
    await changed('lib', 'pkg')

    expect((await entries('pkg/util.ts')).map(({ cause, origin }) => [cause, origin])).toEqual([
      ['moved', 'lib/util.ts'],
      ['moved', 'src/util.ts'],
      ['created', null],
    ])
  })

  it('перенос из дерева - в очереди истории; смена регистра переживает полную сверку', async () => {
    const outcome = await history.move(repo, 'src/app.ts', async () => {
      await rename(join(repo, 'src/app.ts'), join(repo, 'src/App.ts'))

      return { ok: true, path: 'src/App.ts' }
    })

    await changed('src/app.ts', 'src/App.ts')

    expect(outcome).toEqual({ ok: true, path: 'src/App.ts' })
    expect(await entries('src/App.ts')).toMatchObject([{ cause: 'moved', origin: 'src/app.ts' }])

    // Индекс git с core.ignorecase помнит «src/app.ts»: полная сверка не заводит второй файл.
    await history.close()
    await openHistory()
    history.diskChanged(repo, null)
    await history.idle(repo)

    expect(query('SELECT path FROM files WHERE path LIKE ?', 'src/%')).toEqual([
      { path: 'src/App.ts' },
    ])
    expect(await entries('src/app.ts')).toEqual([])
  })

  it('смена одного регистра в терминале - перенос, а не второй файл', async () => {
    await rename(join(repo, 'notes.md'), join(repo, 'NOTES.md'))
    await changed('notes.md', 'NOTES.md')

    expect(await entries('NOTES.md')).toMatchObject([{ cause: 'moved', origin: 'notes.md' }])
    expect(query('SELECT path FROM files WHERE path LIKE ?', '%otes.md')).toEqual([
      { path: 'NOTES.md' },
    ])
  })

  it('чужой или негодный ключ и путь за проектом не читаются и не пишутся', async () => {
    expect(await history.content(repo, 'f'.repeat(40))).toEqual({ kind: 'lost' })
    expect(await history.content(repo, '../etc')).toEqual({ kind: 'lost' })
    expect(await history.restore(repo, '../out.txt', keyOf('draft\n'))).toEqual({
      ok: false,
      code: 'failed',
    })
    expect((await history.list(repo, '../x')).entries).toEqual([])
  })

  it('правка агента раньше снимка: причина - агент, «до» - из точной правки CLI', async () => {
    const feed = (status: 'running' | 'done'): FeedPatch => ({
      conversationId: 'c1',
      upserts: [
        {
          id: 'tool-2',
          parentToolUseId: null,
          kind: 'tool',
          name: 'Edit',
          input: { file_path: join(repo, '.env') },
          status,
          result: null,
          startedAt: clock,
          endedAt: status === 'done' ? clock : 0,
          closedReason: null,
        },
      ],
    })

    // CLI с авто-принятием пишет раньше, чем IDE прочитала файл.
    await put('.env', 'SECRET=2\n')
    history.agentFeed(feed('running'))
    await changed('.env')
    history.agentEdited({
      path: join(repo, '.env'),
      edit: {
        kind: 'patch',
        hunks: [{ oldStart: 1, newStart: 1, lines: ['-SECRET=1', '+SECRET=2'] }],
      },
    })
    history.agentFeed(feed('done'))
    await history.idle(repo)

    expect(await entries('.env')).toMatchObject([
      { cause: 'agent', previous: keyOf('SECRET=1\n'), version: keyOf('SECRET=2\n') },
    ])
    expect(await history.content(repo, keyOf('SECRET=1\n'))).toEqual({
      kind: 'text',
      text: 'SECRET=1\n',
    })
  })

  it('возврат версии сначала запоминает непойманную правку и файл больше предела', async () => {
    await put('notes.md', 'unsaved by anyone\n')

    expect(await history.restore(repo, 'notes.md', keyOf('draft\n'))).toEqual({ ok: true })
    expect(await readFile(join(repo, 'notes.md'), 'utf8')).toBe('draft\n')
    expect(await history.content(repo, keyOf('unsaved by anyone\n'))).toEqual({
      kind: 'text',
      text: 'unsaved by anyone\n',
    })

    const big = `${'x'.repeat(6 * 1024 * 1024)}\n`

    await put('notes.md', big)
    await changed('notes.md')

    expect(await history.restore(repo, 'notes.md', keyOf('draft\n'))).toEqual({ ok: true })

    const [restored] = await entries('notes.md')

    expect(restored).toMatchObject({ cause: 'restored', previous: keyOf(big) })
  })

  it('сохранение через ссылку - правка настоящего файла, серией', async () => {
    await symlink('notes.md', join(repo, 'link.md'))

    const save = async (text: string) => {
      const tracked = await history.beforeWrite(repo, 'link.md', 'edit')

      await put('notes.md', text)
      await history.settle(repo, [tracked ?? ''], 'edit')
    }

    await save('one\n')
    clock += 10 * SECOND_MS
    await save('two\n')

    expect(await entries('notes.md')).toMatchObject([
      { cause: 'edit', previous: keyOf('draft\n'), version: keyOf('two\n') },
    ])
    expect(await entries('link.md')).toEqual([])
  })

  it('перенос и правка ссылок из дерева: у файла «moved», у правленых - «refactor»', async () => {
    const files = new FileOpsService({
      listFiles: listProjectFiles,
      trash: (absolute) => rm(absolute, { recursive: true }),
      history,
    })

    await put('src/main.ts', "import './app'\n")
    await changed('src/main.ts')
    await files.move(repo, { from: 'src/app.ts', to: 'src/core.ts' }, true)
    await history.idle(repo)

    expect((await entries('src/core.ts')).map((entry) => entry.cause)).toEqual(['moved'])
    expect((await entries('src/main.ts')).map((entry) => entry.cause)).toEqual([
      'refactor',
      'created',
    ])
  })

  it('правка извне перед возвратом - своим событием, а не «возвращена»', async () => {
    await put('notes.md', 'outside edit\n')
    await history.restore(repo, 'notes.md', keyOf('draft\n'))

    expect((await entries('notes.md')).map((entry) => entry.cause)).toEqual(['restored', 'outside'])
  })

  it('смена регистра у папки - перенос файлов, а не их копии', async () => {
    await rename(join(repo, 'src'), join(repo, 'Src'))
    await changed('src', 'Src')
    history.diskChanged(repo, null)
    await history.idle(repo)

    expect(query('SELECT path FROM files WHERE path LIKE ?', '%app.ts')).toEqual([
      { path: 'Src/app.ts' },
    ])
    expect((await entries('Src/app.ts')).map((entry) => entry.cause)).toEqual(['moved'])
  })

  it('до первой полной сверки старый файл - не новый', async () => {
    await history.close()
    await rm(dataDir, { recursive: true, force: true })
    history = await LocalHistory.open({
      dataDir,
      listFiles: listProjectFiles,
      onChange: () => undefined,
      now: () => clock,
      firstScanDelayMs: 60_000,
    })
    history.projectsChanged([repo])
    await put('src/app.ts', 'touched\n')
    await put('dist/out.js', 'rebuilt\n')
    history.diskChanged(repo, ['src/app.ts', 'dist/out.js'])
    await history.settle(repo, [])

    expect(await entries('')).toEqual([])
    // Игнорируемое git и до первой сверки не попадает в историю.
    expect(query('SELECT path FROM files WHERE path = ?', 'dist/out.js')).toEqual([])
  })

  it('папка без git: первая сверка копирует текст, а не двоичное', async () => {
    const plain = join(base, 'plain')

    await mkdir(plain)
    await writeFile(join(plain, 'note.txt'), 'hello\n')
    await writeFile(join(plain, 'photo.bin'), Buffer.from([0, 1, 2, 3, 0, 255]))
    history.projectsChanged([repo, plain])
    await history.idle(plain)

    expect(query('SELECT key FROM blobs WHERE key = ?', keyOf('hello\n'))).toHaveLength(1)
    expect(
      query('SELECT key FROM blobs WHERE key = ?', contentKey(Buffer.from([0, 1, 2, 3, 0, 255]))),
    ).toEqual([])
    expect(query('SELECT path FROM files WHERE path = ?', 'photo.bin')).toHaveLength(1)
  })

  it('событие старше месяца уходит, свежее и открытый проект остаются', async () => {
    await put('notes.md', 'old\n')
    await changed('notes.md')
    clock += 20 * DAY_MS
    await history.close()
    await openHistory()
    await put('notes.md', 'fresh\n')
    await changed('notes.md')
    clock += 11 * DAY_MS
    await history.close()
    await openHistory()

    expect((await entries('notes.md')).map((entry) => entry.version)).toEqual([keyOf('fresh\n')])
    expect(query('SELECT 1 FROM blobs WHERE key = ?', keyOf('draft\n'))).toEqual([])
  })

  it('месяц спустя закрытый проект уходит целиком', async () => {
    await put('notes.md', 'second\n')
    await changed('notes.md')
    await history.close()
    clock += 31 * DAY_MS
    await openHistory()

    expect(await entries('notes.md')).toEqual([])
    expect(query('SELECT 1 FROM blobs WHERE key = ?', keyOf('draft\n'))).toEqual([])
  })
})

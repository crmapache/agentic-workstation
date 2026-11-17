import { it, expect, describe } from 'vitest'

import { isIgnoredPath, GitStatusParser } from './git-status-output'

const HASH = 'a'.repeat(40)

/** Записи porcelain v2 в том виде, в каком их отдаёт git. */
const ordinary = (xy: string, path: string) =>
  `1 ${xy} N... 100644 100644 100644 ${HASH} ${HASH} ${path}`
const renamed = (xy: string, path: string) =>
  `2 ${xy} N... 100644 100644 100644 ${HASH} ${HASH} R100 ${path}`
const unmerged = (path: string) =>
  `u UU N... 100644 100644 100644 100644 ${HASH} ${HASH} ${HASH} ${path}`

const parse = (records: string[], prefix = '', limit = 100, ignoreCase = false) => {
  const parser = new GitStatusParser({ prefix, ignoreCase }, limit)

  for (const record of records) if (!parser.push(record)) break

  return parser.result()
}

describe('GitStatusParser', () => {
  it('изменённый, добавленный, конфликт - по буквам XY', () => {
    const status = parse([
      ordinary('.M', 'src/a.ts'),
      ordinary('M.', 'src/b.ts'),
      ordinary('A.', 'src/new.ts'),
      ordinary('AM', 'src/new-edited.ts'),
      ordinary('.A', 'src/intent.ts'),
      unmerged('src/both.ts'),
    ])

    expect(status.files).toEqual({
      'src/a.ts': 'modified',
      'src/b.ts': 'modified',
      'src/new.ts': 'added',
      'src/new-edited.ts': 'added',
      'src/intent.ts': 'added',
      'src/both.ts': 'conflict',
    })
  })

  it('репозиторий без регистра: ключи и префикс - в нижнем регистре', () => {
    const status = parse(
      [ordinary('.M', 'Apps/Web/Components/Button/index.ts'), '! apps/web/Dist/'],
      'apps/web/',
      100,
      true,
    )

    expect(status.files).toEqual({ 'components/button/index.ts': 'modified' })
    expect(status.folders).toEqual({ dist: 'ignored' })
    expect(status.ignoreCase).toBe(true)
  })

  it('пробелы в пути не ломают разбор', () => {
    expect(parse([ordinary('.M', 'my docs/a b.md')]).files).toEqual({
      'my docs/a b.md': 'modified',
    })
  })

  it('удалённого файла в дереве нет, но его папка изменена', () => {
    const status = parse([ordinary('.D', 'docs/old/gone.md')])

    expect(status.files).toEqual({})
    expect(status.changedFolders).toEqual({
      '': 'modified',
      docs: 'modified',
      'docs/old': 'modified',
    })
  })

  it('переименование: новый путь изменён, папка старого - тоже изменена', () => {
    const status = parse([renamed('R.', 'lib/new.ts'), 'old/place.ts'])

    expect(status.files).toEqual({ 'lib/new.ts': 'modified' })
    expect(status.changedFolders).toEqual({ '': 'modified', lib: 'modified', old: 'modified' })
  })

  it('новые и игнорируемые: файлы и папки целиком', () => {
    const status = parse(['? notes.txt', '? drafts/', '! node_modules/', '! .env'])

    expect(status.files).toEqual({ 'notes.txt': 'untracked', '.env': 'ignored' })
    expect(status.folders).toEqual({ drafts: 'untracked', node_modules: 'ignored' })
  })

  it('корень проекта - папка над всеми: удалённый файл в корне тоже его помечает', () => {
    expect(parse([ordinary('.D', 'README.md')]).changedFolders).toEqual({ '': 'modified' })
    expect(parse(['? notes.txt']).changedFolders).toEqual({ '': 'modified' })
  })

  it('конфликт в корне сильнее изменения, в любом порядке', () => {
    expect(parse([unmerged('a.ts'), ordinary('.M', 'b.ts')]).changedFolders).toEqual({
      '': 'conflict',
    })
    expect(parse([ordinary('.M', 'b.ts'), unmerged('a.ts')]).changedFolders).toEqual({
      '': 'conflict',
    })
  })

  it('игнорируемое не помечает папки над собой изменёнными', () => {
    expect(parse(['! apps/desktop/out/']).changedFolders).toEqual({})
  })

  it('конфликт в папке сильнее изменения, в любом порядке', () => {
    const status = parse([
      ordinary('.M', 'a/b/one.ts'),
      unmerged('a/b/two.ts'),
      ordinary('.M', 'a/b/three.ts'),
      ordinary('.M', 'a/c.ts'),
    ])

    expect(status.changedFolders).toEqual({ '': 'conflict', a: 'conflict', 'a/b': 'conflict' })
  })

  it('проект - подпапка репозитория: пути от корня проекта, чужие выпадают', () => {
    const status = parse(
      [ordinary('.M', 'apps/web/src/a.ts'), ordinary('.M', 'apps/api/b.ts'), '? apps/web/'],
      'apps/web/',
    )

    expect(status.files).toEqual({ 'src/a.ts': 'modified' })
    expect(status.folders).toEqual({ '': 'untracked' })
    expect(status.changedFolders).toEqual({ '': 'modified', src: 'modified' })
  })

  it('имена в NFD приходят в NFC, как в дереве', () => {
    const nfd = 'папка/файл'.normalize('NFD')

    expect(Object.keys(parse([`? ${nfd}`]).files)).toEqual(['папка/файл'.normalize('NFC')])
  })

  it('больше предела - разбор останавливается и статус обрезан', () => {
    const status = parse(['? a', '? b', '? c'], '', 2)

    expect(status.files).toEqual({ a: 'untracked', b: 'untracked' })
    expect(status.truncated).toBe(true)
  })

  it('имена вроде __proto__ и constructor - обычные ключи', () => {
    const { files } = parse(['? __proto__', '? constructor'])

    expect(Object.keys(files)).toEqual(['__proto__', 'constructor'])
    expect(files['__proto__']).toBe('untracked')
  })

  it('незнакомые записи пропускаются', () => {
    expect(parse(['# branch.oid abc', '', 'x what']).files).toEqual({})
  })
})

describe('isIgnoredPath', () => {
  const status = parse(['! out/', '! debug.log', '! apps/web/.next/', '? drafts/'])

  it('игнорируемый файл, папка и всё в ней', () => {
    expect(isIgnoredPath(status, 'debug.log')).toBe(true)
    expect(isIgnoredPath(status, 'out')).toBe(true)
    expect(isIgnoredPath(status, 'out/deep/bundle.js')).toBe(true)
    expect(isIgnoredPath(status, 'apps/web/.next/cache/x')).toBe(true)
  })

  it('без регистра - путь с диска в любом регистре', () => {
    const insensitive = parse(['! out/'], '', 100, true)

    expect(isIgnoredPath(insensitive, 'Out/Bundle.js')).toBe(true)
    expect(isIgnoredPath(status, 'Out/Bundle.js')).toBe(false)
  })

  it('похожее имя, новое и обычное - не игнорируется', () => {
    expect(isIgnoredPath(status, 'output/a.js')).toBe(false)
    expect(isIgnoredPath(status, 'drafts/idea.md')).toBe(false)
    expect(isIgnoredPath(status, 'apps/web/page.ts')).toBe(false)
    expect(isIgnoredPath(status, 'constructor')).toBe(false)
  })
})

import { execFileSync } from 'node:child_process'
import { rm, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { TEXT_QUERY_MAX_LENGTH } from '@shared/search'
import type { TextMatch, TextSearchResult } from '@shared/search'

import { readDirectory } from '../fs/directory-reader'
import { listProjectFiles } from './project-files'
import { SearchService } from './search-service'
import {
  TEXT_MATCHES_LIMIT,
  GREP_FIELD_MAX_BYTES,
  PREVIEW_WINDOW_CHARS,
  TEXT_MATCHES_PER_FILE_LIMIT,
} from './search.constants'
import { searchText } from './text-search'

// Настоящий git и настоящая файловая система во временной папке: проверяется, что
// видят поиск по имени и поиск текста в репозитории, в папке без git и на пределах.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

const LONG_LINE = `${'x'.repeat(5000)}NeEdLe${'y'.repeat(5000)}`

const MANY_LINES = Array.from({ length: 30 }, (_value, index) => `needle ${index}`).join('\n')

const BINARY = Buffer.from([0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65, 0x00, 0x01, 0x02])

// Каталог и файл с «й» в NFD (и + U+0306), как их пишет Finder. Окну - только NFC.
const NFD_FILE = 'и\u0306/фаи\u0306л.txt'
const NFC_FILE = 'й/файл.txt'

/** Файлы, одинаковые для репозитория и папки без git. */
const COMMON_FILES: Record<string, string | Buffer> = {
  'binary.bin': BINARY,
  'long.min.js': LONG_LINE,
  'many.txt': MANY_LINES,
  'ru.md': 'Привет, мир\n',
  [NFD_FILE]: 'decomposed name\n',
}

const sortedPaths = async (rootPath: string) => {
  const { paths, truncated } = await listProjectFiles(rootPath)

  return { paths: [...paths].sort(), truncated }
}

const filesOf = (result: TextSearchResult) => [
  ...new Set(result.matches.map((match) => match.relativePath)),
]

const highlighted = ({ preview, matchStart, matchLength }: TextMatch) =>
  preview.slice(matchStart, matchStart + matchLength)

describe('поиск по проекту', () => {
  let root = ''
  let repo = ''
  let plain = ''
  let outside = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } }).toString()

  const writeFiles = async (base: string, files: Record<string, string | Buffer>) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(base, path)), { recursive: true })
      await writeFile(join(base, path), content)
    }
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-search-'))
    repo = join(root, 'repo')
    plain = join(root, 'plain')
    outside = join(root, 'outside', 'credentials')

    // Чужой для проекта файл, на который ведут ссылки notes.txt (как ~/.aws/credentials).
    await writeFiles(root, { 'outside/credentials': 'needle secret token\n' })

    await mkdir(repo)
    gitIn(repo, 'init', '--initial-branch=main')
    // Без precomposeunicode git отдаёт имена как на диске (NFD) - приведение к NFC
    // проверяется на настоящем NFD, а не на том, что git уже привёл сам.
    gitIn(repo, 'config', 'core.precomposeunicode', 'false')
    await writeFiles(repo, {
      ...COMMON_FILES,
      '.gitignore': 'ignored.txt\nlogs/\n',
      'src/app.ts': 'const Needle = 1\n',
      'gone.ts': 'needle that will be deleted\n',
      'ignored.txt': 'needle in ignored\n',
      'logs/run.log': 'needle in log\n',
      'fresh.ts': 'export const NEEDLE = 2\n',
    })
    gitIn(repo, 'add', '.gitignore', 'src/app.ts', 'gone.ts', NFD_FILE)
    gitIn(repo, 'commit', '-m', 'init')
    await rm(join(repo, 'gone.ts'))
    await symlink(outside, join(repo, 'notes.txt'))

    await writeFiles(plain, {
      ...COMMON_FILES,
      'src/index.ts': 'needle here\n',
      '.github/workflows/ci.yml': 'needle in ci\n',
      'node_modules/pkg/index.js': 'needle in deps\n',
      'dist/out.js': 'needle built\n',
      '.DS_Store': 'needle',
    })
    await symlink(plain, join(plain, 'loop'))
    await symlink(join(plain, 'src', 'index.ts'), join(plain, 'link.ts'))
    await symlink(outside, join(plain, 'notes.txt'))
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  describe('репозиторий git', () => {
    it('файлы: отслеживаемые и новые; игнорируемые и удалённые с диска - нет', async () => {
      expect(await sortedPaths(repo)).toEqual({
        paths: [
          '.gitignore',
          'binary.bin',
          'fresh.ts',
          'long.min.js',
          'many.txt',
          'notes.txt',
          'ru.md',
          'src/app.ts',
          NFC_FILE,
        ],
        truncated: false,
      })
    })

    it('текст без учёта регистра; игнорируемое и двоичное не ищется', async () => {
      const result = await searchText(repo, 'needle')

      expect(filesOf(result).sort()).toEqual(['fresh.ts', 'long.min.js', 'many.txt', 'src/app.ts'])
      expect(result.truncated).toBe(false)
      expect(result.matches.find((match) => match.relativePath === 'src/app.ts')).toEqual({
        relativePath: 'src/app.ts',
        line: 1,
        preview: 'const Needle = 1',
        matchStart: 6,
        matchLength: 6,
      })
    })

    it('не больше предела на файл', async () => {
      const result = await searchText(repo, 'needle')
      const inMany = result.matches.filter((match) => match.relativePath === 'many.txt')

      expect(inMany).toHaveLength(TEXT_MATCHES_PER_FILE_LIMIT)
      expect(inMany.map((match) => match.line)).toEqual(
        Array.from({ length: TEXT_MATCHES_PER_FILE_LIMIT }, (_value, index) => index + 1),
      )
    })

    it('длинная строка обрезана окном, позиция указывает на совпадение', async () => {
      const result = await searchText(repo, 'needle')
      const long = result.matches.find((match) => match.relativePath === 'long.min.js')

      expect(long?.preview.length).toBeLessThanOrEqual(PREVIEW_WINDOW_CHARS + 2)
      expect(long && highlighted(long)).toBe('NeEdLe')
    })

    it('кириллица без учёта регистра', async () => {
      const result = await searchText(repo, 'ПРИВЕТ')

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0]).toMatchObject({ relativePath: 'ru.md', line: 1 })
      expect(result.matches[0] && highlighted(result.matches[0])).toBe('Привет')
    })

    it('проект - подпапка репозитория: пути от неё', async () => {
      expect(await sortedPaths(join(repo, 'src'))).toEqual({ paths: ['app.ts'], truncated: false })
      expect(filesOf(await searchText(join(repo, 'src'), 'needle'))).toEqual(['app.ts'])
    })

    it('ничего не нашлось - пустой ответ, не ошибка', async () => {
      expect(await searchText(repo, 'no such text anywhere')).toEqual({
        matches: [],
        truncated: false,
      })
    })
  })

  describe('папка без git', () => {
    it('файлы без зависимостей, сборок и мусора Finder; ссылка на каталог не раскрыта', async () => {
      expect(await sortedPaths(plain)).toEqual({
        paths: [
          '.github/workflows/ci.yml',
          'binary.bin',
          'link.ts',
          'long.min.js',
          'many.txt',
          'notes.txt',
          'ru.md',
          'src/index.ts',
          NFC_FILE,
        ],
        truncated: false,
      })
    })

    it('текст: те же правила - регистр, двоичное, предел на файл, длинная строка', async () => {
      const result = await searchText(plain, 'NEEDLE')

      // link.ts - ссылка на src/index.ts: как и git grep, по ссылкам текст не читаем.
      expect(filesOf(result).sort()).toEqual([
        '.github/workflows/ci.yml',
        'long.min.js',
        'many.txt',
        'src/index.ts',
      ])
      expect(result.matches.filter((match) => match.relativePath === 'many.txt')).toHaveLength(
        TEXT_MATCHES_PER_FILE_LIMIT,
      )

      const long = result.matches.find((match) => match.relativePath === 'long.min.js')

      expect(long && highlighted(long)).toBe('NeEdLe')
      expect(result.truncated).toBe(false)
    })

    it('кириллица без учёта регистра', async () => {
      const result = await searchText(plain, 'мИр')

      expect(result.matches.map((match) => [match.relativePath, highlighted(match)])).toEqual([
        ['ru.md', 'мир'],
      ])
    })

    it('папка внутри чужого репозитория, где она игнорируется, - обход самим', async () => {
      const outer = join(root, 'outer')

      await mkdir(join(outer, 'project'), { recursive: true })
      gitIn(outer, 'init', '--initial-branch=main')
      await writeFile(join(outer, '.gitignore'), '*\n')
      await writeFile(join(outer, 'project', 'a.txt'), 'needle\n')

      expect(await sortedPaths(join(outer, 'project'))).toEqual({
        paths: ['a.txt'],
        truncated: false,
      })
      expect(filesOf(await searchText(join(outer, 'project'), 'needle'))).toEqual(['a.txt'])
    })
  })

  describe.each([
    ['репозиторий git', () => repo],
    ['папка без git', () => plain],
  ])('%s: ссылки и имена в NFD', (_title, rootOf) => {
    it('ссылка на файл вне проекта: имя в списке есть, текст не читается', async () => {
      expect((await listProjectFiles(rootOf())).paths).toContain('notes.txt')
      expect(await searchText(rootOf(), 'secret token')).toEqual({
        matches: [],
        truncated: false,
      })
    })

    it('NFD-каталог: список, поиск и дерево отдают одну и ту же строку в NFC', async () => {
      const listed = (await listProjectFiles(rootOf())).paths.filter((path) =>
        path.endsWith('.txt'),
      )
      const found = filesOf(await searchText(rootOf(), 'decomposed'))
      const [folder] = (await readDirectory(rootOf(), '')).filter((entry) => entry.name === 'й')
      // Дерево раскрывает папку по NFC-пути из окна - APFS находит и NFD-имя.
      const inside = await readDirectory(rootOf(), folder?.relativePath ?? '')

      expect(listed).toContain(NFC_FILE)
      expect(listed).not.toContain(NFD_FILE)
      expect(found).toEqual([NFC_FILE])
      expect(folder).toMatchObject({ name: 'й', relativePath: 'й', kind: 'directory' })
      expect(inside.map((entry) => entry.relativePath)).toEqual([NFC_FILE])
    })
  })

  describe('пределы, запрос и отмена', () => {
    it('строка длиннее предела разбора: держится начало, совпадение дальше - без подсветки', async () => {
      const huge = join(root, 'huge')

      await mkdir(huge)
      gitIn(huge, 'init', '--initial-branch=main')
      await writeFiles(huge, {
        'far.map': `${'a'.repeat(GREP_FIELD_MAX_BYTES * 2)}needle\n`,
        'near.map': `needle${'b'.repeat(GREP_FIELD_MAX_BYTES * 2)}\n`,
      })

      const { matches } = await searchText(huge, 'needle')
      const far = matches.find((match) => match.relativePath === 'far.map')
      const near = matches.find((match) => match.relativePath === 'near.map')

      expect(far).toMatchObject({ line: 1, matchStart: 0, matchLength: 0 })
      expect(far?.preview).toBe(`${'a'.repeat(PREVIEW_WINDOW_CHARS)}…`)
      expect(near && highlighted(near)).toBe('needle')
      expect(near?.preview.endsWith('…')).toBe(true)
    })

    it('совпадений больше предела - ровно предел и truncated', async () => {
      const big = join(root, 'big')
      const fileCount = TEXT_MATCHES_LIMIT / TEXT_MATCHES_PER_FILE_LIMIT + 2

      await mkdir(big)
      gitIn(big, 'init', '--initial-branch=main')
      await writeFiles(
        big,
        Object.fromEntries(
          Array.from({ length: fileCount }, (_value, index) => [`f${index}.txt`, MANY_LINES]),
        ),
      )

      const result = await searchText(big, 'needle')

      expect(result.matches).toHaveLength(TEXT_MATCHES_LIMIT)
      expect(result.truncated).toBe(true)
    })

    it('пустой и слишком длинный запрос - ошибка; с переводом строки - пусто', async () => {
      await expect(searchText(repo, '')).rejects.toThrow('Пустой запрос')
      await expect(searchText(repo, 'x'.repeat(TEXT_QUERY_MAX_LENGTH + 1))).rejects.toThrow(
        'длиннее',
      )
      expect(await searchText(repo, 'needle\nother')).toEqual({ matches: [], truncated: false })
    })

    it('уже отменённый поиск - пустой и помечен неполным', async () => {
      const controller = new AbortController()

      controller.abort()

      expect(await searchText(repo, 'needle', controller.signal)).toEqual({
        matches: [],
        truncated: true,
      })
      expect(await searchText(plain, 'needle', controller.signal)).toEqual({
        matches: [],
        truncated: true,
      })
    })

    it('новый поиск отменяет предыдущий: тот отвечает тем, что успел', async () => {
      const service = new SearchService()
      const first = service.findText(repo, 'needle')
      const second = service.findText(repo, 'const')

      expect(await first).toMatchObject({ truncated: true })
      expect(await second).toMatchObject({ truncated: false })
      expect(filesOf(await second).sort()).toEqual(['fresh.ts', 'src/app.ts'])
    })
  })
})

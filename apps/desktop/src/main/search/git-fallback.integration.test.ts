import { execFileSync } from 'node:child_process'
import { rm, chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'

import { it, expect, afterAll, describe, afterEach, beforeAll } from 'vitest'

import type { TextSearchResult } from '@shared/search'

import { FALLBACK_FILE_MAX_BYTES, TEXT_MATCHES_PER_FILE_LIMIT } from './search.constants'
import { searchText } from './text-search'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

/** Как сломать git: переменная окружения, которую читает обёртка ниже. */
const FAKE_GIT_ENV = 'AGENTIC_WORKSTATION_FAKE_GIT'

/**
 * Обёртка вместо git в PATH. no-max-count - как git до 2.38: на --max-count код 129.
 * broken-grep - git grep падает всегда. Остальные команды идут в настоящий git.
 */
const wrapperScript = (realGit: string) => `#!/bin/sh
case "$${FAKE_GIT_ENV}" in
  no-max-count)
    for arg in "$@"; do
      case "$arg" in --max-count*) echo "error: unknown option" >&2; exit 129 ;; esac
    done ;;
  broken-grep)
    if [ "$1" = grep ]; then echo "fatal: index file corrupt" >&2; exit 128; fi ;;
esac
exec "${realGit}" "$@"
`

const filesOf = (result: TextSearchResult) =>
  [...new Set(result.matches.map((match) => match.relativePath))].sort()

// Старый или сломанный git в репозитории не должен уводить поиск в обход диска:
// тот не знает .gitignore и показал бы .env и логи.
describe('поиск текста, когда git grep не справился', () => {
  let root = ''
  let repo = ''
  const originalPath = process.env['PATH'] ?? ''

  const useFakeGit = (mode: string) => {
    process.env['PATH'] = `${join(root, 'bin')}${delimiter}${originalPath}`
    process.env[FAKE_GIT_ENV] = mode
  }

  beforeAll(async () => {
    const gitIn = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } })
    const realGit = execFileSync('/bin/sh', ['-c', 'command -v git']).toString().trim()

    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-git-fallback-'))
    repo = join(root, 'repo')
    await mkdir(join(root, 'bin'))
    await writeFile(join(root, 'bin', 'git'), wrapperScript(realGit))
    await chmod(join(root, 'bin', 'git'), 0o755)

    await mkdir(join(repo, 'logs'), { recursive: true })
    gitIn(repo, 'init', '--initial-branch=main')
    await writeFile(join(repo, '.gitignore'), '.env\nlogs/\n')
    await writeFile(join(repo, '.env'), 'TOKEN=needle-secret\n')
    await writeFile(join(repo, 'logs', 'run.log'), 'needle in log\n')
    await writeFile(join(repo, 'app.ts'), 'const needle = 1\n')
    await writeFile(join(repo, 'many.txt'), Array(30).fill('needle').join('\n'))
    // Крупнее предела чтения без git: его найдёт только git grep. По нему видно,
    // каким путём пришёл ответ - повтором git grep или чтением по списку ls-files.
    await writeFile(join(repo, 'bundle.js'), `needle\n${'x'.repeat(FALLBACK_FILE_MAX_BYTES)}`)
    gitIn(repo, 'add', '.')
    gitIn(repo, 'commit', '-m', 'init')
    await writeFile(join(repo, 'fresh.ts'), 'export const NEEDLE = 2\n')
  })

  afterEach(() => {
    process.env['PATH'] = originalPath
    delete process.env[FAKE_GIT_ENV]
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it.each([
    [
      'no-max-count',
      'повтор git grep без --max-count',
      ['app.ts', 'bundle.js', 'fresh.ts', 'many.txt'],
    ],
    ['broken-grep', 'чтение по списку git ls-files', ['app.ts', 'fresh.ts', 'many.txt']],
  ])('%s: %s - игнорируемое не ищется, предел на файл держится', async (mode, _how, expected) => {
    useFakeGit(mode)

    const result = await searchText(repo, 'needle')

    expect(filesOf(result)).toEqual(expected)
    expect(result.matches.filter((match) => match.relativePath === 'many.txt')).toHaveLength(
      TEXT_MATCHES_PER_FILE_LIMIT,
    )
    expect(result.truncated).toBe(false)
  })

  it('обёртка и правда подменяет git', () => {
    useFakeGit('broken-grep')

    expect(() => execFileSync('git', ['grep', 'needle'], { cwd: repo, stdio: 'ignore' })).toThrow()
  })
})

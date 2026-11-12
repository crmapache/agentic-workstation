import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, mkdtemp, symlink, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import {
  removeIfEmpty,
  WorktreeError,
  worktreeState,
  createWorktree,
  removeWorktree,
  worktreeFolderFor,
} from './git-worktree'
import type { CreatedWorktree } from './git-worktree'

// Настоящий git во временной папке: поведение worktree, игнора и удаления веток
// проверяется на живом git, а не на придуманных ответах.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

/** Код отказа или 'resolved' - чтобы тест падал с понятным сообщением. */
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof WorktreeError ? error.code : String(error)),
  )

describe('git worktree', () => {
  let base = ''
  let project = ''
  let root = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY } })
      .toString()
      .trim()

  const write = async (cwd: string, file: string, text: string) => {
    await mkdir(dirname(join(cwd, file)), { recursive: true })
    await writeFile(join(cwd, file), text)
  }

  const commit = async (cwd: string, file: string, text: string) => {
    await write(cwd, file, text)
    gitIn(cwd, 'add', '--', file)
    gitIn(cwd, 'commit', '-m', text)
  }

  const scenarioBranches = () =>
    gitIn(project, 'branch', '--list', 'scenarios/*', '--format=%(refname:short)')
      .split('\n')
      .filter((line) => line.length > 0)

  const registered = () => gitIn(project, 'worktree', 'list', '--porcelain')

  const create = (slug: string) => createWorktree({ projectPath: project, slug, root })

  const removal = (made: CreatedWorktree) => ({
    projectPath: project,
    path: made.path,
    gitBranch: made.gitBranch,
    root,
  })

  beforeEach(async () => {
    // Без ссылок в пути (/var → /private/var): так worktree видит и сам git.
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-worktree-')))
    // Пробел в имени проекта: в пути worktree его быть не должно.
    project = join(base, 'my project')
    root = join(base, 'worktrees')
    await mkdir(project)
    gitIn(project, 'init', '--initial-branch=main')
    await commit(project, 'a.txt', 'one\n')
  })

  afterEach(() => rm(base, { recursive: true, force: true }))

  it('создаёт worktree на новой ветке от HEAD, путь без пробелов', async () => {
    const head = gitIn(project, 'rev-parse', 'HEAD')
    const made = await create('fix-login')

    expect(made).toEqual({
      path: worktreeFolderFor(project, 'fix-login', root),
      projectDir: made.path,
      gitBranch: 'scenarios/fix-login',
      baseCommit: head,
    })
    expect(made.path.startsWith(root)).toBe(true)
    expect(made.path).not.toContain(' ')
    expect(gitIn(made.path, 'rev-parse', 'HEAD')).toBe(head)
    expect(gitIn(made.path, 'symbolic-ref', '--short', 'HEAD')).toBe('scenarios/fix-login')
    expect(await readFile(join(made.path, 'a.txt'), 'utf8')).toBe('one\n')
  })

  it('занятое имя - следующий номер: по ветке и по папке', async () => {
    expect((await create('task')).gitBranch).toBe('scenarios/task')
    expect((await create('task')).gitBranch).toBe('scenarios/task-2')

    await mkdir(worktreeFolderFor(project, 'task-3', root), { recursive: true })

    const fourth = await create('task')

    expect(fourth.gitBranch).toBe('scenarios/task-4')
    expect(fourth.path).toBe(worktreeFolderFor(project, 'task-4', root))
  })

  it('два создания разом с одним slug - разные имена: очередь записи', async () => {
    const made = await Promise.all([create('race'), create('race')])

    expect(made.map(({ gitBranch }) => gitBranch).sort()).toEqual([
      'scenarios/race',
      'scenarios/race-2',
    ])
  })

  it('плохой slug - отказ до git, ничего не создано', async () => {
    for (const slug of ['Upper', '-x', '../x', 'a b', '', `a${'b'.repeat(51)}`]) {
      expect(await codeOf(create(slug))).toBe('failed')
    }

    expect(existsSync(root)).toBe(false)
    expect(scenarioBranches()).toEqual([])
  })

  it('не репозиторий, нет папки, нет коммитов - свои коды, ничего не создано', async () => {
    const plain = join(base, 'plain')
    const empty = join(base, 'empty')

    await mkdir(plain)
    await mkdir(empty)
    gitIn(empty, 'init')

    const codes = await Promise.all(
      [plain, join(base, 'nope'), empty].map((projectPath) =>
        codeOf(createWorktree({ projectPath, slug: 'x', root })),
      ),
    )

    expect(codes).toEqual(['not-a-repo', 'missing', 'no-commits'])
    expect(existsSync(root)).toBe(false)
  })

  it('проект - подпапка репозитория: projectDir внутри worktree', async () => {
    await commit(project, 'packages/app/index.ts', 'app\n')

    const made = await createWorktree({
      projectPath: join(project, 'packages', 'app'),
      slug: 'sub',
      root,
    })

    expect(made.projectDir).toBe(join(made.path, 'packages', 'app'))
    expect(await readFile(join(made.projectDir, 'index.ts'), 'utf8')).toBe('app\n')
  })

  it('подпапки проекта нет в коммите - отказ, ни папки, ни ветки, ни записи', async () => {
    const fresh = join(project, 'fresh')

    await write(fresh, 'note.txt', 'not committed\n')

    expect(await codeOf(createWorktree({ projectPath: fresh, slug: 'sub', root }))).toBe('failed')
    expect(existsSync(worktreeFolderFor(fresh, 'sub', root))).toBe(false)
    expect(existsSync(dirname(worktreeFolderFor(fresh, 'sub', root)))).toBe(false)
    expect(scenarioBranches()).toEqual([])
    expect(registered()).not.toContain(root)
  })

  it('.worktreeinclude: копирует игнорируемые совпавшие файлы, и только их', async () => {
    await commit(project, '.gitignore', '.env\n.env.*\nsecret.txt\n')
    await commit(project, 'config/app.json', 'committed\n')
    await commit(project, '.worktreeinclude', '.env\n.env.*\nconfig/*.json\n')
    // Совпали и игнорируются - копируются, вложенный - со своим путём.
    await write(project, '.env', 'TOKEN=1\n')
    await write(project, '.env.local', 'LOCAL=1\n')
    await write(project, 'services/api/.env', 'API=1\n')
    // Игнорируется, но не совпал; совпал, но не игнорируется; отслеживаемый с правкой.
    await write(project, 'secret.txt', 'no\n')
    await write(project, 'config/new.json', 'new\n')
    await write(project, 'config/app.json', 'edited\n')
    // Совпал и игнорируется, но это ссылка, а не файл.
    await symlink('.env', join(project, '.env.link'))

    const made = await create('include')
    const read = (file: string) => readFile(join(made.path, file), 'utf8')

    expect(await read('.env')).toBe('TOKEN=1\n')
    expect(await read('.env.local')).toBe('LOCAL=1\n')
    expect(await read('services/api/.env')).toBe('API=1\n')
    expect(existsSync(join(made.path, 'secret.txt'))).toBe(false)
    expect(existsSync(join(made.path, 'config/new.json'))).toBe(false)
    expect(existsSync(join(made.path, '.env.link'))).toBe(false)
    expect(await read('config/app.json')).toBe('committed\n')
    // Скопированное игнорируется - worktree остаётся чистым.
    expect((await worktreeState(made.path, made.baseCommit)).dirty).toBe(false)
  })

  it('без .worktreeinclude игнорируемое не копируется', async () => {
    await commit(project, '.gitignore', '.env\n')
    await write(project, '.env', 'TOKEN=1\n')

    const made = await create('plain')

    expect(existsSync(join(made.path, '.env'))).toBe(false)
  })

  it('состояние: правка - dirty, коммит - commitsAhead, нет папки - пусто', async () => {
    const made = await create('state')
    const state = () => worktreeState(made.path, made.baseCommit)

    expect(await state()).toEqual({ exists: true, dirty: false, commitsAhead: 0 })

    await write(made.path, 'b.txt', 'two\n')

    expect(await state()).toEqual({ exists: true, dirty: true, commitsAhead: 0 })

    gitIn(made.path, 'add', 'b.txt')
    gitIn(made.path, 'commit', '-m', 'two')

    expect(await state()).toEqual({ exists: true, dirty: false, commitsAhead: 1 })
    expect(await worktreeState(join(root, 'gone'), made.baseCommit)).toEqual({
      exists: false,
      dirty: false,
      commitsAhead: 0,
    })
    expect(await codeOf(worktreeState(made.path, '--all'))).toBe('failed')
  })

  it('удаление чистого: игнорируемое не мешает, ветка остаётся, пустая папка проекта уходит', async () => {
    await commit(project, '.gitignore', 'node_modules/\n')

    const made = await create('clean')

    await write(made.path, 'node_modules/pkg/index.js', 'installed\n')

    const result = await removeWorktree({ ...removal(made), force: false, deleteBranch: 'never' })

    expect(result).toEqual({ branchDeleted: false })
    expect(existsSync(made.path)).toBe(false)
    expect(existsSync(dirname(made.path))).toBe(false)
    expect(registered()).not.toContain(made.path)
    expect(scenarioBranches()).toEqual(['scenarios/clean'])
  })

  it('несохранённое без force - отказ dirty, всё на месте; с force - удаляется', async () => {
    const made = await create('dirty')

    await write(made.path, 'work.txt', 'unsaved\n')

    const options = { ...removal(made), deleteBranch: 'always' as const }

    expect(await codeOf(removeWorktree({ ...options, force: false }))).toBe('dirty')
    expect(await readFile(join(made.path, 'work.txt'), 'utf8')).toBe('unsaved\n')
    expect(scenarioBranches()).toEqual(['scenarios/dirty'])

    expect(await removeWorktree({ ...options, force: true })).toEqual({ branchDeleted: true })
    expect(existsSync(made.path)).toBe(false)
    expect(scenarioBranches()).toEqual([])
  })

  it("'if-merged': неслитая ветка остаётся, слитая удаляется", async () => {
    const kept = await create('kept')
    const merged = await create('merged')

    await commit(kept.path, 'b.txt', 'two\n')

    const ifMerged = { force: false, deleteBranch: 'if-merged' as const }

    expect(await removeWorktree({ ...removal(kept), ...ifMerged })).toEqual({
      branchDeleted: false,
    })
    expect(await removeWorktree({ ...removal(merged), ...ifMerged })).toEqual({
      branchDeleted: true,
    })
    expect(existsSync(kept.path)).toBe(false)
    expect(scenarioBranches()).toEqual(['scenarios/kept'])
  })

  it('папки уже нет - запись убирается, ветка удаляется, без отказа', async () => {
    const made = await create('gone')

    await rm(made.path, { recursive: true, force: true })

    const result = await removeWorktree({ ...removal(made), force: false, deleteBranch: 'always' })

    expect(result).toEqual({ branchDeleted: true })
    expect(registered()).not.toContain(made.path)
    expect(scenarioBranches()).toEqual([])
  })

  it('чужая ветка вместо ветки сценария - отказ до git', async () => {
    const made = await create('own')
    const options = { ...removal(made), gitBranch: 'main', force: true }

    expect(await codeOf(removeWorktree({ ...options, deleteBranch: 'always' }))).toBe('failed')
    expect(existsSync(made.path)).toBe(true)
    expect(gitIn(project, 'branch', '--list', 'main')).toContain('main')
  })

  it('removeIfEmpty: нетронутый уходит вместе с веткой', async () => {
    const made = await create('idle')

    expect(await removeIfEmpty({ ...removal(made), baseCommit: made.baseCommit })).toBe(true)
    expect(existsSync(made.path)).toBe(false)
    expect(scenarioBranches()).toEqual([])
  })

  it('removeIfEmpty: коммит, правка или коммит в ветке при другом HEAD - ничего не трогает', async () => {
    const worked = await create('worked')
    const edited = await create('edited')
    const switched = await create('switched')

    await commit(worked.path, 'b.txt', 'two\n')
    await write(edited.path, 'b.txt', 'unsaved\n')
    // Агент закоммитил в ветку и увёл HEAD worktree с неё: по HEAD работы не видно.
    await commit(switched.path, 'c.txt', 'three\n')
    gitIn(switched.path, 'switch', '--quiet', '--detach', switched.baseCommit)

    for (const made of [worked, edited, switched]) {
      expect(await removeIfEmpty({ ...removal(made), baseCommit: made.baseCommit })).toBe(false)
      expect(existsSync(made.path)).toBe(true)
    }

    expect(scenarioBranches()).toEqual([
      'scenarios/edited',
      'scenarios/switched',
      'scenarios/worked',
    ])
  })
})

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { worktreeState, createWorktree, removeWorktree } from './git-worktree'

// Ссылки worktree на настоящем git: что git считает игнорируемым и что снимает
// удаление worktree, проверяется на нём самом, а не на придуманных ответах.
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

describe('git worktree: ссылки на общие файлы', () => {
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

  const isLink = async (path: string) => (await lstat(path)).isSymbolicLink()

  const create = (slug: string, projectPath = project) =>
    createWorktree({ projectPath, slug, root })

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-links-')))
    project = join(base, 'project')
    root = join(base, 'worktrees')
    await mkdir(project)
    gitIn(project, 'init', '--initial-branch=main')
    await commit(project, 'a.txt', 'one\n')
  })

  afterEach(() => rm(base, { recursive: true, force: true }))

  it('без списка: локальные файлы Claude Code - ссылки, правка из worktree видна в проекте', async () => {
    await commit(project, '.gitignore', 'CLAUDE.local.md\n.claude/settings.local.json\n')
    await write(project, 'CLAUDE.local.md', 'rules\n')
    await write(project, '.claude/settings.local.json', '{}\n')

    const made = await create('claude')

    expect(await isLink(join(made.path, 'CLAUDE.local.md'))).toBe(true)
    expect(await isLink(join(made.path, '.claude/settings.local.json'))).toBe(true)

    await writeFile(join(made.path, 'CLAUDE.local.md'), 'rules, edited in the worktree\n')

    expect(await readFile(join(project, 'CLAUDE.local.md'), 'utf8')).toBe(
      'rules, edited in the worktree\n',
    )
    expect((await worktreeState(made.path, made.baseCommit)).dirty).toBe(false)
  })

  it('список: папка и файл - ссылки, новый файл в папке из worktree ложится в проект', async () => {
    await commit(project, '.gitignore', 'journal\nlocal.sh\n')
    await write(project, '.worktreelink', '# общее\njournal/\nlocal.sh\n')
    await write(project, 'journal/a.md', 'entry\n')
    await write(project, 'local.sh', 'echo hook\n')

    const made = await create('listed')

    expect(await isLink(join(made.path, 'journal'))).toBe(true)
    expect(await isLink(join(made.path, 'local.sh'))).toBe(true)

    await writeFile(join(made.path, 'journal/b.md'), 'written by the run\n')

    expect(await readFile(join(project, 'journal/b.md'), 'utf8')).toBe('written by the run\n')
    expect((await worktreeState(made.path, made.baseCommit)).dirty).toBe(false)
  })

  it('не связывает то, что git не игнорирует как ссылку, отслеживаемое, чего нет и что снаружи', async () => {
    // `folder/` со слэшем видит папку, но не ссылку: ссылка стала бы новым файлом.
    await commit(project, '.gitignore', 'folder/\n')
    await commit(project, 'tracked.md', 'committed\n')
    await write(project, '.worktreelink', 'folder\ntracked.md\nmissing.md\n../outside.md\n')
    await write(project, 'folder/a.md', 'entry\n')
    await write(project, 'tracked.md', 'edited\n')

    const made = await create('refused')

    expect(existsSync(join(made.path, 'folder'))).toBe(false)
    expect(await isLink(join(made.path, 'tracked.md'))).toBe(false)
    expect(await readFile(join(made.path, 'tracked.md'), 'utf8')).toBe('committed\n')
    expect(existsSync(join(made.path, 'missing.md'))).toBe(false)
    expect((await worktreeState(made.path, made.baseCommit)).dirty).toBe(false)
  })

  it('путь в .worktreeinclude и в .worktreelink - ссылка, а не копия', async () => {
    await commit(project, '.gitignore', 'notes.md\n')
    await write(project, '.worktreeinclude', 'notes.md\n')
    await write(project, '.worktreelink', 'notes.md\n')
    await write(project, 'notes.md', 'shared\n')

    const made = await create('both')

    expect(await isLink(join(made.path, 'notes.md'))).toBe(true)
  })

  it('папка и файл в ней в одном списке: связана папка, файл в проекте цел', async () => {
    await commit(project, '.gitignore', 'journal\n')
    await write(project, '.worktreelink', 'journal\njournal/a.md\n')
    await write(project, 'journal/a.md', 'entry\n')

    const made = await create('nested-list')

    expect(await isLink(join(made.path, 'journal'))).toBe(true)
    expect(await isLink(join(project, 'journal/a.md'))).toBe(false)
    expect(await readFile(join(project, 'journal/a.md'), 'utf8')).toBe('entry\n')
  })

  it('удаление worktree, обычное и с force, снимает ссылки и не трогает проект', async () => {
    await commit(project, '.gitignore', 'journal\nCLAUDE.local.md\n')
    await write(project, '.worktreelink', 'journal\n')
    await write(project, 'journal/a.md', 'entry\n')
    await write(project, 'CLAUDE.local.md', 'rules\n')

    const clean = await create('clean')
    const forced = await create('forced')

    await write(forced.path, 'work.txt', 'unsaved\n')

    const removal = { projectPath: project, root, deleteBranch: 'always' as const }

    await removeWorktree({ ...removal, path: clean.path, gitBranch: clean.gitBranch, force: false })
    await removeWorktree({
      ...removal,
      path: forced.path,
      gitBranch: forced.gitBranch,
      force: true,
    })

    expect(existsSync(clean.path)).toBe(false)
    expect(existsSync(forced.path)).toBe(false)
    expect(await readFile(join(project, 'journal/a.md'), 'utf8')).toBe('entry\n')
    expect(await readFile(join(project, 'CLAUDE.local.md'), 'utf8')).toBe('rules\n')
  })

  it('проект - подпапка: CLAUDE.local.md подпапки и корня, настройки подпапки', async () => {
    await commit(project, '.gitignore', 'CLAUDE.local.md\nsettings.local.json\n')
    await commit(project, 'packages/app/index.ts', 'app\n')
    await write(project, 'CLAUDE.local.md', 'root rules\n')
    await write(project, 'packages/app/CLAUDE.local.md', 'app rules\n')
    await write(project, 'packages/app/.claude/settings.local.json', '{}\n')

    const made = await create('nested', join(project, 'packages/app'))

    expect(await isLink(join(made.path, 'CLAUDE.local.md'))).toBe(true)
    expect(await isLink(join(made.projectDir, 'CLAUDE.local.md'))).toBe(true)
    expect(await isLink(join(made.projectDir, '.claude/settings.local.json'))).toBe(true)
  })
})

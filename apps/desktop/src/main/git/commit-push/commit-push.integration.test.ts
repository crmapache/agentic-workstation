import { execFileSync } from 'node:child_process'
import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { AiChoice } from '@shared/ide-prefs'
import type { ProviderId } from '@shared/providers'

import type { AskProvider } from '../../providers/ask-provider'
import { commitAndPush, CommitPushDesk } from './commit-push'

// Настоящий git во временной папке, «удалённый» - bare рядом; ИИ - подделка, которая помнит,
// кого и о чём спросили.
describe('Commit and push', () => {
  let root = ''
  let origin = ''
  let repo = ''

  const gitIn = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd }).toString().trim()

  const chain: AiChoice[] = [
    { provider: 'codex', model: '', effort: 'low' },
    { provider: 'claude', model: '', effort: '' },
  ]

  const host = (answers: Partial<Record<ProviderId, unknown>>, asked: string[] = []) => {
    const ask: AskProvider = (provider, question) => {
      asked.push(`${provider}:${question.model}:${question.effort}`)

      const output = answers[provider]

      return Promise.resolve(
        output === undefined ? { error: 'limit reached' } : { text: '', output },
      )
    }

    return { ask, chain: () => chain, dataDir: join(root, 'data') }
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-commit-'))
    origin = join(root, 'origin.git')
    repo = join(root, 'repo')
    gitIn(root, 'init', '--bare', '--initial-branch=main', origin)
    gitIn(root, 'clone', origin, repo)
    gitIn(repo, 'config', 'user.name', 'Test')
    gitIn(repo, 'config', 'user.email', 'test@example.com')
    await writeFile(join(repo, 'a.txt'), 'one\n')
    gitIn(repo, 'add', '.')
    gitIn(repo, 'commit', '-m', 'feat: first')
  })

  afterAll(() => rm(root, { recursive: true, force: true }))

  it('коммитить нечего - ИИ не спрашивают', async () => {
    const asked: string[] = []

    expect(await commitAndPush(host({}, asked), repo)).toMatchObject({
      outcome: 'failed',
      stage: 'nothing',
    })
    expect(asked).toEqual([])
  })

  it('никто не написал сообщение - индекс человека не тронут, коммита нет', async () => {
    await writeFile(join(repo, 'a.txt'), 'two\n')
    await writeFile(join(repo, 'staged.txt'), 'staged\n')
    gitIn(repo, 'add', 'staged.txt')
    await writeFile(join(repo, 'new.txt'), 'new\n')

    const result = await commitAndPush(host({}), repo)

    expect(result).toMatchObject({ outcome: 'failed', stage: 'message' })
    expect(gitIn(repo, 'diff', '--cached', '--name-only')).toBe('staged.txt')
    expect(gitIn(repo, 'log', '--format=%s')).toBe('feat: first')
  })

  it('первый провайдер отказал - пишет запасной; уходит всё, включая новые файлы', async () => {
    const asked: string[] = []
    const result = await commitAndPush(
      host({ claude: { subject: 'feat: add new file', body: 'Why it matters.' } }, asked),
      repo,
    )

    expect(asked).toEqual(['codex::low', 'claude:haiku:'])
    expect(result).toMatchObject({
      outcome: 'pushed',
      by: 'claude',
      message: 'feat: add new file\n\nWhy it matters.',
    })
    expect(gitIn(repo, 'status', '--porcelain')).toBe('')
    expect(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([
      'a.txt',
      'new.txt',
      'staged.txt',
    ])
    expect(gitIn(origin, 'log', '-1', '--format=%B', 'main')).toBe(
      'feat: add new file\n\nWhy it matters.',
    )
  })

  it('второе нажатие, пока идёт первое, получает тот же итог', async () => {
    await writeFile(join(repo, 'a.txt'), 'three\n')

    const desk = new CommitPushDesk(host({ codex: { subject: 'fix: three', body: '' } }))
    const [first, second] = await Promise.all([desk.run(repo), desk.run(repo)])

    expect(first).toBe(second)
    expect(gitIn(repo, 'log', '--format=%s')).toBe('fix: three\nfeat: add new file\nfeat: first')
  })

  it('не на ветке - отказ до ИИ', async () => {
    gitIn(repo, 'checkout', '--detach')
    await writeFile(join(repo, 'a.txt'), 'four\n')

    expect(await commitAndPush(host({}), repo)).toMatchObject({
      outcome: 'failed',
      stage: 'detached',
    })
    gitIn(repo, 'checkout', '-f', 'main')
  })
})

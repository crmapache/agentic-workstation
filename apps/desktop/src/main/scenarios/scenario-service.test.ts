import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ScenarioQueue } from '@shared/scenario-queues'
import type { Scenario } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import { ScenarioService } from './scenario-service'
import type { FakeScript } from './engine/__fixtures__/fake-cli'
import { FakeCli } from './engine/__fixtures__/fake-cli'

/** Голова, которая всё одобряет; карточка, которая всё делает. */
const head: FakeScript = (said) => {
  if (said.includes('# The run you are the main thread of'))
    return { kind: 'say', text: '```json\n{"ready": true}\n```' }
  if (said.includes('# Card')) return { kind: 'say', text: '{"slots": {}}' }
  if (said.startsWith('The card’s turn'))
    return { kind: 'say', text: '{"done": true, "reason": "ok", "handoff": ""}' }

  return { kind: 'say', text: '{}' }
}
const card: FakeScript = () => ({ kind: 'say', text: 'Done the work.' })

const scenario = (id: string): Scenario => ({
  version: 1,
  id,
  name: `Scenario ${id}`,
  createdAt: 1,
  updatedAt: 1,
  inputs: [],
  head: {
    briefing: '',
    model: '',
    effort: '',
    permissionMode: 'acceptEdits',
    onQuestion: 'head',
    retries: 1,
    onGiveUp: 'stop',
  },
  stages: [
    {
      id: 'st',
      title: 'Stage',
      repeat: 1,
      untilDone: false,
      cards: [
        {
          id: 'c',
          title: 'Card',
          prompt: 'Do it.',
          slots: [],
          dod: 'done',
          after: '',
          model: '',
          effort: '',
          permissionMode: '',
        },
      ],
    },
  ],
  scope: 'project',
})

const provider = (fakes: FakeCli[], titles: string[]): ScenarioProvider => ({
  id: 'claude',
  prepare: () => Promise.resolve(null),
  spawn: (spec, _place, wires) => {
    const fake = new FakeCli(
      spec,
      wires,
      spec.briefing.includes('main thread of a scenario') ? head : card,
    )

    fakes.push(fake)

    return fake
  },
  transcriptDirs: () => Promise.resolve([]),
  defaults: () => ({ model: '', effort: '' }),
  accounts: {
    current: () => '',
    label: () => '',
    candidates: () => [
      { id: '', refusedUntil: null, fullest: null, twinOfHere: false, runs: null },
    ],
    same: (left, right) => left === right,
    noteRefused: () => undefined,
  },
  suggestTitle: (description) => {
    titles.push(description)

    return Promise.resolve('Named by AI')
  },
  draft: () => Promise.resolve({ ok: false, error: 'no', cancelled: false }),
  cancelDraft: () => undefined,
  openChat: () => Promise.resolve(true),
})

/** Подождать, пока условие станет правдой: движок и запись на диск идут своими тактами. */
const until = async (check: () => boolean, ms = 4000) => {
  const deadline = Date.now() + ms

  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting')

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

let dir = ''
let project = ''
let service: ScenarioService | null = null
let fakes: FakeCli[] = []
let titles: string[] = []
let notes: string[] = []

const start = (
  scenarioId: string,
  target: { kind: 'new'; worktree: boolean } | { kind: 'queue'; queueId: string },
) =>
  (service as ScenarioService).start({
    projectPath: project,
    scenarioId,
    scope: 'project',
    inputs: {},
    provider: 'claude',
    target,
    afterSuccess: true,
  })

const queue = (id: string): ScenarioQueue =>
  (service as ScenarioService).queuesView().queues.find((one) => one.id === id) as ScenarioQueue

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scenario-service-'))
  project = join(dir, 'project')
  fakes = []
  titles = []
  notes = []

  const shelf = join(project, '.claude', 'scenarios')

  await mkdir(shelf, { recursive: true })
  await mkdir(join(dir, 'home'), { recursive: true })

  for (const id of ['a', 'b', 'c']) {
    await writeFile(join(shelf, `${id}.json`), JSON.stringify(scenario(id)))
  }

  service = await ScenarioService.load({
    dataDir: join(dir, 'data'),
    worktreesRoot: join(dir, 'worktrees'),
    claudeHome: () => Promise.resolve(join(dir, 'home')),
    providers: [provider(fakes, titles)],
    events: {
      onQueues: () => undefined,
      onShelves: () => undefined,
      onRun: () => undefined,
      notify: (title, body) => notes.push(`${title}: ${body}`),
      openProject: () => undefined,
    },
  })
})

afterEach(async () => {
  await service?.shutdown()
  service = null
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('scenario service', () => {
  it('runs a scenario in a new queue to the end and lets the AI name the queue', async () => {
    const started = await start('a', { kind: 'new', worktree: false })

    expect(started.ok).toBe(true)
    if (!started.ok) return

    await until(() => queue(started.queueId).items[0]?.state === 'done')
    await until(() => queue(started.queueId).nameSource === 'ai')

    expect(queue(started.queueId).name).toBe('Named by AI')
    expect(titles[0]).toContain('Scenario a')
    expect(fakes.every((fake) => fake.spec.permissionMode !== '')).toBe(true)

    const run = await (service as ScenarioService).run(
      project,
      queue(started.queueId).items[0]?.runId ?? '',
    )

    expect(run).toMatchObject({ state: 'done', queueId: started.queueId, cwd: project })
  })

  it('runs a queue in order and stops after a chosen scenario until Resume', async () => {
    const started = await start('a', { kind: 'new', worktree: false })

    if (!started.ok) throw new Error('did not start')

    const { queueId } = started

    await start('b', { kind: 'queue', queueId })
    await start('c', { kind: 'queue', queueId })
    // b ещё ждёт или уже идёт - в обоих случаях «после него» значит: c не начинается.
    await (service as ScenarioService).act(queueId, {
      kind: 'stopAfter',
      itemId: queue(queueId).items[1]?.id ?? null,
    })

    await until(() => queue(queueId).hold?.reason === 'stopAfter')

    expect(queue(queueId).items.map((item) => item.state)).toEqual(['done', 'done', 'waiting'])
    expect(notes.some((note) => note.includes('stopped after Scenario b'))).toBe(true)

    await (service as ScenarioService).act(queueId, { kind: 'resume' })
    await until(() => queue(queueId).items.every((item) => item.state === 'done'))

    expect(queue(queueId).hold).toBeNull()
  })

  it('refuses a scenario that is not on the shelf and a queue that is closed', async () => {
    expect(await start('nope', { kind: 'new', worktree: false })).toEqual({
      ok: false,
      code: 'scenarioGone',
    })

    const started = await start('a', { kind: 'new', worktree: false })

    if (!started.ok) throw new Error('did not start')

    await until(() => queue(started.queueId).items[0]?.state === 'done')
    expect(await (service as ScenarioService).act(started.queueId, { kind: 'close' })).toBeNull()
    expect(await start('b', { kind: 'queue', queueId: started.queueId })).toEqual({
      ok: false,
      code: 'queueClosed',
    })
  })

  it('runs a new queue in its own git worktree and drops it when the empty queue closes', async () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: project,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@t',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@t',
        },
      })

    git('init', '-q', '-b', 'main')
    git('add', '.')
    git('commit', '-q', '-m', 'init')

    const started = await start('a', { kind: 'new', worktree: true })

    if (!started.ok) throw new Error(`did not start: ${started.code}`)

    const { workdir } = queue(started.queueId)

    if (workdir.kind !== 'worktree') throw new Error('no worktree')

    // git хранит путь без символических ссылок (/var → /private/var), поэтому - по хвосту.
    expect(workdir.path).toContain(join('worktrees', 'project-'))
    expect(workdir.gitBranch).toMatch(/^scenarios\/scenario-a-/)

    await until(() => queue(started.queueId).items[0]?.state === 'done')

    const run = await (service as ScenarioService).run(
      project,
      queue(started.queueId).items[0]?.runId ?? '',
    )

    expect(run?.cwd).toBe(workdir.projectDir)
    expect(await (service as ScenarioService).act(started.queueId, { kind: 'close' })).toBeNull()
    await until(() => !existsSync(workdir.path))
  })
})

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
import { accProjectKey } from './store/acc-runs'
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
/** Карточки этого теста: по умолчанию делают всё сразу, тест может придержать их. */
let cards: FakeScript = card

const scenario = (id: string): Scenario => ({
  version: 1,
  id,
  name: `Scenario ${id}`,
  createdAt: 1,
  updatedAt: 1,
  inputs: [],
  head: {
    briefing: '',
    provider: 'claude',
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
      spec.briefing.includes('main thread of a scenario')
        ? head
        : (said, spec) => cards(said, spec),
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
  stepFeed: () => Promise.resolve(null),
  chatIdOf: (sessionId) => Promise.resolve(sessionId),
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
  })

const queue = (id: string): ScenarioQueue =>
  (service as ScenarioService).queuesView().queues.find((one) => one.id === id) as ScenarioQueue

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scenario-service-'))
  project = join(dir, 'project')
  fakes = []
  titles = []
  notes = []
  cards = card

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
    accHome: join(dir, 'acc'),
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

  it('holds behind a stopped run and Resume continues that run, not the next one', async () => {
    const scenarios = service as ScenarioService
    let isHolding = true

    cards = () => (isHolding ? { kind: 'silent' } : { kind: 'say', text: 'Done the work.' })

    const started = await start('a', { kind: 'new', worktree: false })

    if (!started.ok) throw new Error('did not start')

    const { queueId } = started

    await start('b', { kind: 'queue', queueId })
    await until(() => scenarios.queuesView().live.some((run) => run.state === 'running'))

    const runId = queue(queueId).items[0]?.runId ?? ''

    scenarios.control(project, runId, 'stop')
    await until(() => queue(queueId).hold?.reason === 'failed')

    expect(queue(queueId).items.map((item) => item.state)).toEqual(['stopped', 'waiting'])
    expect(notes.some((note) => note.includes('continue it or mark it done'))).toBe(true)

    isHolding = false
    expect(await scenarios.act(queueId, { kind: 'resume' })).toBeNull()
    await until(() => queue(queueId).items.every((item) => item.state === 'done'))

    expect(queue(queueId).items[0]?.runId).toBe(runId)
    expect((await scenarios.run(project, runId))?.state).toBe('done')
  })

  it('a button or an answer for a run that is not going any more is refused, not done', async () => {
    const scenarios = service as ScenarioService
    const started = await start('a', { kind: 'new', worktree: false })

    if (!started.ok) throw new Error('did not start')

    await until(() => queue(started.queueId).items[0]?.state === 'done')

    const runId = queue(started.queueId).items[0]?.runId ?? ''

    expect(scenarios.control(project, runId, 'pause', 'running')).toBe('runOver')
    expect(scenarios.control(project, 'nope', 'stop', 'running')).toBe('runOver')
    expect(scenarios.answer(project, runId, true, '', { stepKey: 'x', askedAt: 1 })).toBe(false)
  })

  it('shows the runs ACC made in the project, read only', async () => {
    const scenarios = service as ScenarioService
    const folder = join(dir, 'acc', 'scenario-runs', accProjectKey(project), 'accRun01')
    const snapshot = { version: 1, id: 'a', name: 'A', inputs: [], stages: [] }

    await mkdir(folder, { recursive: true })
    await writeFile(
      join(folder, 'summary.json'),
      JSON.stringify({ id: 'accRun01', scenarioName: 'A', startedAt: 5, state: 'done' }),
    )
    await writeFile(
      join(folder, 'run.json'),
      JSON.stringify({ id: 'accRun01', snapshot, state: 'done', headConversationId: 'h' }),
    )

    const view = await scenarios.shelves.view(project)

    expect(view.runs.map((run) => `${run.id}:${run.origin}`)).toEqual(['accRun01:acc'])
    expect((await scenarios.run(project, 'accRun01'))?.origin).toBe('acc')
    expect(await scenarios.shelves.deleteRun(project, 'accRun01')).toBe('runForeign')
    expect(await scenarios.shelves.starRun(project, 'accRun01', true)).toBe('runForeign')
    expect(await scenarios.carryOn('accRun01')).toBe('runGone')
    expect(scenarios.control(project, 'accRun01', 'stop')).toBe('runOver')
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

  it('a new queue made with working hours sleeps before its first scenario starts', async () => {
    const scenarios = service as ScenarioService
    // Окно в другой день недели: сейчас точно вне часов.
    const other = ((new Date().getDay() + 3) % 7) + 1
    const started = await scenarios.start({
      projectPath: project,
      scenarioId: 'a',
      scope: 'project',
      inputs: {},
      provider: 'claude',
      target: { kind: 'new', worktree: false },
      hours: { from: 9 * 60, to: 10 * 60, days: [other] },
    })

    expect(started.ok).toBe(true)
    if (!started.ok) return

    await start('b', { kind: 'queue', queueId: started.queueId })

    expect(queue(started.queueId).nap).not.toBeNull()
    expect(queue(started.queueId).items.map((item) => item.state)).toEqual(['waiting', 'waiting'])
    expect(fakes).toHaveLength(0)

    await scenarios.act(started.queueId, { kind: 'hours', hours: null })
    await until(() => queue(started.queueId).items[0]?.state === 'done')
  })

  it('refuses a provider the IDE does not have instead of queueing a run that fails', async () => {
    const scenarios = service as ScenarioService
    const before = scenarios.queuesView().queues.length

    expect(
      await scenarios.start({
        projectPath: project,
        scenarioId: 'a',
        scope: 'project',
        inputs: {},
        provider: 'codex',
        target: { kind: 'new', worktree: false },
      }),
    ).toEqual({ ok: false, code: 'providerMissing' })
    expect(scenarios.queuesView().queues).toHaveLength(before)
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

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { QueueTarget, ScenarioQueue } from '@shared/scenario-queues'
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
          prompt: `Do the work of ${id}.`,
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

const start = (scenarioId: string, target: QueueTarget) =>
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

  service = await loadService()
})

/** Сервис на папке данных теста: второй вызов - та же IDE после перезапуска. */
const loadService = () =>
  ScenarioService.load({
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

/** git-репозиторий из папки проекта теста: worktree делается от его коммита. */
const gitInit = () => {
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
}

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

  it('passes placeholders where the queue reaches them and runs the scenarios between', async () => {
    const scenarios = service as ScenarioService
    const opened = await scenarios.startPlaceholder({
      projectPath: project,
      title: 'About the column',
      provider: 'claude',
      target: { kind: 'new', worktree: false },
    })

    if (!opened.ok) throw new Error('did not open')

    const { queueId } = opened

    await start('a', { kind: 'queue', queueId })
    await scenarios.startPlaceholder({
      projectPath: project,
      title: 'Check by hand',
      provider: 'claude',
      target: { kind: 'queue', queueId },
    })
    await start('b', { kind: 'queue', queueId })
    await until(() => queue(queueId).items.every((item) => item.state !== 'waiting'))
    await until(() => queue(queueId).items.at(-1)?.state === 'done')

    expect(queue(queueId).items.map((item) => [item.scenarioName, item.state])).toEqual([
      ['About the column', 'skipped'],
      ['Scenario a', 'done'],
      ['Check by hand', 'skipped'],
      ['Scenario b', 'done'],
    ])
    expect(queue(queueId).items.filter((item) => item.runId)).toHaveLength(2)
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
    gitInit()

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

/** Ворота карточек сценария: пока не открыты, его карточка «работает». */
type Gate = { promise: Promise<void>; open: () => void }

describe('queues without a worktree share the project folder', () => {
  /** Чьи карточки работали, по порядку - сценарий по слову в промпте карточки. */
  let order: string[] = []
  let gates = new Map<string, Gate>()

  const gate = (id: string): Gate => {
    let release = () => undefined as void
    const promise = new Promise<void>((resolve) => {
      release = resolve
    })
    const made = { promise, open: () => release() }

    gates.set(id, made)

    return made
  }

  const opened = async (
    scenarioId: string,
    target: QueueTarget = { kind: 'new', worktree: false },
  ) => {
    const started = await start(scenarioId, target)

    if (!started.ok) throw new Error(`did not start: ${started.code}`)

    return started.queueId
  }

  const scenarios = () => service as ScenarioService

  const folders = () => scenarios().queuesView().folders

  beforeEach(() => {
    order = []
    gates = new Map()
    cards = (said) => {
      const id = ['a', 'b', 'c'].find((one) => said.includes(`work of ${one}.`)) ?? '?'
      const held = gates.get(id)

      if (order.at(-1) !== id) order.push(id)

      return held
        ? { kind: 'after', work: () => held.promise, text: 'Done the work.' }
        : { kind: 'say', text: 'Done the work.' }
    }
  })

  it('the second queue waits its turn and starts after the last item of the first, even one added meanwhile', async () => {
    const first = gate('a')
    const one = await opened('a')
    const two = await opened('b')

    expect(queue(one).items[0]?.state).toBe('running')
    expect(queue(two).turn?.kind).toBe('waiting')
    expect(queue(two).items[0]?.state).toBe('waiting')
    expect(folders()).toEqual([{ projectPath: project, holders: [one], line: [two] }])

    await opened('c', { kind: 'queue', queueId: one })
    first.open()
    await until(() => queue(two).items[0]?.state === 'done')

    expect(order).toEqual(['a', 'c', 'b'])
    expect(queue(one).items.map((item) => item.state)).toEqual(['done', 'done'])
    expect(folders()).toEqual([])
  })

  it('a queue added to after it let go of the folder waits behind the one already waiting', async () => {
    const one = await opened('a')

    await until(() => queue(one).items[0]?.state === 'done')

    const busy = gate('b')
    const holder = await opened('b')
    const two = await opened('c')

    await opened('a', { kind: 'queue', queueId: one })

    expect(queue(one).turn?.kind).toBe('waiting')
    expect(folders()).toEqual([{ projectPath: project, holders: [holder], line: [two, one] }])

    busy.open()
    await until(() => queue(one).items[1]?.state === 'done')

    expect(order).toEqual(['a', 'b', 'c', 'a'])
  })

  it('a stopped holder keeps the folder; continued and done, it lets the next queue go', async () => {
    let isHolding = true

    cards = () => (isHolding ? { kind: 'silent' } : { kind: 'say', text: 'Done the work.' })

    const one = await opened('a')
    const two = await opened('b')
    const runId = queue(one).items[0]?.runId ?? ''

    await until(() =>
      scenarios()
        .queuesView()
        .live.some((run) => run.state === 'running'),
    )
    scenarios().control(project, runId, 'stop')
    await until(() => queue(one).items[0]?.state === 'stopped')
    await scenarios().runner.beat()

    expect(queue(two).items[0]?.state).toBe('waiting')
    expect(folders()).toEqual([{ projectPath: project, holders: [one], line: [two] }])

    isHolding = false
    expect(await scenarios().carryOn(runId)).toBeNull()
    await until(() => queue(two).items[0]?.state === 'done')

    expect(queue(one).items[0]).toMatchObject({ state: 'done', runId })
  })

  it('closing a holder that stands on an unfinished item lets the queue behind go', async () => {
    cards = (said) =>
      said.includes('work of a.') ? { kind: 'silent' } : { kind: 'say', text: 'Done the work.' }

    const one = await opened('a')
    const two = await opened('b')

    await until(() =>
      scenarios()
        .queuesView()
        .live.some((run) => run.state === 'running'),
    )
    scenarios().control(project, queue(one).items[0]?.runId ?? '', 'stop')
    await until(() => queue(one).items[0]?.state === 'stopped')

    expect(queue(two).items[0]?.state).toBe('waiting')
    expect(await scenarios().act(one, { kind: 'close' })).toBeNull()
    await until(() => queue(two).items[0]?.state === 'done')
  })

  it('run alongside starts at once beside the holder and leaves the line as it was', async () => {
    const first = gate('a')
    const one = await opened('a')
    const two = await opened('b')
    const three = await opened('c')

    expect(folders()[0]?.line).toEqual([two, three])
    expect(await scenarios().act(three, { kind: 'alongside' })).toBeNull()
    await until(() => queue(three).items[0]?.state === 'done')

    expect(queue(two).items[0]?.state).toBe('waiting')
    expect(folders()).toEqual([{ projectPath: project, holders: [one], line: [two] }])

    first.open()
    await until(() => queue(two).items[0]?.state === 'done')

    expect(order).toEqual(['a', 'c', 'b'])
  })

  it('a new queue made to run alongside does not wait', async () => {
    gate('a')

    const one = await opened('a')
    const beside = await opened('b', { kind: 'new', worktree: false, alongside: true })

    await until(() => queue(beside).items[0]?.state === 'done')

    expect(queue(one).items[0]?.state).toBe('running')
  })

  it('a group opened by a placeholder keeps run alongside for the scenarios behind it', async () => {
    gate('a')

    const one = await opened('a')
    const opened2 = await scenarios().startPlaceholder({
      projectPath: project,
      title: 'About the column',
      provider: 'claude',
      target: { kind: 'new', worktree: false, alongside: true },
    })

    if (!opened2.ok) throw new Error('did not open')

    await opened('b', { kind: 'queue', queueId: opened2.queueId, alongside: true })
    await until(() => queue(opened2.queueId).items[1]?.state === 'done')

    expect(queue(one).items[0]?.state).toBe('running')
  })

  it('a queue waiting for the folder does not close itself after two idle weeks', async () => {
    gate('a')

    const one = await opened('a')
    const two = await opened('b')

    await scenarios().runner.closeIdle(Date.now() + 15 * 24 * 60 * 60 * 1000)

    expect(queue(two).closedAt).toBe(0)
    expect(queue(two).turn?.kind).toBe('waiting')
    expect(queue(one).closedAt).toBe(0)
  })

  it('a queue in its own worktree runs beside a held folder and waits for nobody', async () => {
    gitInit()

    const first = gate('a')
    const one = await opened('a')
    const apart = await opened('b', { kind: 'new', worktree: true })

    await until(() => queue(apart).items[0]?.state === 'done')

    expect(queue(apart).turn).toBeNull()
    expect(folders()).toEqual([{ projectPath: project, holders: [one], line: [] }])

    first.open()
    await until(() => queue(one).items[0]?.state === 'done')
  })

  it('after an IDE restart mid-run the queue behind does not start on top; the holder goes on first', async () => {
    cards = () => ({ kind: 'silent' })

    const one = await opened('a')
    const two = await opened('b')
    const runId = queue(one).items[0]?.runId ?? ''

    await until(() =>
      scenarios()
        .queuesView()
        .live.some((run) => run.state === 'running'),
    )
    await scenarios().shutdown()
    service = await loadService()
    await scenarios().runner.beat()

    expect(queue(one).items[0]?.state).toBe('stopped')
    expect(queue(two).items[0]?.state).toBe('waiting')
    expect(scenarios().queuesView().live).toEqual([])

    cards = card
    expect(await scenarios().carryOn(runId)).toBeNull()
    await until(() => queue(two).items[0]?.state === 'done')
  })

  it('queues an old release left asleep without hours wait in the order they fell asleep', async () => {
    const legacy = (id: string, scenarioId: string, createdAt: number, sleptAt: number) => ({
      id,
      projectPath: project,
      name: id,
      createdAt,
      activeAt: Date.now(),
      closedAt: 0,
      workdir: { kind: 'project' },
      items: [
        {
          id: `${id}-1`,
          scenarioId,
          scope: 'project',
          scenarioName: scenarioId,
          inputs: {},
          provider: 'claude',
          addedAt: sleptAt,
          runId: '',
          state: 'waiting',
          refusal: null,
        },
      ],
      stopAfterItemId: '',
      hold: null,
      hours: null,
      nap: { at: sleptAt, until: sleptAt, runId: '' },
    })

    await scenarios().shutdown()
    await mkdir(join(dir, 'data'), { recursive: true })
    await writeFile(
      join(dir, 'data', 'scenario-queues.json'),
      // Позже уснувшая создана позже: беглый шаг всех очередей берёт её первой.
      JSON.stringify({
        version: 1,
        queues: [legacy('late', 'b', 2, 20), legacy('early', 'a', 1, 10)],
      }),
    )

    const held = gate('a')

    service = await loadService()
    await scenarios().runner.beat()

    expect(queue('early').items[0]?.state).toBe('running')
    expect(queue('late').turn).toEqual({ kind: 'waiting', at: 20 })
    expect(queue('late').nap).toBeNull()

    held.open()
    await until(() => queue('late').items[0]?.state === 'done')

    expect(order).toEqual(['a', 'b'])
  })
})

import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { InboxItem } from '@shared/inbox'
import type { ScenarioCode } from '@shared/scenarios'
import type { TaskDraft } from '@shared/tasks'
import { MINUTE_MS } from '@shared/time-units'

import { InboxAgent } from '../inbox/inbox-agent'
import { InboxService } from '../inbox/inbox-service'
import type { StoredInbox } from '../inbox/inbox-service'
import { JsonFile } from '../storage/json-file'
import { settle, FakeCli } from '../scenarios/engine/__fixtures__/fake-cli'
import type { FakeScript } from '../scenarios/engine/__fixtures__/fake-cli'
import { TaskBook } from './task-book'
import type { StoredTasks } from './task-book'
import { TaskService } from './task-service'

let dir = ''
let clis: FakeCli[] = []
let arrived: InboxItem[] = []

const draft = (patch: Partial<TaskDraft> = {}): TaskDraft => ({
  id: null,
  name: 'Invoice',
  projectPath: dir,
  prompt: 'Make the monthly invoice',
  schedule: { repeat: 'manual', at: 9 * 60, days: [], monthDay: 1, date: '' },
  enabled: true,
  catchUp: true,
  report: true,
  provider: 'claude',
  model: '',
  effort: '',
  permissionMode: 'default',
  ...patch,
})

/** Задания и уведомления на подделке CLI, связанные так же, как в tasks-setup. */
const start = async (
  script: FakeScript,
  {
    prepare = () => Promise.resolve(null),
    chat = () => Promise.resolve(false),
  }: {
    prepare?: () => Promise<ScenarioCode | null>
    chat?: (sessionId: string, text: string) => Promise<boolean>
  } = {},
) => {
  const { book } = await TaskBook.load(new JsonFile<StoredTasks>(join(dir, 'tasks.json')))
  const tasks = new TaskService(book, {
    dataDir: dir,
    host: {
      sessions: {
        prepare,
        spawn: (spec, _place, wires) => {
          const cli = new FakeCli(spec, wires, script)

          clis.push(cli)

          return cli
        },
      },
      defaults: () => ({ model: 'sonnet', effort: '' }),
      accountId: () => '',
    },
    folderKnown: (path) => path === dir,
    openChat: () => Promise.resolve(true),
    sendToChat: chat,
    onState: () => undefined,
    onRunFinished: () => undefined,
  })
  const inbox = await InboxService.load(new JsonFile<StoredInbox>(join(dir, 'inbox.json')), {
    onState: () => undefined,
    onArrived: (item) => arrived.push(item),
  })

  inbox.routes = {
    tasks,
    sendToChat: () => Promise.resolve(false),
    trust: () => Promise.resolve(),
    openPath: () => Promise.resolve(true),
    openUrl: () => true,
  }
  tasks.inbox = inbox

  return { tasks, inbox, book }
}

const saved = async (tasks: TaskService, patch: Partial<TaskDraft> = {}) => {
  const result = await tasks.save(draft(patch))

  if (!result.ok) throw new Error(result.code)

  return result.taskId
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  clis = []
  arrived = []
})

afterEach(async () => {
  await settle()
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
})

describe('TaskService', () => {
  it('runs a task and reports its last words to the notifications', async () => {
    const { tasks } = await start(() => ({ kind: 'say', text: 'Invoice #12 is ready.' }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const run = started.ok ? tasks.run(started.runId) : null

    expect(clis[0]?.heard).toEqual(['Make the monthly invoice'])
    expect(clis[0]?.spec.briefing).toContain('scheduled task «Invoice»')
    expect(run?.state).toBe('done')
    expect(run?.report).toBe('Invoice #12 is ready.')
    expect(clis[0]?.isAlive).toBe(false)
    expect(arrived.map((item) => [item.kind, item.body])).toEqual([
      ['report', 'Invoice #12 is ready.'],
    ])
  })

  it('asks for a permission in the notifications and goes on when it is allowed', async () => {
    const { tasks, inbox } = await start(() => ({
      kind: 'ask',
      tool: 'Bash',
      input: { command: 'python3 invoice.py' },
      then: 'Done.',
    }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const asking = arrived.find((item) => item.kind === 'permission')

    expect(started.ok && tasks.run(started.runId)?.state).toBe('waiting')
    expect(asking?.detail).toBe('python3 invoice.py')

    const acted = await inbox.act({
      itemId: asking?.id ?? '',
      actionId: 'allow',
      text: '',
      answers: null,
    })

    await settle()

    expect(acted.ok).toBe(true)
    expect(clis[0]?.answers[0]?.response).toMatchObject({ behavior: 'allow' })
    expect(started.ok && tasks.run(started.runId)?.state).toBe('done')
    expect(inbox.all().find((item) => item.id === asking?.id)?.outcome).toBe('allow')
  })

  it('answers AskUserQuestion with the chosen option under answers', async () => {
    const question = { question: 'Send it now?', header: 'Send', multiSelect: false, options: [] }
    const { tasks, inbox } = await start(() => ({
      kind: 'ask',
      tool: 'AskUserQuestion',
      input: { questions: [question] },
      then: 'Sent.',
    }))

    await tasks.runNow(await saved(tasks))
    await settle()

    const asking = arrived.find((item) => item.kind === 'question')

    await inbox.act({
      itemId: asking?.id ?? '',
      actionId: 'answer',
      text: '',
      answers: { 'Send it now?': 'Yes' },
    })
    await settle()

    expect(asking?.questions[0]?.question).toBe('Send it now?')
    expect(inbox.all().find((item) => item.id === asking?.id)?.outcome).toBe('Yes')
    expect(clis[0]?.answers[0]?.response).toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Send it now?': 'Yes' } },
    })
  })

  it('refuses a question dismissed with the cross and keeps it closed as dismissed', async () => {
    const { tasks, inbox } = await start(() => ({
      kind: 'ask',
      tool: 'Bash',
      input: { command: 'rm -rf build' },
      then: 'Skipped.',
    }))

    await tasks.runNow(await saved(tasks))
    await settle()

    const asking = arrived.find((item) => item.kind === 'permission')

    inbox.dismiss([asking?.id ?? ''])
    await settle()

    expect(clis[0]?.answers[0]?.response).toMatchObject({ behavior: 'deny' })
    expect(inbox.all().find((item) => item.id === asking?.id)?.outcome).toBe('dismissed')
  })

  it('returns a reply button of its own notification into the run conversation', async () => {
    const { tasks, inbox } = await start((said) => ({ kind: 'say', text: `heard: ${said}` }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const run = started.ok ? tasks.run(started.runId) : null
    const agent = new InboxAgent(
      inbox,
      () => ({
        origin: { kind: 'task', taskId: run?.taskId ?? '', runId: run?.id ?? '' },
        source: 'Invoice',
      }),
      () => tasks.noteNotified(run?.id ?? ''),
    )
    const posted = agent.post(
      { projectPath: dir, conversationId: run?.sessionId ?? '' },
      {
        title: 'Invoice ready',
        body: '',
        attention: false,
        at: '',
        buttons: [{ label: 'Draft email', type: 'reply', value: '' }],
      },
    )

    await inbox.act({ itemId: posted.id, actionId: 'b0', text: '', answers: null })
    await settle()

    expect(clis.at(-1)?.heard.at(-1)).toContain(
      'pressed «Draft email» on your notification «Invoice ready»',
    )
    expect(run && tasks.run(run.id)?.notified).toBe(true)
  })

  it('does not repeat a report the run already sent itself while it was going', async () => {
    const { tasks, inbox } = await start(() => ({
      kind: 'ask',
      tool: 'Bash',
      input: { command: 'ls' },
      then: 'Done.',
    }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const run = started.ok ? tasks.run(started.runId) : null
    const agent = new InboxAgent(
      inbox,
      () => ({
        origin: { kind: 'task', taskId: run?.taskId ?? '', runId: run?.id ?? '' },
        source: 'Invoice',
      }),
      () => tasks.noteNotified(run?.id ?? ''),
    )

    agent.post(
      { projectPath: dir, conversationId: run?.sessionId ?? '' },
      { title: 'Invoice ready', body: '', attention: false, at: '', buttons: [] },
    )

    const asking = arrived.find((item) => item.kind === 'permission')

    await inbox.act({ itemId: asking?.id ?? '', actionId: 'allow', text: '', answers: null })
    await settle()

    expect(run && tasks.run(run.id)).toMatchObject({ state: 'done', notified: true })
    expect(arrived.filter((item) => item.kind === 'report')).toHaveLength(0)
  })

  it('leaves no conversation to a run that could not start', async () => {
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }), {
      prepare: () => Promise.resolve('untrusted'),
    })

    const started = await tasks.runNow(await saved(tasks))
    const run = started.ok ? tasks.run(started.runId) : null

    expect(run).toMatchObject({ state: 'failed', failure: 'untrusted', sessionId: '' })
    expect(arrived.map((item) => item.reason)).toEqual(['untrusted'])
  })

  it('starts a due task on the tick and moves its due time on', async () => {
    const { tasks, book } = await start(() => ({ kind: 'say', text: 'ok' }))
    const taskId = await saved(tasks, {
      schedule: { repeat: 'hourly', at: 0, days: [], monthDay: 1, date: '' },
    })
    const task = tasks.task(taskId)

    if (!task) throw new Error('no task')

    // Срок пришёл минуту назад - в пределах запаса.
    await book.putTask({ ...task, nextAt: Date.now() - MINUTE_MS })
    await tasks.tick()
    await settle()

    expect(tasks.view().runs[0]?.trigger).toBe('schedule')
    expect(tasks.task(taskId)?.nextAt).toBeGreaterThan(Date.now())
  })

  it('marks a long missed task as skipped when it does not catch up', async () => {
    const { tasks, book } = await start(() => ({ kind: 'say', text: 'ok' }))
    const taskId = await saved(tasks, {
      catchUp: false,
      schedule: { repeat: 'daily', at: 9 * 60, days: [], monthDay: 1, date: '' },
    })
    const task = tasks.task(taskId)

    if (!task) throw new Error('no task')

    await book.putTask({ ...task, nextAt: Date.now() - 60 * MINUTE_MS })
    await tasks.tick()

    expect(tasks.view().runs[0]).toMatchObject({ state: 'skipped', skip: 'missed' })
    expect(clis).toHaveLength(0)
  })

  it('lets a continued old run work without the 3-hour ceiling of its first start', async () => {
    const { tasks, book } = await start((said) => ({ kind: 'say', text: `heard: ${said}` }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const run = started.ok ? tasks.run(started.runId) : null

    if (!run) throw new Error('no run')

    await book.putRun({ ...run, startedAt: Date.now() - 4 * 60 * MINUTE_MS })
    await tasks.tell(run.id, 'one more thing')
    await tasks.tick()
    await settle()

    expect(tasks.run(run.id)).toMatchObject({ state: 'done', failure: null })
  })

  it('starts one run when the same task is started twice at once', async () => {
    let release = () => undefined as void
    const gate = new Promise<null>((resolve) => {
      release = () => resolve(null)
    })
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }), { prepare: () => gate })
    const taskId = await saved(tasks)
    const both = Promise.all([tasks.runNow(taskId), tasks.runNow(taskId)])

    release()

    const [first, second] = await both

    await settle()

    expect([first.ok, second.ok]).toEqual([true, false])
    expect(second).toEqual({ ok: false, code: 'runBusy' })
    expect(clis).toHaveLength(1)
  })

  it('does not bring back a task removed while another due task was starting', async () => {
    let release = () => undefined as void
    const gate = new Promise<null>((resolve) => {
      release = () => resolve(null)
    })
    const { tasks, book } = await start(() => ({ kind: 'say', text: 'ok' }), {
      prepare: () => gate,
    })
    const hourly = { repeat: 'hourly' as const, at: 0, days: [], monthDay: 1, date: '' }
    const first = await saved(tasks, { name: 'A', schedule: hourly })
    const second = await saved(tasks, { name: 'B', schedule: hourly })

    for (const id of [first, second]) {
      const task = tasks.task(id)

      if (task) await book.putTask({ ...task, nextAt: Date.now() - MINUTE_MS })
    }

    const ticking = tasks.tick()

    await settle()
    await tasks.remove(second)
    release()
    await ticking
    await settle()

    expect(tasks.task(second)).toBeUndefined()
    expect(tasks.view().runs.filter((run) => run.taskId === second)).toHaveLength(0)
  })

  it('sends words to the chat tab of a run that was opened in the panel', async () => {
    const told: string[] = []
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }), {
      chat: (_sessionId, text) => {
        told.push(text)

        return Promise.resolve(true)
      },
    })
    const started = await tasks.runNow(await saved(tasks))

    await settle()
    await tasks.tell(started.ok ? started.runId : '', 'thanks')

    expect(told).toEqual(['thanks'])
    expect(clis).toHaveLength(1)
  })

  it('still reports a run whose only notification is a reminder for later', async () => {
    const { tasks, inbox } = await start(() => ({ kind: 'say', text: 'Paid?' }))
    const started = await tasks.runNow(await saved(tasks))

    await settle()

    const run = started.ok ? tasks.run(started.runId) : null
    const agent = new InboxAgent(
      inbox,
      () => ({
        origin: { kind: 'task', taskId: run?.taskId ?? '', runId: run?.id ?? '' },
        source: 'Invoice',
      }),
      () => tasks.noteNotified(run?.id ?? ''),
    )

    agent.post(
      { projectPath: dir, conversationId: run?.sessionId ?? '' },
      {
        title: 'Check payment',
        body: '',
        attention: false,
        at: new Date(Date.now() + 60 * MINUTE_MS).toISOString(),
        buttons: [],
      },
    )

    expect(run && tasks.run(run.id)?.notified).toBe(false)
  })

  it('says the task is busy when Run again is pressed while it runs', async () => {
    let code: ScenarioCode | null = 'noClaude'
    const { tasks, inbox } = await start(
      () => ({ kind: 'ask', tool: 'Bash', input: { command: 'ls' }, then: 'ok' }),
      { prepare: () => Promise.resolve(code) },
    )
    const taskId = await saved(tasks)

    await tasks.runNow(taskId)

    const failure = arrived.find((item) => item.kind === 'failure')

    code = null
    await tasks.runNow(taskId)
    await settle()

    expect(
      await inbox.act({ itemId: failure?.id ?? '', actionId: 'runAgain', text: '', answers: null }),
    ).toEqual({ ok: false, code: 'runBusy' })
  })

  it('refuses a task outside the known folders', async () => {
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }))

    expect(await tasks.save(draft({ projectPath: '/nowhere' }))).toEqual({
      ok: false,
      code: 'badFolder',
    })
    expect(await tasks.save(draft({ name: ' ' }))).toEqual({ ok: false, code: 'noName' })
  })
})

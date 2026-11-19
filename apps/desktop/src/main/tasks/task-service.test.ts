import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { InboxItem } from '@shared/inbox'
import type { ScenarioCode } from '@shared/scenarios'
import { MINUTE_MS } from '@shared/time-units'

import { InboxAgent } from '../inbox/inbox-agent'
import { settle } from '../scenarios/engine/__fixtures__/fake-cli'
import type { FakeCli } from '../scenarios/engine/__fixtures__/fake-cli'
import { TaskHarness } from './__fixtures__/task-harness'

const harness = new TaskHarness()
let dir = ''
let clis: FakeCli[] = []
let arrived: InboxItem[] = []

const start = (...args: Parameters<TaskHarness['start']>) => harness.start(...args)

const saved = (...args: Parameters<TaskHarness['saved']>) => harness.saved(...args)

beforeEach(async () => {
  await harness.open()
  ;({ dir, clis, arrived } = harness)
})

afterEach(() => harness.close())

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

  it('passes a due time the person skipped and runs the one after it', async () => {
    const { tasks, book } = await start(() => ({ kind: 'say', text: 'ok' }))
    const taskId = await saved(tasks, {
      schedule: { repeat: 'hourly', at: 0, days: [], monthDay: 1, date: '' },
    })
    const due = tasks.task(taskId)?.nextAt ?? 0

    expect((await tasks.skipNext(taskId, true)).ok).toBe(true)
    expect(tasks.task(taskId)?.skipAt).toBe(due)

    const task = tasks.task(taskId)

    if (!task) throw new Error('no task')

    const came = Date.now() - MINUTE_MS

    await book.putTask({ ...task, nextAt: came, skipAt: came })
    await tasks.tick()

    expect(tasks.view().runs[0]).toMatchObject({ state: 'skipped', skip: 'person' })
    expect(clis).toHaveLength(0)
    expect(tasks.task(taskId)).toMatchObject({ skipAt: 0 })
    expect(tasks.task(taskId)?.nextAt).toBeGreaterThan(Date.now())
  })

  it('gives a skipped due time back and refuses to skip a task without a next one', async () => {
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }))
    const hourly = await saved(tasks, {
      schedule: { repeat: 'hourly', at: 0, days: [], monthDay: 1, date: '' },
    })
    const manual = await saved(tasks, {
      schedule: { repeat: 'manual', at: 0, days: [], monthDay: 1, date: '' },
    })

    await tasks.skipNext(hourly, true)
    await tasks.skipNext(hourly, false)

    expect(tasks.task(hourly)?.skipAt).toBe(0)
    expect(await tasks.skipNext(manual, true)).toEqual({ ok: false, code: 'badSchedule' })
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
      chat: (_run, text) => {
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

  it('moves a task to another project only when no run of it is going', async () => {
    const other = `${dir}/other`
    const { tasks } = await start(
      () => ({ kind: 'ask', tool: 'Bash', input: { command: 'ls' }, then: 'ok' }),
      { folders: [other] },
    )
    const taskId = await saved(tasks)
    const started = await tasks.runNow(taskId)
    const runId = started.ok ? started.runId : ''
    const moved = harness.draft({ id: taskId, projectPath: other })

    await settle()

    expect(await tasks.save(moved)).toEqual({ ok: false, code: 'moveBusy' })
    expect(await tasks.save(harness.draft({ id: taskId, name: 'Invoice 2' }))).toMatchObject({
      ok: true,
    })

    tasks.stop(runId)
    await settle()

    expect(await tasks.save(moved)).toMatchObject({ ok: true })
    expect(tasks.task(taskId)?.projectPath).toBe(other)
    // Разговор прогона лежит в папке, где он шёл: прогон с заданием не переезжает.
    expect(tasks.run(runId)?.projectPath).toBe(dir)
    expect(await tasks.save({ ...moved, projectPath: '/nowhere' })).toEqual({
      ok: false,
      code: 'badFolder',
    })
  })

  it('refuses a task outside the known folders', async () => {
    const { tasks } = await start(() => ({ kind: 'say', text: 'ok' }))

    expect(await tasks.save(harness.draft({ projectPath: '/nowhere' }))).toEqual({
      ok: false,
      code: 'badFolder',
    })
    expect(await tasks.save(harness.draft({ name: ' ' }))).toEqual({ ok: false, code: 'noName' })
  })
})

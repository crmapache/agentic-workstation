import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { TaskRun } from '@shared/tasks'
import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import type { GoalChecker, ProbeAnswer } from '../goals/goal-watch'
import { settle } from '../scenarios/engine/__fixtures__/fake-cli'
import type { FakeReply } from '../scenarios/engine/__fixtures__/fake-cli'
import type { TaskService } from './task-service'
import { TaskHarness } from './__fixtures__/task-harness'
import type { HarnessOptions } from './__fixtures__/task-harness'

const harness = new TaskHarness()
const T0 = new Date(2026, 10, 18, 10, 0).getTime()

/** Местное время ISO без пояса - так его пишет модель. */
const localIso = (ms: number) => {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Поручение на подделке CLI: script получает сервис - чтобы звать инструменты поручения. */
const goal = async (
  script: (said: string, sessionId: string, tasks: TaskService) => FakeReply,
  options: HarnessOptions & { budgetUsd?: number } = {},
) => {
  let service: TaskService | null = null
  const started = await harness.start(
    (said, spec) => (service ? script(said, spec.sessionId, service) : { kind: 'silent' }),
    options,
  )

  service = started.tasks

  const taskId = await harness.saved(started.tasks, {
    kind: 'goal',
    name: 'Call with Corey',
    prompt: 'Agree on a call with Corey next week.',
    goal: { outbound: 'confirm', budgetUsd: options.budgetUsd ?? 5, lifeDays: 7 },
  })
  const run = await started.tasks.runNow(taskId)

  await settle()

  if (!run.ok) throw new Error(run.code)

  return { ...started, taskId, runId: run.runId }
}

/** Время вперёд и такт часов. */
const later = async (tasks: TaskService, ms: number) => {
  vi.setSystemTime(Date.now() + ms)
  await tasks.tick()
  await settle()
}

/**
 * Дождаться, пока поручение проснётся новым процессом: подъём читает папки транскриптов с диска,
 * и сколько это идёт, тактами не сосчитать.
 */
const woken = async (count: number) => {
  await vi.waitFor(
    () => {
      if (harness.clis.length < count) throw new Error('not woken yet')
    },
    { timeout: 5_000, interval: 10 },
  )
  await settle()
}

const runOf = (tasks: TaskService, runId: string): TaskRun | null => tasks.run(runId)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await harness.open()
})

afterEach(async () => {
  vi.useRealTimers()
  await harness.close()
})

describe('goals', () => {
  it('sleeps on wait without a process and wakes when its time comes', async () => {
    const { tasks, runId } = await goal((said, sessionId, service) =>
      said.includes('Woke up')
        ? {
            kind: 'after',
            work: () =>
              Promise.resolve(service.goals.desk.finish(sessionId, 'done', 'Call on Tue.')),
            text: 'Done.',
          }
        : {
            kind: 'after',
            work: () =>
              service.goals.desk.wait(sessionId, {
                reason: 'Corey reply',
                until: localIso(T0 + 2 * HOUR_MS),
              }),
            text: 'Waiting for Corey.',
          },
    )

    expect(runOf(tasks, runId)?.state).toBe('sleeping')
    expect(harness.clis[0]?.isAlive).toBe(false)
    expect(harness.clis[0]?.spec.briefing).toContain('goal «Call with Corey»')
    expect(tasks.view().goals[0]?.wait?.reason).toBe('Corey reply')

    await later(tasks, HOUR_MS)

    expect(harness.clis).toHaveLength(1)

    await later(tasks, HOUR_MS + MINUTE_MS)
    await woken(2)
    await vi.waitFor(() => expect(runOf(tasks, runId)?.state).toBe('done'))

    expect(harness.clis[1]?.heard[0]).toContain('the time you set came')
    expect(runOf(tasks, runId)).toMatchObject({ state: 'done', report: 'Call on Tue.' })
    expect(harness.arrived.map((item) => [item.kind, item.body])).toEqual([
      ['report', 'Call on Tue.'],
    ])
  })

  it('watches a tool without a model and wakes only on a real change', async () => {
    let thread = 'Max: shall we talk?'
    const judged: string[] = []
    const probe = (): Promise<ProbeAnswer> => Promise.resolve({ text: thread })
    const checker: GoalChecker = {
      judge: (input) => {
        judged.push(input.after)

        return Promise.resolve(
          input.after.includes('Tuesday')
            ? { relevant: true, summary: 'Corey said Tuesday works.', costUsd: 0.002 }
            : { relevant: false, summary: 'A newsletter.', costUsd: 0.001 },
        )
      },
      look: () => Promise.resolve({ error: 'none', costUsd: 0 }),
    }
    const { tasks, runId } = await goal(
      (said, sessionId, service) =>
        said.includes('Woke up')
          ? { kind: 'say', text: 'Reading.' }
          : {
              kind: 'after',
              work: () =>
                service.goals.desk.wait(sessionId, {
                  reason: 'Corey reply',
                  watch: [
                    {
                      server: 'gmail-work',
                      tool: 'read_thread',
                      args: { id: 't1' },
                      expect: 'a reply from Corey',
                      every_minutes: 5,
                    },
                  ],
                }),
              text: 'Waiting.',
            },
      { probe, checker },
    )

    await later(tasks, 6 * MINUTE_MS)

    expect(judged).toEqual([])

    thread = 'Max: shall we talk? News: sale'
    await later(tasks, 6 * MINUTE_MS)

    expect(judged).toHaveLength(1)
    expect(tasks.goal(runId)?.events.at(-1)).toMatchObject({ kind: 'noise' })
    expect(harness.clis).toHaveLength(1)

    thread = 'Max: shall we talk? News: sale Corey: Tuesday works'
    await later(tasks, 6 * MINUTE_MS)
    await woken(2)

    expect(harness.clis[1]?.heard[0]).toContain('gmail-work read_thread changed')
    expect(harness.clis[1]?.heard[0]).toContain('Corey said Tuesday works.')
    expect(tasks.goal(runId)?.checksUsd).toBeCloseTo(0.003)
  })

  it('refuses a watch that does not work right away', async () => {
    const { tasks, runId } = await goal(() => ({ kind: 'silent' }), {
      probe: () => Promise.resolve({ error: 'gmail-work has no tool read_thread.' }),
    })
    const sessionId = runOf(tasks, runId)?.sessionId ?? ''

    await expect(
      tasks.goals.desk.wait(sessionId, {
        reason: 'reply',
        watch: [{ server: 'gmail-work', tool: 'read_thread', expect: 'reply' }],
      }),
    ).rejects.toThrow('watch gmail-work read_thread: gmail-work has no tool read_thread.')
    expect(tasks.goal(runId)?.decided).toBeNull()
  })

  it('asks once for a decision, then waits for the person who wakes it with words', async () => {
    const { tasks, runId } = await goal((said) => ({ kind: 'say', text: `heard: ${said}` }))

    expect(harness.clis[0]?.heard[1]).toContain('without a decision')
    expect(runOf(tasks, runId)?.state).toBe('sleeping')
    expect(tasks.goal(runId)?.wait?.person).toBe(true)
    expect(harness.arrived.at(-1)).toMatchObject({ kind: 'message', tone: 'attention' })

    await tasks.tell(runId, 'Book Tuesday 10:00')
    await settle()

    expect(harness.clis[1]?.heard[0]).toBe('Book Tuesday 10:00')
  })

  it('starts a new chapter from the journal when the context grew big', async () => {
    const { tasks, runId } = await goal((said, sessionId, service) =>
      said.includes('session 2')
        ? { kind: 'silent' }
        : {
            kind: 'after',
            work: () =>
              service.goals.desk.wait(sessionId, {
                reason: 'later',
                until: localIso(T0 + HOUR_MS),
              }),
            text: 'Waiting.',
          },
    )
    const first = runOf(tasks, runId)?.sessionId

    tasks.goals.desk.edit(runId, (life) => ({
      ...life,
      contextTokens: 90_000,
      journal: 'Wrote to Corey on Monday.',
    }))
    await later(tasks, HOUR_MS + MINUTE_MS)
    await woken(2)

    expect(harness.clis[1]?.spec.sessionId).not.toBe(first)
    expect(harness.clis[1]?.heard[0]).toContain('Wrote to Corey on Monday.')
    expect(tasks.goal(runId)?.chapters).toEqual([first])
  })

  it('goes on by itself after the IDE restarted in the middle of work', async () => {
    const before = await goal(() => ({ kind: 'silent' }))

    await before.tasks.shutdown()

    const after = await harness.start((said) => ({ kind: 'say', text: said }))

    expect(after.tasks.run(before.runId)?.state).toBe('sleeping')

    await later(after.tasks, 30_000)
    await woken(2)

    expect(harness.clis.at(-1)?.heard[0]).toContain('The IDE restarted')
  })

  it('ends at its budget and offers to continue', async () => {
    const { tasks, runId } = await goal(
      (_said, sessionId, service) => ({
        kind: 'after',
        work: () => service.goals.desk.wait(sessionId, { reason: 'reply', person: true }),
        text: 'Waiting.',
      }),
      { budgetUsd: 0.01 },
    )

    await later(tasks, 30_000)

    expect(runOf(tasks, runId)).toMatchObject({ state: 'failed', failure: 'overBudget' })
    expect(harness.arrived.at(-1)?.actions.map((action) => action.kind)).toEqual([
      'resume',
      'showRun',
    ])
  })

  it('sleeps after a failed turn and tries again later', async () => {
    const { tasks, runId } = await goal((said) =>
      said.includes('error') ? { kind: 'silent' } : { kind: 'fail', text: 'rate limit' },
    )

    expect(runOf(tasks, runId)?.state).toBe('sleeping')

    await later(tasks, 16 * MINUTE_MS)
    await woken(2)

    expect(harness.clis[1]?.heard[0]).toContain('ended with an error (rate limit)')
  })

  it('holds a message to other people until the person confirms it', async () => {
    const { tasks, inbox, runId } = await goal(() => ({ kind: 'silent' }))
    const sessionId = runOf(tasks, runId)?.sessionId ?? ''
    const confirming = tasks.goals.confirm(
      sessionId,
      {
        server: 'gmail-work',
        tool: 'send_message',
        title: 'Gmail · Work',
        args: { to: 'c@x.com' },
      },
      new AbortController().signal,
    )

    await settle()

    const card = harness.arrived.find((item) => item.kind === 'permission')

    expect(card?.tool).toBe('mcp__gmail-work__send_message')
    expect(runOf(tasks, runId)?.state).toBe('waiting')

    await inbox.act({ itemId: card?.id ?? '', actionId: 'allow', text: '', answers: null })

    expect(await confirming).toBe(true)
    expect(tasks.goal(runId)?.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['confirmAsked', 'confirmed']),
    )
  })

  it('shows the same life on a second start and stops a sleeping one', async () => {
    const { tasks, taskId, runId } = await goal((_said, sessionId, service) => ({
      kind: 'after',
      work: () => service.goals.desk.wait(sessionId, { reason: 'reply', person: true }),
      text: 'Waiting.',
    }))
    const again = await tasks.runNow(taskId)

    expect(again.ok && again.runId).toBe(runId)
    expect(tasks.stop(runId).ok).toBe(true)
    expect(runOf(tasks, runId)?.state).toBe('stopped')
  })
})

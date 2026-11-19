import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_GOAL } from '@shared/goals'
import type { InboxItem } from '@shared/inbox'
import type { ScenarioCode } from '@shared/scenarios'
import type { TaskDraft } from '@shared/tasks'

import { TaskBook } from '../task-book'
import type { StoredTasks } from '../task-book'
import { TaskService } from '../task-service'
import { GoalBook } from '../../goals/goal-book'
import type { StoredGoals } from '../../goals/goal-book'
import type { GoalProbe, GoalChecker } from '../../goals/goal-watch'
import { InboxService } from '../../inbox/inbox-service'
import type { StoredInbox } from '../../inbox/inbox-service'
import { JsonFile } from '../../storage/json-file'
import { settle, FakeCli } from '../../scenarios/engine/__fixtures__/fake-cli'
import type { FakeScript } from '../../scenarios/engine/__fixtures__/fake-cli'

export type HarnessOptions = {
  prepare?: () => Promise<ScenarioCode | null>
  chat?: (run: { sessionId: string }, text: string) => Promise<boolean>
  probe?: GoalProbe
  checker?: GoalChecker
  /** Ещё проекты, которые IDE знает, кроме временной папки: куда переносить задание. */
  folders?: readonly string[]
}

const NO_CHECKS: GoalChecker = {
  judge: () => Promise.resolve({ error: 'no checker in this test', costUsd: 0 }),
  look: () => Promise.resolve({ error: 'no checker in this test', costUsd: 0 }),
}

/**
 * Задания и уведомления на подделке CLI, связанные так же, как в tasks-setup, - во временной
 * папке. Настоящих прогонов с моделью тесты не запускают.
 */
export class TaskHarness {
  dir = ''
  clis: FakeCli[] = []
  arrived: InboxItem[] = []

  async open(): Promise<void> {
    this.dir = await mkdtemp(join(tmpdir(), 'tasks-'))
    this.clis = []
    this.arrived = []
  }

  async close(): Promise<void> {
    await settle()
    await rm(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }

  draft(patch: Partial<TaskDraft> = {}): TaskDraft {
    return {
      id: null,
      kind: 'schedule',
      name: 'Invoice',
      projectPath: this.dir,
      prompt: 'Make the monthly invoice',
      schedule: { repeat: 'manual', at: 9 * 60, days: [], monthDay: 1, date: '' },
      enabled: true,
      catchUp: true,
      report: true,
      provider: 'claude',
      model: '',
      effort: '',
      permissionMode: 'default',
      goal: DEFAULT_GOAL,
      ...patch,
    }
  }

  async start(script: FakeScript, options: HarnessOptions = {}) {
    const { book } = await TaskBook.load(new JsonFile<StoredTasks>(join(this.dir, 'tasks.json')))
    const goalBook = await GoalBook.load(new JsonFile<StoredGoals>(join(this.dir, 'goals.json')))
    const tasks = new TaskService(book, {
      dataDir: this.dir,
      host: {
        provider: () => ({
          id: 'claude',
          prepare: options.prepare ?? (() => Promise.resolve(null)),
          spawn: (spec, _place, wires) => {
            const cli = new FakeCli(spec, wires, script)

            this.clis.push(cli)

            return cli
          },
          // Разговоров на диске у подделки нет: продолжение законченного - новым процессом.
          transcriptDirs: () => Promise.resolve([]),
          stepFeed: () => Promise.resolve(null),
          chatIdOf: (sessionId) => Promise.resolve(sessionId),
          defaults: () => ({ model: 'sonnet', effort: '' }),
          accounts: {
            current: () => '',
            label: () => '',
            candidates: () => [],
            same: (left, right) => left === right,
            noteRefused: () => undefined,
          },
          suggestTitle: () => Promise.resolve(null),
          draft: () => Promise.resolve({ ok: false, error: '', cancelled: false }),
          cancelDraft: () => undefined,
          openChat: () => Promise.resolve(false),
        }),
      },
      folderKnown: (path) => path === this.dir || Boolean(options.folders?.includes(path)),
      openChat: () => Promise.resolve(true),
      sendToChat: options.chat ?? (() => Promise.resolve(false)),
      onState: () => undefined,
      onRunFinished: () => undefined,
      goals: {
        book: goalBook,
        probe: options.probe ?? (() => Promise.resolve({ error: 'no probe in this test' })),
        checker: options.checker ?? NO_CHECKS,
      },
    })
    const inbox = await InboxService.load(new JsonFile<StoredInbox>(join(this.dir, 'inbox.json')), {
      onState: () => undefined,
      onArrived: (item) => this.arrived.push(item),
    })

    inbox.routes = {
      tasks,
      sendToChat: () => Promise.resolve(false),
      trust: () => Promise.resolve(),
      openPath: () => Promise.resolve(true),
      openUrl: () => true,
    }
    tasks.inbox = inbox
    tasks.restoreGoals()

    return { tasks, inbox, book, goalBook }
  }

  async saved(tasks: TaskService, patch: Partial<TaskDraft> = {}): Promise<string> {
    const result = await tasks.save(this.draft(patch))

    if (!result.ok) throw new Error(result.code)

    return result.taskId
  }
}

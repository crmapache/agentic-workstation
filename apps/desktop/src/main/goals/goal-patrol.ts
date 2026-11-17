import type { GoalWait, GoalWatch } from '@shared/goals'
import type { Task, TaskRun } from '@shared/tasks'

import { WAKE_NOTES } from './goal-briefing'
import { limitOf, isTimeUp, dueWatches } from './goal-clock'
import type { GoalDesk } from './goal-desk'
import { withEvent } from './goal-parse'
import { clip, checkWatch, watchLabel } from './goal-watch'
import type { GoalProbe, WatchCheck, GoalChecker } from './goal-watch'

/** Сколько поручений проверяется разом: дешёвая модель - процесс CLI, их не плодить. */
const CHECKS_PARALLEL = 2

/** Поручение словами для дешёвой модели: имя и начало текста. */
const goalWords = (task: Task) => `${task.name}: ${clip(task.prompt, 1_500)}`

/** Что патрулю нужно: спящие прогоны, их задания и чем проверять. */
export type GoalPatrolHost = {
  runs: () => readonly TaskRun[]
  task: (taskId: string) => Task | undefined
  probe: GoalProbe
  checker: GoalChecker
}

/**
 * Патруль поручений (ADR 0080): на такте часов спящие жизни проверяются - пределы, срок,
 * сторожа. Сторож без перемен не стоит ни цента; перемену судит дешёвая модель; настоящее
 * событие будит рабочую модель через стол поручений.
 */
export class GoalPatrol {
  /** Жизни, чьи сторожа проверяются сейчас: такт их не трогает, остановка - обрывает. */
  private readonly checking = new Map<string, AbortController>()

  constructor(
    private readonly desk: GoalDesk,
    private readonly host: GoalPatrolHost,
  ) {}

  tick(now: number): void {
    for (const run of this.host.runs()) {
      if (run.state !== 'sleeping' || this.checking.has(run.id)) continue

      const task = this.host.task(run.taskId)
      const life = this.desk.life(run.id)
      const wait = life?.wait

      if (task?.kind !== 'goal' || !life || !wait) continue

      const limit = limitOf(task.goal, run, life, now, false)

      if (limit) {
        this.desk.endForLimit(run, life, limit)
        continue
      }

      if (isTimeUp(wait, now)) {
        void this.desk.wake(run, wait.note || WAKE_NOTES.timeUp(wait.until), 'time')
        continue
      }

      const due = dueWatches(wait, now)

      if (due.length > 0 && this.checking.size < CHECKS_PARALLEL)
        void this.patrol(run, task, wait, due)
    }
  }

  /** Жизнь кончилась или её разбудили: её проверки больше не нужны. */
  stop(runId: string): void {
    this.checking.get(runId)?.abort()
    this.checking.delete(runId)
  }

  shutdown(): void {
    for (const controller of this.checking.values()) controller.abort()

    this.checking.clear()
  }

  private async patrol(run: TaskRun, task: Task, wait: GoalWait, due: readonly GoalWatch[]) {
    const controller = new AbortController()

    this.checking.set(run.id, controller)

    try {
      for (const watch of due) {
        const check = await checkWatch(watch, {
          goal: goalWords(task),
          reason: wait.reason,
          projectPath: run.projectPath,
          probe: this.host.probe,
          checker: this.host.checker,
          now: Date.now,
          signal: controller.signal,
        })

        // Жизнь разбудили или остановили посреди проверки - её итог уже ни к чему.
        if (controller.signal.aborted || !this.apply(run, wait, check)) return

        if (check.wake) {
          const note =
            check.wake.kind === 'changed'
              ? WAKE_NOTES.changed(watchLabel(watch), check.wake.text)
              : WAKE_NOTES.watchFailed(watchLabel(watch), check.wake.text)

          await this.desk.wake(run, note, 'watch')

          return
        }
      }
    } catch (error) {
      console.warn('[goals] проверка поручения упала:', error)
    } finally {
      if (this.checking.get(run.id) === controller) this.checking.delete(run.id)
    }
  }

  /** Итог проверки - в жизнь, если она спит тем же сном; false - сон уже другой. */
  private apply(run: TaskRun, wait: GoalWait, check: WatchCheck): boolean {
    let same = false

    this.desk.edit(run.id, (life) => {
      if (life.wait?.since !== wait.since) return life

      same = true

      const watches = life.wait.watches.map((one) =>
        one.id === check.watch.id ? check.watch : one,
      )
      const next = {
        ...life,
        wait: { ...life.wait, watches },
        checksUsd: life.checksUsd + check.costUsd,
      }

      return check.event
        ? withEvent(next, check.event.kind, check.event.text, Date.now(), check.costUsd)
        : next
    })

    return same
  }
}

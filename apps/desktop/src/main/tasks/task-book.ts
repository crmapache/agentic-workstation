import type { Task, TaskRun } from '@shared/tasks'
import { isRunLive } from '@shared/tasks'

import type { JsonFile } from '../storage/json-file'
import { runOf, taskOf } from './task-parse'

/** Сколько прогонов помнить на задание: история, а не архив. */
export const RUNS_PER_TASK = 30

/** Пропусков помнить меньше и отдельно: ежечасный пропуск не должен вытеснять прогоны. */
export const SKIPS_PER_TASK = 10

export type StoredTasks = { tasks: Task[]; runs: TaskRun[] }

/**
 * Новейшие прогоны каждого задания, новые первыми: RUNS_PER_TASK настоящих и SKIPS_PER_TASK
 * пропусков. Идущий прогон не выбрасывается никогда - его ждут ответ, остановка и уведомление.
 */
export const keepRuns = (runs: readonly TaskRun[]): TaskRun[] => {
  const counted = new Map<string, number>()

  return [...runs]
    .sort((left, right) => right.startedAt - left.startedAt)
    .filter((run) => {
      if (isRunLive(run.state)) return true

      const skipped = run.state === 'skipped'
      const key = `${run.taskId}:${skipped ? 'skip' : 'run'}`
      const seen = counted.get(key) ?? 0

      counted.set(key, seen + 1)

      return seen < (skipped ? SKIPS_PER_TASK : RUNS_PER_TASK)
    })
}

/**
 * Прогон, который шёл, когда IDE закрылась: его процесса больше нет. Он остановлен с причиной -
 * уведомление предложит продолжить разговор.
 */
export const settleInterrupted = (run: TaskRun): TaskRun =>
  isRunLive(run.state)
    ? {
        ...run,
        state: 'stopped',
        failure: 'ideClosed',
        endedAt: run.updatedAt || run.startedAt,
        asking: 0,
      }
    : run

/**
 * Задания и их прогоны в памяти и одним файлом в userData (`tasks.json`). Запись - по очереди:
 * быстрые правки подряд не перегоняют друг друга, на диске всегда последнее.
 */
export class TaskBook {
  private writing: Promise<boolean> = Promise.resolve(true)

  private constructor(
    private readonly file: JsonFile<StoredTasks>,
    public tasks: Task[],
    public runs: TaskRun[],
  ) {}

  static async load(
    file: JsonFile<StoredTasks>,
  ): Promise<{ book: TaskBook; interrupted: TaskRun[] }> {
    const raw = (await file.read()) as Partial<Record<keyof StoredTasks, unknown>> | null
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks.flatMap((one) => taskOf(one) ?? []) : []
    const stored = Array.isArray(raw?.runs) ? raw.runs.flatMap((one) => runOf(one) ?? []) : []
    const interrupted = stored.filter((run) => isRunLive(run.state)).map(settleInterrupted)
    const runs = keepRuns(stored.map(settleInterrupted))
    const book = new TaskBook(file, tasks, runs)

    if (interrupted.length > 0) await book.save()

    return { book, interrupted }
  }

  task(id: string): Task | undefined {
    return this.tasks.find((task) => task.id === id)
  }

  run(id: string): TaskRun | undefined {
    return this.runs.find((run) => run.id === id)
  }

  putTask(task: Task): Promise<boolean> {
    const at = this.tasks.findIndex((one) => one.id === task.id)

    this.tasks =
      at < 0 ? [...this.tasks, task] : this.tasks.map((one, i) => (i === at ? task : one))

    return this.save()
  }

  removeTask(id: string): Promise<boolean> {
    this.tasks = this.tasks.filter((task) => task.id !== id)

    return this.save()
  }

  putRun(run: TaskRun): Promise<boolean> {
    this.runs = keepRuns([run, ...this.runs.filter((one) => one.id !== run.id)])

    return this.save()
  }

  /** Записать как есть; false - запись не удалась (состояние в памяти уже новое). */
  save(): Promise<boolean> {
    const snapshot: StoredTasks = { tasks: this.tasks, runs: this.runs }

    this.writing = this.writing.then(() =>
      this.file.write(snapshot).then(
        () => true,
        (error: unknown) => {
          console.warn('[tasks] задания не записались:', error)

          return false
        },
      ),
    )

    return this.writing
  }
}

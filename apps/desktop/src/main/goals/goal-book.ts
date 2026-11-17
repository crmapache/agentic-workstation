import type { GoalLife } from '@shared/goals'

import type { JsonFile } from '../storage/json-file'
import { lifeOf } from './goal-parse'

export type StoredGoals = { lives: GoalLife[] }

/**
 * Жизни поручений (ADR 0080) в памяти и одним файлом в userData (`goals.json`): журнал модели,
 * сон, сторожа с отпечатками, главы, расходы на проверки. Прогон поручения - в книге заданий,
 * здесь - то, чего у прогона по расписанию нет. Запись - по очереди, на диске всегда последнее.
 */
export class GoalBook {
  private writing: Promise<boolean> = Promise.resolve(true)

  private constructor(
    private readonly file: JsonFile<StoredGoals>,
    private lives: GoalLife[],
  ) {}

  static async load(file: JsonFile<StoredGoals>): Promise<GoalBook> {
    const raw = (await file.read()) as { lives?: unknown } | null
    const lives = Array.isArray(raw?.lives) ? raw.lives.flatMap((one) => lifeOf(one) ?? []) : []

    return new GoalBook(file, lives)
  }

  get all(): readonly GoalLife[] {
    return this.lives
  }

  life(runId: string): GoalLife | undefined {
    return this.lives.find((life) => life.runId === runId)
  }

  put(life: GoalLife): Promise<boolean> {
    const at = this.lives.findIndex((one) => one.runId === life.runId)

    this.lives =
      at < 0 ? [...this.lives, life] : this.lives.map((one, i) => (i === at ? life : one))

    return this.save()
  }

  /** Поправить жизнь, если она есть; нет - ничего (прогон уже забыт). */
  edit(runId: string, change: (life: GoalLife) => GoalLife): GoalLife | null {
    const life = this.life(runId)

    if (!life) return null

    const next = change(life)

    void this.put(next)

    return next
  }

  /** Забыть жизни, чьих прогонов книга заданий уже не помнит. */
  keepOnly(runIds: ReadonlySet<string>): void {
    const kept = this.lives.filter((life) => runIds.has(life.runId))

    if (kept.length === this.lives.length) return

    this.lives = kept
    void this.save()
  }

  private save(): Promise<boolean> {
    const snapshot: StoredGoals = { lives: this.lives }

    this.writing = this.writing.then(() =>
      this.file.write(snapshot).then(
        () => true,
        (error: unknown) => {
          console.warn('[goals] поручения не записались:', error)

          return false
        },
      ),
    )

    return this.writing
  }
}

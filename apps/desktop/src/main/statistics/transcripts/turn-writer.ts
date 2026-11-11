import type { DatabaseSync, StatementSync } from 'node:sqlite'

import type { TurnStart, SessionSpan } from './turn-estimate'
import { estimateTurns } from './turn-estimate'

type ExactTurn = { started_at: number; ended_at: number }

/**
 * Оценочные ходы сессии: отрезки всех её файлов и начала ходов - в куски ходов
 * (turn-estimate.ts). Ходы, отмеренные живыми часами IDE (exact = 1), главнее оценки: кусок,
 * задевающий такой ход той же сессии, не пишется. Транзакцию держит вызывающий.
 */
export class TurnWriter {
  private readonly spansOf: StatementSync
  private readonly startsOf: StatementSync
  private readonly exactOf: StatementSync
  private readonly drop: StatementSync
  private readonly insert: StatementSync

  constructor(db: DatabaseSync) {
    this.spansOf = db.prepare('SELECT start, end, place FROM spans WHERE session = ?')
    this.startsOf = db.prepare('SELECT ts, human FROM prompts WHERE session = ?')
    this.exactOf = db.prepare(
      'SELECT started_at, ended_at FROM turns WHERE session = ? AND exact = 1',
    )
    this.drop = db.prepare('DELETE FROM turns WHERE session = ? AND exact = 0')
    this.insert = db.prepare(`
      INSERT INTO turns (key, session, place, started_at, ended_at, work_ms, exact)
      VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(key) DO NOTHING`)
  }

  recompute(session: number): void {
    const spans = this.spansOf.all(session) as SessionSpan[]
    const starts = (this.startsOf.all(session) as { ts: number; human: number }[]).map(
      (row): TurnStart => ({ ts: row.ts, human: row.human === 1 }),
    )
    const exact = this.exactOf.all(session) as ExactTurn[]

    this.drop.run(session)

    for (const segment of estimateTurns(spans, starts)) {
      const covered = exact.some(
        (turn) => segment.start < turn.ended_at && segment.end > turn.started_at,
      )

      if (covered) continue

      this.insert.run(
        `e:${session}:${segment.start}`,
        session,
        segment.place,
        segment.start,
        segment.end,
        segment.end - segment.start,
      )
    }
  }
}

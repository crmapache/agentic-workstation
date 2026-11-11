import type { ProviderId } from '@shared/providers'
import type {
  StatsTurnNote,
  StatsManualNote,
  StatsPresenceNote,
  StatsIdeSessionKind,
  StatsPermissionNote,
  StatsScenarioRunNote,
} from '@shared/statistics'

import { inTransaction } from '../stats-db'
import { keyOf } from '../stats-keys'
import type { StatsStore } from '../stats-store'

/** Живое событие IDE: панель, сценарии, окно. */
export type LiveNote =
  | {
      kind: 'ideSession'
      provider: ProviderId
      session: string
      ideKind: StatsIdeSessionKind
      at: number
    }
  | { kind: 'turn'; note: StatsTurnNote }
  | { kind: 'permission'; note: StatsPermissionNote }
  | { kind: 'presence'; entries: StatsPresenceNote[] }
  | { kind: 'manual'; rows: StatsManualNote[] }
  | { kind: 'scenarioRun'; note: StatsScenarioRunNote }

/** Неотрицательное конечное число; остальное - ноль: кривой счётчик не портит сумму. */
const amount = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0)

const minuteOf = (value: number): number | null =>
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : null

/**
 * Запись живых событий. Транскрипт знает не всё: точное время хода (без ожидания человека)
 * знают часы панели и сценариев, присутствие и правки руками - только окно, а какие сессии
 * запускала IDE - только сама IDE.
 */
export class LiveNotes {
  constructor(private readonly store: StatsStore) {}

  write(note: LiveNote): void {
    inTransaction(this.store.db, () => {
      if (note.kind === 'ideSession') this.ideSession(note)
      else if (note.kind === 'turn') this.turn(note.note)
      else if (note.kind === 'permission') this.permission(note.note)
      else if (note.kind === 'presence') this.presence(note.entries)
      else if (note.kind === 'manual') this.manual(note.rows)
      else this.scenarioRun(note.note)
    })
  }

  /** Папка проекта окна: её проект известен сразу, не ждёт разбора путей. */
  private projectPlace(project: string): number | null {
    const place = this.store.placeId(project)

    if (place !== null) {
      this.store.db
        .prepare('UPDATE places SET project = ? WHERE id = ? AND project IS NULL')
        .run(project, place)
    }

    return place
  }

  /** Сессия сценария остаётся сценарием, даже если её потом открыли в панели. */
  private ideSession(note: Extract<LiveNote, { kind: 'ideSession' }>) {
    this.store.db
      .prepare(
        `INSERT INTO sessions (uuid, provider, ide_kind, ide_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET
           ide_kind = CASE WHEN ide_kind = 'scenario' THEN ide_kind ELSE excluded.ide_kind END,
           ide_seen_at = max(coalesce(ide_seen_at, 0), excluded.ide_seen_at)`,
      )
      .run(note.session, note.provider, note.ideKind, note.at)
  }

  /**
   * Ход по живым часам. Оценка того же отрезка из транскрипта стирается: она длиннее (в ней
   * ожидание ответа на вопросы) и посчитала бы ход второй раз.
   */
  private turn(note: StatsTurnNote) {
    const start = Math.min(note.startedAt, note.endedAt)
    const end = Math.max(note.startedAt, note.endedAt)
    const session = this.store.sessionId(note.session, note.provider)
    const db = this.store.db

    db.prepare(
      'DELETE FROM turns WHERE session = ? AND exact = 0 AND started_at < ? AND ended_at > ?',
    ).run(session, end, start)
    db.prepare(
      `INSERT INTO turns (key, session, place, started_at, ended_at, work_ms, exact)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET ended_at = excluded.ended_at, work_ms = excluded.work_ms`,
    ).run(
      `x:${session}:${start}`,
      session,
      this.projectPlace(note.project),
      start,
      end,
      Math.min(amount(note.workMs), end - start),
    )
  }

  /** Ключ - id вызова, как у той же записи транскрипта: решение не посчитается дважды. */
  private permission(note: StatsPermissionNote) {
    const key = keyOf(note.toolUseId ?? `live\n${note.session}\n${note.at}`)

    this.store.db
      .prepare(
        `INSERT INTO permissions (key, file, ts, place, session, decision) VALUES (?, NULL, ?, ?, ?, ?)
         ON CONFLICT(key) DO NOTHING`,
      )
      .run(
        key,
        note.at,
        this.projectPlace(note.project),
        this.store.sessionId(note.session, note.provider),
        note.decision === 'deny' ? 'deny' : 'allow',
      )
  }

  private presence(entries: readonly StatsPresenceNote[]) {
    const insert = this.store.db.prepare(
      'INSERT INTO presence (minute, place) VALUES (?, ?) ON CONFLICT DO NOTHING',
    )

    for (const entry of entries) {
      const minute = minuteOf(entry.minute)
      const place = this.projectPlace(entry.project)

      if (minute !== null && place !== null) insert.run(minute, place)
    }
  }

  /** Пачки окна складываются: за одну минуту их может прийти две (уход из окна и таймер). */
  private manual(rows: readonly StatsManualNote[]) {
    const upsert = this.store.db.prepare(
      `INSERT INTO manual (minute, place, ext, typed, pasted, added, removed)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(minute, place, ext) DO UPDATE SET typed = typed + excluded.typed,
         pasted = pasted + excluded.pasted, added = added + excluded.added,
         removed = removed + excluded.removed`,
    )

    for (const row of rows) {
      const minute = minuteOf(row.minute)
      const place = this.projectPlace(row.project)

      if (minute === null || place === null) continue

      upsert.run(
        minute,
        place,
        row.ext.toLowerCase(),
        amount(row.typed),
        amount(row.pasted),
        amount(row.added),
        amount(row.removed),
      )
    }
  }

  private scenarioRun(note: StatsScenarioRunNote) {
    this.store.db
      .prepare(
        `INSERT INTO scenario_runs (run_id, provider, place, scenario, started_at, ended_at, state,
           cost, tokens, active_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET ended_at = excluded.ended_at, state = excluded.state,
           cost = excluded.cost, tokens = excluded.tokens, active_ms = excluded.active_ms`,
      )
      .run(
        note.runId,
        note.provider,
        this.projectPlace(note.project),
        note.scenario,
        note.startedAt,
        note.endedAt,
        note.state,
        amount(note.cost),
        amount(note.tokens),
        amount(note.activeMs),
      )
  }
}

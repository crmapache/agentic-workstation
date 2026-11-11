import type { DatabaseSync, StatementSync } from 'node:sqlite'

/**
 * Словари базы: папки (places) и сессии - целыми id. Записей сотни тысяч, а разных папок и
 * сессий - сотни и тысячи: строка пути или uuid в каждой записи раздула бы базу вдесятеро.
 * Кэш в памяти - чтобы каждая строка транскрипта не спрашивала базу.
 */
export class StatsStore {
  private readonly places = new Map<string, number>()
  private readonly sessions = new Map<string, number>()
  private readonly insertPlace: StatementSync
  private readonly insertSession: StatementSync

  constructor(readonly db: DatabaseSync) {
    this.insertPlace = db.prepare(
      'INSERT INTO places (path) VALUES (?) ON CONFLICT(path) DO UPDATE SET path = excluded.path RETURNING id',
    )
    this.insertSession = db.prepare(
      'INSERT INTO sessions (uuid, provider) VALUES (?, ?) ON CONFLICT(uuid) DO UPDATE SET uuid = excluded.uuid RETURNING id',
    )
  }

  /**
   * Забыть кэш: транзакция, в которой вставились новые папки и сессии, откатилась, и их id
   * в памяти больше не существуют в базе.
   */
  resetCache(): void {
    this.places.clear()
    this.sessions.clear()
  }

  /** id папки; пустой путь (строка без cwd) - null: проект не определить. */
  placeId(path: string): number | null {
    if (!path) return null

    const known = this.places.get(path)

    if (known !== undefined) return known

    const row = this.insertPlace.get(path) as { id: number }

    this.places.set(path, row.id)

    return row.id
  }

  sessionId(uuid: string, provider: string): number {
    const known = this.sessions.get(uuid)

    if (known !== undefined) return known

    const row = this.insertSession.get(uuid, provider) as { id: number }

    this.sessions.set(uuid, row.id)

    return row.id
  }
}

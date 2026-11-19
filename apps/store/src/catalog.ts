import type { DatabaseSync } from 'node:sqlite'

import type {
  Publisher,
  ListingPage,
  ListingSort,
  ListingDetail,
  ListingSummary,
  ListingVersion,
} from '@agentic-workstation/store-protocol/api'
import type { KnownPermission } from '@agentic-workstation/store-protocol/package-format'

import { publisherId } from './auth.ts'

type Row = Record<string, unknown>

const text = (row: Row, column: string): string => {
  const value = row[column]

  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}
const count = (row: Row, column: string): number => Number(row[column] ?? 0)
const list = <T>(row: Row, column: string): T[] => JSON.parse(text(row, column) || '[]') as T[]

/** Средняя оценка с одним знаком после точки; нет оценок - ноль. */
const average = (row: Row): number => {
  const ratings = count(row, 'rating_count')

  return ratings ? Math.round((count(row, 'rating_sum') / ratings) * 10) / 10 : 0
}

const ORDER: Record<ListingSort, string> = {
  popular: 'installs DESC, updated_at DESC',
  // Средняя с поправкой на число оценок: одна пятёрка не обгоняет сотню четвёрок.
  rating: '(rating_sum + 3.0 * 3) / (rating_count + 3) DESC, rating_count DESC',
  new: 'created_at DESC',
}

/**
 * Каталог магазина для чтения: список с поиском и порядком, расширение целиком, текст пакета
 * версии. Спрятанное модерацией или владельцем не видно никому.
 */
export class Catalog {
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  publisher(key: string): Publisher {
    const row = this.db.prepare('SELECT id, name FROM publishers WHERE key = ?').get(key) as
      Row | undefined

    return row
      ? { id: text(row, 'id'), name: text(row, 'name') }
      : { id: publisherId(key), name: '' }
  }

  /** Свежие сводки названных расширений: IDE так узнаёт, вышли ли обновления у установленных. */
  pick(ids: readonly string[]): ListingSummary[] {
    if (ids.length === 0) return []

    const rows = this.db
      .prepare(
        `SELECT * FROM extensions WHERE hidden = 0 AND id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids) as Row[]

    return rows.map((row) => this.summaryOf(row))
  }

  page(query: { q: string; sort: ListingSort; offset: number; limit: number }): ListingPage {
    const pattern = `%${query.q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`
    const where =
      "hidden = 0 AND (? = '%%' OR id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
    const params = [pattern, pattern, pattern, pattern]
    const total = count(
      this.db
        .prepare(`SELECT COUNT(*) AS total FROM extensions WHERE ${where}`)
        .get(...params) as Row,
      'total',
    )
    const rows = this.db
      .prepare(
        `SELECT * FROM extensions WHERE ${where} ORDER BY ${ORDER[query.sort]} LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset) as Row[]

    return { items: rows.map((row) => this.summaryOf(row)), total }
  }

  detail(id: string): ListingDetail | null {
    const row = this.db.prepare('SELECT * FROM extensions WHERE id = ? AND hidden = 0').get(id) as
      Row | undefined

    if (!row) return null

    const versions = (
      this.db
        .prepare('SELECT * FROM versions WHERE extension_id = ? ORDER BY published_at DESC')
        .all(id) as Row[]
    ).map((version): ListingVersion => ({
      version: text(version, 'version'),
      publishedAt: count(version, 'published_at'),
      digest: text(version, 'digest'),
      size: count(version, 'size'),
      permissions: list<KnownPermission>(version, 'permissions'),
      hosts: list<string>(version, 'hosts'),
      commands: list<string>(version, 'commands'),
    }))
    const ratings: ListingDetail['ratings'] = [0, 0, 0, 0, 0]

    for (const stars of this.db
      .prepare(
        'SELECT rating, COUNT(*) AS total FROM reviews WHERE extension_id = ? GROUP BY rating',
      )
      .all(id) as Row[]) {
      const index = count(stars, 'rating') - 1

      if (index >= 0 && index < 5) ratings[index] = count(stars, 'total')
    }

    return {
      ...this.summaryOf(row),
      readme: text(row, 'readme'),
      createdAt: count(row, 'created_at'),
      versions,
      ratings,
    }
  }

  /** Текст пакета версии и его отпечаток; нет версии или расширение спрятано - null. */
  package(id: string, version: string): { text: string; digest: string } | null {
    const row = this.db
      .prepare(
        'SELECT v.package, v.digest FROM versions v JOIN extensions e ON e.id = v.extension_id WHERE v.extension_id = ? AND v.version = ? AND e.hidden = 0',
      )
      .get(id, version) as Row | undefined

    return row ? { text: text(row, 'package'), digest: text(row, 'digest') } : null
  }

  private summaryOf(row: Row): ListingSummary {
    return {
      id: text(row, 'id'),
      name: text(row, 'name'),
      description: text(row, 'description'),
      icon: text(row, 'icon'),
      version: text(row, 'latest'),
      publisher: this.publisher(text(row, 'owner_key')),
      rating: { average: average(row), count: count(row, 'rating_count') },
      installs: count(row, 'installs'),
      permissions: list<KnownPermission>(row, 'permissions'),
      updatedAt: count(row, 'updated_at'),
    }
  }
}

import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type { Published, ReviewPage, StoreErrorCode } from '@agentic-workstation/store-protocol/api'
import {
  checkPackage,
  canonicalJson,
  compareVersions,
} from '@agentic-workstation/store-protocol/package-format'

import type { Signer } from './auth.ts'

type Row = Record<string, unknown>

/** Отказ записи: код для IDE и слова для её журнала. */
export class LedgerError extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const NAME = /^[\p{L}\p{N} ._'-]{2,40}$/u

/**
 * Записи магазина: издатель по ключу, публикация версии, установка, отзыв, жалоба, сокрытие.
 * Каждая проверяет право сама: владелец расширения - ключ, который его первым опубликовал.
 */
export class Ledger {
  private readonly db: DatabaseSync
  private readonly now: () => number

  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.db = db
    this.now = now
  }

  /** Издатель по ключу: первая подпись заводит его с именем по умолчанию. */
  ensurePublisher(signer: Signer): void {
    this.db
      .prepare('INSERT OR IGNORE INTO publishers (key, id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(signer.key, signer.id, `Author ${signer.id.slice(0, 4)}`, this.now())
  }

  rename(signer: Signer, name: string): void {
    const clean = name.trim()

    if (!NAME.test(clean))
      throw new LedgerError('bad-request', "A name is 2-40 letters, digits, spaces or ._'-")

    this.ensurePublisher(signer)
    this.db.prepare('UPDATE publishers SET name = ? WHERE key = ?').run(clean, signer.key)
  }

  /** Новая версия: пакет проверен, версия выше прошлой, расширение - этого ключа или ничьё. */
  publish(signer: Signer, id: string, body: unknown): Published {
    const check = checkPackage(body)

    if (!check.ok) throw new LedgerError('bad-request', check.reason)

    const { summary, pkg } = check

    if (summary.id !== id)
      throw new LedgerError('bad-request', 'The manifest id does not match the address.')

    this.ensurePublisher(signer)

    const existing = this.db
      .prepare('SELECT owner_key, latest FROM extensions WHERE id = ?')
      .get(id) as Row | undefined

    if (existing && existing['owner_key'] !== signer.key) {
      throw new LedgerError('not-owner', `"${id}" belongs to another publisher.`)
    }

    if (existing && compareVersions(summary.version, String(existing['latest'])) <= 0) {
      throw new LedgerError(
        'version-exists',
        `Version ${summary.version} is not newer than ${String(existing['latest'])}.`,
      )
    }

    const text = canonicalJson(pkg)
    const digest = createHash('sha256').update(text).digest('hex')
    const now = this.now()
    const permissions = JSON.stringify(summary.permissions)

    this.db.exec('BEGIN')

    try {
      if (existing) {
        this.db
          .prepare(
            'UPDATE extensions SET name = ?, description = ?, icon = ?, latest = ?, readme = ?, permissions = ?, hidden = 0, updated_at = ? WHERE id = ?',
          )
          .run(
            summary.name,
            summary.description,
            summary.icon,
            summary.version,
            summary.readme,
            permissions,
            now,
            id,
          )
      } else {
        this.db
          .prepare(
            'INSERT INTO extensions (id, owner_key, name, description, icon, latest, readme, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            id,
            signer.key,
            summary.name,
            summary.description,
            summary.icon,
            summary.version,
            summary.readme,
            permissions,
            now,
            now,
          )
      }

      this.db
        .prepare(
          'INSERT INTO versions (extension_id, version, digest, size, package, permissions, hosts, commands, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          summary.version,
          digest,
          text.length,
          text,
          permissions,
          JSON.stringify(summary.hosts),
          JSON.stringify(summary.commands),
          now,
        )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    return { id, version: summary.version, digest }
  }

  /** Установка ключом: считается один раз на ключ; дальше обновляет версию. */
  install(signer: Signer, id: string, version: string): void {
    this.assertListed(id)

    const known = this.db
      .prepare('SELECT 1 FROM installs WHERE extension_id = ? AND key = ?')
      .get(id, signer.key)

    this.db
      .prepare(
        'INSERT INTO installs (extension_id, key, version, at) VALUES (?, ?, ?, ?) ON CONFLICT (extension_id, key) DO UPDATE SET version = excluded.version, at = excluded.at',
      )
      .run(id, signer.key, version.slice(0, 40), this.now())

    if (!known)
      this.db.prepare('UPDATE extensions SET installs = installs + 1 WHERE id = ?').run(id)
  }

  /** Отзыв: один на ключ, только у того, кто ставил, и не у своего расширения. */
  review(signer: Signer, id: string, rating: number, text: string): void {
    const listing = this.assertListed(id)

    if (listing['owner_key'] === signer.key)
      throw new LedgerError('own-extension', 'You cannot rate your own extension.')

    const installed = this.db
      .prepare('SELECT version FROM installs WHERE extension_id = ? AND key = ?')
      .get(id, signer.key) as Row | undefined

    if (!installed)
      throw new LedgerError('not-installed', 'Install the extension before rating it.')
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new LedgerError('bad-request', 'Rating is 1-5.')

    this.ensurePublisher(signer)

    const now = this.now()

    this.db
      .prepare(
        'INSERT INTO reviews (extension_id, key, rating, text, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (extension_id, key) DO UPDATE SET rating = excluded.rating, text = excluded.text, version = excluded.version, updated_at = excluded.updated_at',
      )
      .run(
        id,
        signer.key,
        rating,
        text.trim().slice(0, 2000),
        String(installed['version']),
        now,
        now,
      )
    this.recount(id)
  }

  unreview(signer: Signer, id: string): void {
    this.db.prepare('DELETE FROM reviews WHERE extension_id = ? AND key = ?').run(id, signer.key)
    this.recount(id)
  }

  reviews(id: string, offset: number, limit: number): ReviewPage {
    const total = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) AS total FROM reviews WHERE extension_id = ?')
          .get(id) as Row
      )['total'],
    )
    const rows = this.db
      .prepare(
        'SELECT r.*, p.id AS author_id, p.name AS author_name FROM reviews r JOIN publishers p ON p.key = r.key WHERE r.extension_id = ? ORDER BY r.updated_at DESC LIMIT ? OFFSET ?',
      )
      .all(id, limit, offset) as Row[]

    return {
      total,
      items: rows.map((row) => ({
        author: { id: String(row['author_id']), name: String(row['author_name']) },
        rating: Number(row['rating']),
        text: String(row['text']),
        version: String(row['version']),
        createdAt: Number(row['created_at']),
        updatedAt: Number(row['updated_at']),
      })),
    }
  }

  report(signer: Signer, id: string, reason: string): void {
    this.assertListed(id)
    this.db
      .prepare('INSERT INTO reports (extension_id, key, reason, at) VALUES (?, ?, ?, ?)')
      .run(id, signer.key, reason.trim().slice(0, 2000), this.now())
  }

  /** Спрятать: владелец - своё, модерация - любое. Версии остаются, публикация вернёт его. */
  hide(id: string, signer: Signer | null): void {
    const listing = this.assertListed(id)

    if (signer && listing['owner_key'] !== signer.key)
      throw new LedgerError('not-owner', 'Only the publisher can unpublish it.')

    this.db.prepare('UPDATE extensions SET hidden = 1 WHERE id = ?').run(id)
  }

  private recount(id: string) {
    this.db
      .prepare(
        'UPDATE extensions SET rating_sum = (SELECT COALESCE(SUM(rating), 0) FROM reviews WHERE extension_id = ?), rating_count = (SELECT COUNT(*) FROM reviews WHERE extension_id = ?) WHERE id = ?',
      )
      .run(id, id, id)
  }

  private assertListed(id: string): Row {
    const row = this.db
      .prepare('SELECT owner_key FROM extensions WHERE id = ? AND hidden = 0')
      .get(id) as Row | undefined

    if (!row) throw new LedgerError('not-found', `No extension "${id}" in the store.`)

    return row
  }
}

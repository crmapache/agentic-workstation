import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { it, expect, describe, afterEach } from 'vitest'

import { migrate, readMeta, writeMeta, openStatsDb, SCHEMA_VERSION } from './stats-db'

const dirs: string[] = []

const tempPath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'stats-db-'))

  dirs.push(dir)

  return join(dir, 'nested', 'statistics.sqlite')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('openStatsDb', () => {
  it('creates the file with the current schema in WAL mode', () => {
    const db = openStatsDb(tempPath())
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number }
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }

    expect(version.user_version).toBe(SCHEMA_VERSION)
    expect(mode.journal_mode).toBe('wal')
    db.close()
  })

  it('reopens an existing base without re-running migrations', () => {
    const path = tempPath()
    const first = openStatsDb(path)

    writeMeta(first, 'probe', '1')
    first.close()

    const second = openStatsDb(path)

    expect(readMeta(second, 'probe')).toBe('1')
    second.close()
  })

  it('refuses a base from a newer schema', () => {
    const db = new DatabaseSync(':memory:')

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`)
    expect(() => migrate(db)).toThrow(/newer/)
    db.close()
  })
})

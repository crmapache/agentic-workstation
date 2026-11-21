import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { it, expect, afterEach } from 'vitest'

import { openDatabase, DATABASE_FILE } from './db.ts'

/** Схема прежнего сервера: у аккаунта ещё нет суммы длин шифра. */
const OLD_SCHEMA = `
CREATE TABLE accounts (
  key TEXT PRIMARY KEY,
  rev INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE records (
  account TEXT NOT NULL REFERENCES accounts(key),
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account, id)
);
`

let dataDir = ''

afterEach(() => rmSync(dataDir, { recursive: true, force: true }))

it('база прежнего сервера догоняет схему: сумма шифра посчитана, пустые аккаунты ушли', () => {
  dataDir = mkdtempSync(join(tmpdir(), 'aw-cloud-db-'))

  const old = new DatabaseSync(join(dataDir, DATABASE_FILE))

  old.exec(OLD_SCHEMA)
  old.exec(`
    INSERT INTO accounts (key, rev, records, created_at, seen_at) VALUES ('used', 2, 2, 1, 1);
    INSERT INTO accounts (key, rev, records, created_at, seen_at) VALUES ('pulled-only', 0, 0, 1, 1);
    INSERT INTO records VALUES ('used', 'record-0001', 1, 'AAAA', 1);
    INSERT INTO records VALUES ('used', 'record-0002', 2, 'BBBBBB', 1);
  `)
  old.close()

  for (let round = 0; round < 2; round += 1) {
    const db = openDatabase(dataDir)

    expect(db.prepare('SELECT key, bytes FROM accounts').all()).toEqual([
      { key: 'used', bytes: 10 },
    ])
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
    db.close()
  }
})

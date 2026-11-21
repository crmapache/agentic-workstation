import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { DATABASE_FILE } from './db.ts'

/**
 * Снимок базы облака для ежечасного бэкапа сервера: `node src/backup.ts /data/backup.sqlite`.
 * VACUUM INTO - одна транзакция: файл, скопированный снаружи посреди записи, мог бы не открыться
 * (часть данных живёт в WAL), а снимок - цельный. На хосте sqlite3 нет, поэтому снимает сам сервис.
 * В снимке - только шифр записей: ключа к нему у сервера нет, как и у бэкапа.
 */
const target = process.argv[2]

if (!target) {
  console.error('куда класть снимок: node src/backup.ts /data/backup.sqlite')
  process.exit(2)
}

const db = new DatabaseSync(join(process.env['CLOUD_DATA_DIR'] ?? '/data', DATABASE_FILE), {
  readOnly: true,
})

rmSync(target, { force: true })
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
db.close()

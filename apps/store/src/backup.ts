import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Снимок базы магазина для ежечасного бэкапа сервера: `node src/backup.ts /data/backup.sqlite`.
 * VACUUM INTO - одна транзакция: файл, скопированный снаружи посреди записи, мог бы не открыться
 * (часть данных живёт в WAL), а снимок - цельный. На хосте sqlite3 нет, поэтому снимает сам сервис.
 */
const target = process.argv[2]

if (!target) {
  console.error('куда класть снимок: node src/backup.ts /data/backup.sqlite')
  process.exit(2)
}

const db = new DatabaseSync(join(process.env['STORE_DATA_DIR'] ?? '/data', 'store.db'), {
  readOnly: true,
})

rmSync(target, { force: true })
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
db.close()

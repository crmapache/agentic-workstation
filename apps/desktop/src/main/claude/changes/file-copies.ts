import { createHash } from 'node:crypto'
import { open, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isRecord, recordField, stringField, parseCliLine } from '../cli/cli-messages'
import { MAX_FILE_BYTES } from '../../agents/changes/changes.constants'
import { TRANSCRIPT_CHUNK_BYTES, TRANSCRIPT_SCAN_MAX_BYTES } from './changes.constants'

/** Так открывается запись копии CLI в транскрипте: по началу строки, не разбирая остальное. */
const COPY_RECORD = '{"type":"file-history-'

/** Имя копии: первые 16 hex sha256 полного пути и версия. */
const COPY_NAME = /^([0-9a-f]{16})@v\d+$/

/** Ключ копии файла: как CLI называет её в file-history. */
export const copyKey = (path: string): string =>
  createHash('sha256').update(path).digest('hex').slice(0, 16)

/**
 * Копии, которые CLI взял не раньше since (мс), - по ключу файла. CLI копирует
 * отслеживаемые файлы на сообщение человека (file-history-snapshot), а впервые тронутый -
 * перед первой правкой (file-history-delta). Из двух записей одного файла побеждает более
 * поздняя по своему времени, а не по месту: форку CLI дописывает записи источника в момент
 * старта, и они могут лечь после записи его первого хода.
 */
export const copiesTaken = (lines: readonly string[], since: number): Map<string, string> => {
  const taken = new Map<string, { name: string; at: number }>()

  const note = (backup: unknown, stamp: string) => {
    const at = Date.parse(stamp)
    const name = isRecord(backup) ? stringField(backup, 'backupFileName') : ''
    const key = COPY_NAME.exec(name)?.[1]

    if (!key || Number.isNaN(at) || at < since) return
    if ((taken.get(key)?.at ?? -Infinity) <= at) taken.set(key, { name, at })
  }

  for (const line of lines) {
    if (!line.startsWith(COPY_RECORD)) continue

    const record = parseCliLine(line)

    if (record?.type === 'file-history-snapshot') {
      const snapshot = recordField(record, 'snapshot')
      const stamp = stringField(snapshot, 'timestamp')

      for (const backup of Object.values(recordField(snapshot, 'trackedFileBackups'))) {
        note(backup, stamp)
      }
    } else if (record?.type === 'file-history-delta') {
      note(record['backup'], stringField(record, 'timestamp'))
    }
  }

  return new Map([...taken].map(([key, copy]) => [key, copy.name]))
}

const readSlice = async (file: string, start: number, length: number) => {
  const handle = await open(file, 'r')

  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, start)

    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Где в транскрипте начинается ход: начало строки, где anchor встречается впервые. anchor -
 * имя сообщения человека (его строка или снимок копий для него) или, у хода без него, id
 * первого вызова. Ищется с конца кусками: ход - в хвосте, а транскрипт бывает десятками
 * мегабайт.
 */
export const findTurnStart = async (file: string, anchor: string): Promise<number | null> => {
  const size = (await stat(file)).size
  const needle = Buffer.from(`"${anchor}"`)
  let start = size
  let buffer = Buffer.alloc(0)
  let found = false

  while (start > 0 && size - start < TRANSCRIPT_SCAN_MAX_BYTES) {
    const from = Math.max(0, start - TRANSCRIPT_CHUNK_BYTES)

    buffer = Buffer.concat([await readSlice(file, from, start - from), buffer])
    start = from

    // Нашлось - ещё кусок назад: снимок мог лечь прямо перед строкой сообщения.
    if (found) break

    found = buffer.includes(needle)
  }

  const at = buffer.indexOf(needle)

  if (at < 0) return null

  return start + buffer.lastIndexOf(0x0a, at) + 1
}

/** Строки записей копий транскрипта от байта from до конца. */
export const copyRecordsFrom = async (file: string, from: number): Promise<string[]> => {
  const size = (await stat(file)).size
  const start = from <= size ? from : 0

  if (size - start > TRANSCRIPT_SCAN_MAX_BYTES) return []

  return (await readSlice(file, start, size - start))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.startsWith(COPY_RECORD))
}

/** Текст копии CLI (file-history разговора) или null: нет записи, нет файла, слишком большой. */
export const readCopy = async (
  historyDir: string,
  copies: ReadonlyMap<string, string>,
  path: string,
): Promise<string | null> => {
  const name = copies.get(copyKey(path))

  if (!name) return null

  const file = join(historyDir, name)
  const info = await stat(file).catch(() => null)

  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null

  return readFile(file, 'utf8').catch(() => null)
}

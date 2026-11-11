import { open, stat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HistoryEntry } from '@shared/claude'

import { stringField, parseCliLine } from '../cli/cli-messages'
import { hiddenConversations } from './hidden-conversations'
import {
  NEWLINE,
  HEAD_BYTES,
  HISTORY_LIMIT,
  HEAD_MAX_BYTES,
  TAIL_MAX_BYTES,
  TAIL_MIN_LINES,
  TAIL_CHUNK_BYTES,
} from './history.constants'
import { transcriptDirs } from './transcript-paths'
import { dropRewound } from './transcript-rewinds'
import type { TranscriptSummary } from './transcript-summary'
import { summarizeTranscript } from './transcript-summary'

/** Заголовки по файлу: транскрипт не перечитывается, пока не поменялся. */
const summaries = new Map<string, { stamp: string; summary: TranscriptSummary }>()

/** Кусок файла с позиции start длиной length. */
const readSlice = async (file: string, start: number, length: number) => {
  const handle = await open(file, 'r')

  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, start)

    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

const summarize = async (file: string, size: number, stamp: string) => {
  const cached = summaries.get(file)

  if (cached?.stamp === stamp) return cached.summary

  const head = await readSlice(file, 0, Math.min(size, HEAD_BYTES))
  const tail = size > HEAD_BYTES ? await readSlice(file, size - HEAD_BYTES, HEAD_BYTES) : ''
  // Первое сообщение не влезло в начало (картинка в той же строке) - дочитать дальше.
  const summary =
    summarizeTranscript(head, tail) ??
    (size > HEAD_BYTES
      ? summarizeTranscript(await readSlice(file, 0, Math.min(size, HEAD_MAX_BYTES)), tail)
      : null)

  summaries.set(file, { stamp, summary })

  return summary
}

/** Сколько переводов строк в куске. */
const countNewlines = (chunk: Buffer) => {
  let count = 0

  for (
    let index = chunk.indexOf(NEWLINE);
    index !== -1;
    index = chunk.indexOf(NEWLINE, index + 1)
  ) {
    count += 1
  }

  return count
}

/**
 * Прошлые разговоры проекта, свежие первыми. Транскрипт без сообщений человека
 * (CLI запустили и закрыли) в историю не попадает.
 */
export const listHistory = async (
  rootPath: string,
  openSessionIds: ReadonlySet<string>,
): Promise<HistoryEntry[]> => {
  const files: { file: string; sessionId: string; size: number; mtime: number }[] = []
  const hidden = await hiddenConversations(rootPath)

  for (const dir of await transcriptDirs(rootPath)) {
    const names = await readdir(dir).catch(() => [])

    for (const name of names.filter((entry) => entry.endsWith('.jsonl'))) {
      const file = join(dir, name)
      const info = await stat(file).catch(() => null)

      if (info?.isFile() && !hidden.has(name.slice(0, -6))) {
        files.push({ file, sessionId: name.slice(0, -6), size: info.size, mtime: info.mtimeMs })
      }
    }
  }

  files.sort((left, right) => right.mtime - left.mtime)

  const entries: HistoryEntry[] = []

  for (const { file, sessionId, size, mtime } of files) {
    if (entries.length >= HISTORY_LIMIT) break
    if (entries.some((entry) => entry.sessionId === sessionId)) continue

    const summary = await summarize(file, size, `${size}:${mtime}`)

    if (summary) {
      entries.push({
        sessionId,
        title: summary.title,
        updatedAt: mtime,
        isOpen: openSessionIds.has(sessionId),
      })
    }
  }

  return entries
}

/**
 * Строки хвоста транскрипта: файл читается с конца кусками, пока строк не наберётся
 * достаточно, - длинный разговор открывается с последних сообщений, а не читается
 * целиком. Куски склеиваются байтами и декодируются один раз: граница куска может
 * пройти посреди буквы. Первая строка неполного окна обрезана и выбрасывается.
 * complete - прочитано с начала файла: выше ничего нет.
 */
export const readTranscriptTail = async (
  file: string,
): Promise<{ lines: string[]; complete: boolean }> => {
  const handle = await open(file, 'r')

  try {
    const { size } = await handle.stat()
    const chunks: Buffer[] = []
    let position = size
    let newlines = 0

    while (position > 0 && newlines <= TAIL_MIN_LINES && size - position < TAIL_MAX_BYTES) {
      const length = Math.min(TAIL_CHUNK_BYTES, position)
      const chunk = Buffer.alloc(length)

      position -= length
      await handle.read(chunk, 0, length, position)
      chunks.unshift(chunk)
      newlines += countNewlines(chunk)
    }

    const lines = Buffer.concat(chunks).toString('utf8').split('\n')

    return {
      lines: (position > 0 ? lines.slice(1) : lines).filter(Boolean),
      complete: position === 0,
    }
  } finally {
    await handle.close()
  }
}

/** Заголовок прошлого разговора и его ранг по файлу - для вкладки, открытой из истории. */
export const transcriptName = async (file: string): Promise<TranscriptSummary> => {
  const info = await stat(file)

  return summarize(file, info.size, `${info.size}:${info.mtimeMs}`)
}

/** Весь транскрипт строками, без отрезанного откатами: для действий человека (форк). */
export const readTranscriptLines = async (file: string): Promise<string[]> =>
  dropRewound((await readFile(file, 'utf8')).split('\n').filter(Boolean))

/**
 * Строки источника до строки at включительно - всё, что несёт форк, который ещё не
 * родился. Источник после форка мог вырасти сколько угодно - читается весь файл. Точки
 * нет (источник откатили за неё) - нести нечего.
 */
export const readTranscriptUpTo = async (file: string, at: string): Promise<string[]> => {
  const lines = await readTranscriptLines(file)
  const index = lines.findIndex(
    (line) => line.includes(at) && stringField(parseCliLine(line) ?? {}, 'uuid') === at,
  )

  return index === -1 ? [] : lines.slice(0, index + 1)
}

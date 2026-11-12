import { open, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Ответы модели из транскриптов CLI (~/.claude/projects): у каждого ответа есть usage. CLI
 * пишет один ответ несколькими строками - по блоку, с usage на тот момент, так что у первой
 * строки выход неполный, а время строк расходится на минуты; копии одного ответа лежат и в
 * разных файлах (форк, продолжение). Поэтому ответ - пара «id сообщения + id запроса», из
 * его строк берётся наибольший расход и самое раннее время: от порядка чтения итог не зависит.
 */

/** Сколько байт читать за раз: строки транскрипта бывают длинными (вывод инструментов). */
const CHUNK_BYTES = 1 << 20

/** Код перевода строки: по байту строки режутся без разбора UTF-8 - внутри знака его нет. */
const NEWLINE = 0x0a

/** Расход ответа: вход, выход и кэш - всё, что ушло в модель и пришло из неё. */
export const lineTokens = (line: string): { key: string; at: number; tokens: number } | null => {
  // Почти все байты транскрипта - вывод инструментов; usage несёт только ответ модели.
  if (!line.startsWith('{') || !line.includes('"usage"') || !line.includes('"assistant"')) {
    return null
  }

  try {
    const entry = JSON.parse(line) as Record<string, unknown>
    const message = entry['message'] as Record<string, unknown> | undefined
    const usage = message?.['usage'] as Record<string, unknown> | undefined
    const at = Date.parse(typeof entry['timestamp'] === 'string' ? entry['timestamp'] : '')

    if (!usage || Number.isNaN(at)) return null

    const field = (name: string) => (typeof usage[name] === 'number' ? usage[name] : 0)
    const tokens =
      field('input_tokens') +
      field('output_tokens') +
      field('cache_creation_input_tokens') +
      field('cache_read_input_tokens')
    const id = typeof message?.['id'] === 'string' ? message['id'] : ''
    const request = typeof entry['requestId'] === 'string' ? entry['requestId'] : ''

    return tokens > 0 ? { key: `${id}\n${request}`, at, tokens } : null
  } catch {
    return null
  }
}

/**
 * Ключ ответа числом, а не строкой: первое чтение файла, тронутого сегодня, берёт его целиком,
 * а разговор длиной в недели - это десятки тысяч ответов. Два 32-битных хэша в 53 бита:
 * совпадение на миллион ответов - доли процента от одного случая.
 */
const answerKey = (key: string): number => {
  let first = 0x811c9dc5
  let second = 5381

  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index)

    first = Math.imul(first ^ code, 0x01000193)
    second = (Math.imul(second, 33) + code) | 0
  }

  return (first >>> 0) * 0x200000 + ((second >>> 0) & 0x1fffff)
}

/** Ответы без дублей: по ключу - наибольший расход и самое раннее время. */
export class AnswerSet {
  private readonly tokens = new Map<number, number>()
  private readonly times = new Map<number, number>()

  add(key: string, at: number, tokens: number): void {
    const id = answerKey(key)

    this.tokens.set(id, Math.max(this.tokens.get(id) ?? 0, tokens))
    this.times.set(id, Math.min(this.times.get(id) ?? at, at))
  }

  /** Забыть ответы раньше момента: вчерашние счётчику дня больше не нужны. */
  forgetBefore(at: number): void {
    for (const [id, time] of this.times) {
      if (time >= at) continue

      this.times.delete(id)
      this.tokens.delete(id)
    }
  }

  /** Сколько токенов во всех ответах набора. */
  total(): number {
    let sum = 0

    for (const tokens of this.tokens.values()) sum += tokens

    return sum
  }
}

/** Транскрипт и сколько в нём байт. */
export type TranscriptFile = { path: string; size: number }

/**
 * Транскрипты папки projects/, изменённые не раньше since (мс). Папки проектов читаются вглубь:
 * субагенты пишут свои транскрипты в `<сессия>/subagents/`, и их токены - тоже расход дня.
 */
export const transcriptFiles = async (root: string, since: number): Promise<TranscriptFile[]> => {
  const dirs = await readdir(root, { withFileTypes: true }).catch(() => [])
  const paths = await Promise.all(
    dirs
      .filter((dir) => dir.isDirectory())
      .map(async (dir) => {
        const names = await readdir(join(root, dir.name), { recursive: true }).catch(() => [])

        return names
          .filter((name) => name.endsWith('.jsonl'))
          .map((name) => join(root, dir.name, name))
      }),
  )
  const files = await Promise.all(
    paths.flat().map(async (path) => {
      const info = await stat(path).catch(() => null)

      return info && info.mtimeMs >= since ? { path, size: info.size } : null
    }),
  )

  return files.filter((file) => file !== null)
}

/**
 * Дочитать файл с байта offset: каждая целая строка - в onLine. Ответ - до какого байта
 * дочитано: хвост без перевода строки - недописанная строка, она дочитается в следующий раз.
 */
export const readLinesFrom = async (
  path: string,
  offset: number,
  onLine: (line: string) => void,
): Promise<number> => {
  const handle = await open(path, 'r').catch(() => null)

  if (!handle) return offset

  let done = offset
  let pending = Buffer.alloc(0)

  try {
    const chunk = Buffer.alloc(CHUNK_BYTES)

    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, done + pending.length)

      if (bytesRead === 0) break

      const data = Buffer.concat([pending, chunk.subarray(0, bytesRead)])
      const end = data.lastIndexOf(NEWLINE)

      if (end === -1) {
        pending = data
        continue
      }

      for (const line of data.toString('utf8', 0, end).split('\n')) onLine(line)

      done += end + 1
      pending = data.subarray(end + 1)
    }
  } finally {
    await handle.close()
  }

  return done
}

import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/** Хвост журнала, где ищется конец хода: файл длинного разговора - десятки мегабайт. */
const TAIL_BYTES = 512 * 1024

/**
 * Строку конца хода Kimi дописывает в журнал рядом с ответом ACP, а не строго до него: столько раз
 * её подождать, прежде чем решить, что журнал о ходе молчит.
 */
const ATTEMPTS = 8
const STEP_MS = 100

/** Как кончился ход по журналу Kimi: причина и слова сервера, если отказал он. */
export type KimiTurnEnd = { reason: string; message: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Папка сессии по индексу Kimi (`session_index.jsonl`): последняя запись о сессии решает -
 * удалённая сессия (`deleted`) папки не имеет. null - Kimi о сессии не знает.
 */
export const sessionDirOf = (index: string, sessionId: string): string | null => {
  let dir: string | null = null

  for (const line of index.split('\n')) {
    if (!line.includes(sessionId)) continue

    try {
      const entry: unknown = JSON.parse(line)

      if (!isRecord(entry) || entry['sessionId'] !== sessionId) continue

      dir = entry['deleted'] === true ? null : text(entry['sessionDir']) || dir
    } catch {
      // Строку дописывают прямо сейчас - следующая скажет то же.
    }
  }

  return dir
}

/**
 * Первый конец хода основного агента не раньше since. Ход у Kimi один за раз, поэтому первый
 * конец после отправки - конец отправленного; ходы, которые Kimi начал потом сам (отчёт фоновой
 * задачи, продолжение цели), кончаются позже. Обрезанная первая строка хвоста пропускается.
 */
export const firstTurnEnd = (tail: string, since: number): KimiTurnEnd | null => {
  for (const line of tail.split('\n')) {
    if (!line.includes('"turn.ended"')) continue

    try {
      const entry: unknown = JSON.parse(line)

      if (!isRecord(entry) || entry['type'] !== 'turn.ended') continue
      if (text(entry['agentId']) !== 'main') continue
      if (typeof entry['time'] !== 'number' || entry['time'] < since) continue

      const error = isRecord(entry['error']) ? entry['error'] : {}

      return {
        reason: text(entry['reason']),
        message: text(error['message']) || text(error['name']) || text(error['code']),
      }
    } catch {
      // Обрезанная строка начала хвоста или недописанная последняя.
    }
  }

  return null
}

/** Конец файла: последние TAIL_BYTES байт текстом. */
const readTail = async (path: string): Promise<string> => {
  const file = await open(path, 'r')

  try {
    const { size } = await file.stat()
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)

    await file.read(buffer, 0, length, size - length)

    return buffer.toString('utf8')
  } finally {
    await file.close()
  }
}

/**
 * Сбой хода, который Kimi прячет от ACP (замерено на 2.7.0): сервер отказал посреди хода (кончился
 * лимит подписки, ошибка API), а `session/prompt` отвечает обычным `end_turn` без слов - панель
 * показывала «Worked 4.9s» и ничего больше, и человек не понимал, почему Kimi молчит. Причина
 * лежит только в журнале сессии: строка `turn.ended` с `reason: failed` в
 * `agents/main/wire.jsonl`. Ответ - слова отказа; null - ход кончился сам, или журнал молчит.
 * since - когда ход отправлен (мс): часы у IDE и Kimi одни.
 */
export const kimiTurnFailure =
  (home: string) =>
  async (sessionId: string, since: number): Promise<string | null> => {
    const index = await readFile(join(home, 'session_index.jsonl'), 'utf8').catch(() => '')
    const dir = sessionDirOf(index, sessionId)

    if (!dir) return null

    const wire = join(dir, 'agents', 'main', 'wire.jsonl')

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      if (attempt > 0) await delay(STEP_MS)

      const end = firstTurnEnd(await readTail(wire).catch(() => ''), since)

      if (end) return end.reason === 'failed' ? end.message || 'The turn failed.' : null
    }

    return null
  }

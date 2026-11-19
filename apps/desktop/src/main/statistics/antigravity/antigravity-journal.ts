import { readFile } from 'node:fs/promises'
import { sep, join } from 'node:path'

import { keyOf } from '../stats-keys'
import type { JournalFormat, JournalParser } from '../journals/journal-format'
import { jsonOf, textOf, numberOf } from '../journals/jsonl-rows'
import { emptyRows } from '../transcripts/parsed-rows'
import { walkJsonl } from '../transcripts/transcript-walk'

/**
 * Где IDE записывает папку каждого своего разговора Antigravity (в журнале `agy` её нет):
 * строка `{sessionId, cwd}` в своей папке агента IDE. У `agy` человека такого файла нет - его
 * разговоры идут без папки.
 */
export const ANTIGRAVITY_PLACES = 'aw-places.jsonl'

/** Что разбор помнит между проходами: начало идущего хода (отрезок активности). */
type Carry = { turnStart: number; last: number }

/**
 * Шаг модели с расходом: `agy` до 1.5.12 не пишет `model`, но токены есть - они засчитываются с
 * пустой моделью; шаг без токенов - не ответ.
 */
const hasTokens = (row: Record<string, unknown>): boolean =>
  numberOf(row['input_tokens']) +
    numberOf(row['output_tokens']) +
    numberOf(row['cache_read_tokens']) >
  0

/** Разговор по пути: `brain/<разговор>/.system_generated/logs/transcript.jsonl`. */
const ownerOf = (path: string) => {
  const parts = path.split(sep)

  return { session: parts[parts.lastIndexOf('brain') + 1] ?? '', subagent: false }
}

const placesOf = async (home: string): Promise<Map<string, string>> => {
  const text = await readFile(join(home, '..', ANTIGRAVITY_PLACES), 'utf8').catch(() => '')
  const places = new Map<string, string>()

  for (const line of text.split('\n')) {
    const row = jsonOf(Buffer.from(line))

    if (row) places.set(textOf(row['sessionId']), textOf(row['cwd']))
  }

  return places
}

/**
 * Журналы Antigravity (ADR 0092): `transcript.jsonl` каждого разговора в папке данных `agy`
 * (своя папка IDE и `~/.gemini/antigravity-cli` человека). Шаг модели (`PLANNER_RESPONSE`) несёт
 * модель и токены (вход, чтение кэша, выход); сообщение человека - `USER_INPUT` от
 * `USER_EXPLICIT`. Формат не документирован (модель - с 1.5.12), protobuf базы разговоров не
 * нужен. root - папка
 * данных `agy` (`antigravity-cli`).
 */
export const antigravityJournal: JournalFormat = {
  walk: async (root) => {
    const places = await placesOf(root)
    const files = await walkJsonl(
      join(root, 'brain'),
      ownerOf,
      (name) => name === 'transcript.jsonl',
    )

    return files.map((file) => ({ ...file, cwd: places.get(file.session) ?? '' }))
  },
  parser: (file, carry) => {
    let rows = emptyRows()
    let state: Carry = { turnStart: 0, last: 0 }
    const cwd = file.cwd ?? ''
    const place = (ts: number) => ({ ts, cwd, session: file.session })

    try {
      if (carry) state = JSON.parse(carry) as Carry
    } catch {
      state = { turnStart: 0, last: 0 }
    }

    /** Отрезок идущего хода: от сообщения человека до последнего шага (база склеит по началу). */
    const span = () => ({
      start: state.turnStart,
      end: Math.max(state.last, state.turnStart),
      cwd,
      session: file.session,
    })

    /** Ход кончился, когда пришло следующее сообщение человека: отрезок - до последнего шага. */
    const closeTurn = () => {
      if (state.turnStart) rows.spans.push(span())
      state.turnStart = 0
    }

    const line = (raw: Buffer) => {
      const row = jsonOf(raw)
      const time = Date.parse(textOf(row?.['created_at']))

      if (!row || !Number.isFinite(time)) return

      const type = textOf(row['type'])
      const step = numberOf(row['step_index'])
      const id = `antigravity\n${file.session}\n${step}`

      if (type === 'USER_INPUT') {
        closeTurn()
        rows.prompts.push({
          ...place(time),
          key: keyOf(id),
          human: textOf(row['source']) === 'USER_EXPLICIT',
        })
        state.turnStart = time
      } else if (type === 'PLANNER_RESPONSE' && hasTokens(row)) {
        rows.answers.push({
          ...place(time),
          id,
          key: keyOf(id),
          model: textOf(row['model']),
          input: numberOf(row['input_tokens']),
          output: numberOf(row['output_tokens']),
          cacheRead: numberOf(row['cache_read_tokens']),
          cacheWrite: 0,
          cacheWrite1h: 0,
          fast: false,
          subagent: false,
        })
      }

      state.last = Math.max(state.last, time)
    }

    const parser: JournalParser = {
      line,
      // Открытый отрезок - и при каждой выдаче: последний ход разговора иначе не попал бы никуда.
      take: () => {
        const taken = rows

        if (state.turnStart) taken.spans.push(span())
        rows = emptyRows()

        return taken
      },
      get carry() {
        return JSON.stringify(state)
      },
    }

    return parser
  },
}

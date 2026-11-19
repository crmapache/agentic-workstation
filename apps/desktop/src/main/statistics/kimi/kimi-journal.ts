import { readFile } from 'node:fs/promises'
import { sep, join, dirname } from 'node:path'

import { keyOf } from '../stats-keys'
import type { JournalFormat, JournalParser } from '../journals/journal-format'
import { jsonOf, textOf, numberOf } from '../journals/jsonl-rows'
import { emptyRows } from '../transcripts/parsed-rows'
import { walkJsonl } from '../transcripts/transcript-walk'

/** Что разбор помнит между проходами: начало идущего хода и его последняя запись. */
type KimiCarry = { turnStart: number; last: number }

/**
 * Разговор по пути журнала: `sessions/<папка>/session_<uuid>/agents/<агент>/wire.jsonl`;
 * агент не `main` - субагент разговора.
 */
const ownerOf = (path: string) => {
  const parts = path.split(sep)
  const index = parts.lastIndexOf('agents')

  return {
    session: parts[index - 1] ?? '',
    subagent: (parts[index + 1] ?? 'main') !== 'main',
  }
}

/** Папка разговора - из `state.json` рядом с журналом (в самом журнале её нет). */
const cwdOf = async (path: string): Promise<string> => {
  const state = join(dirname(dirname(dirname(path))), 'state.json')

  try {
    const value = JSON.parse(await readFile(state, 'utf8')) as Record<string, unknown>

    return textOf(value['cwd'])
  } catch {
    return ''
  }
}

/**
 * Журналы Kimi Code (ADR 0092): `wire.jsonl` каждого агента разговора в KIMI_CODE_HOME (своя
 * папка IDE и `~/.kimi-code` человека). Расход - `usage.record` (вход без кэша, выход, чтение и
 * запись кэша) на ход; сообщение человека - `turn.prompt` с `origin.kind: user`; отрезок
 * активности - от сообщения до `turn.ended`. Формат журнала у Kimi внутренний (версия 1.5).
 */
export const kimiJournal: JournalFormat = {
  walk: async (home) => {
    const files = await walkJsonl(join(home, 'sessions'), ownerOf, (name) => name === 'wire.jsonl')

    return Promise.all(files.map(async (file) => ({ ...file, cwd: await cwdOf(file.path) })))
  },
  parser: (file, carry) => {
    let rows = emptyRows()
    let state: KimiCarry = { turnStart: 0, last: 0 }
    let count = 0
    const cwd = file.cwd ?? ''
    const place = (ts: number) => ({ ts, cwd, session: file.session })

    try {
      if (carry) state = { turnStart: 0, last: 0, ...(JSON.parse(carry) as Partial<KimiCarry>) }
    } catch {
      state = { turnStart: 0, last: 0 }
    }

    /** Отрезок хода: от запроса до последней его записи (база склеит по началу). */
    const span = (end: number) => ({
      start: state.turnStart,
      end: Math.max(end, state.turnStart),
      cwd,
      session: file.session,
    })

    const line = (raw: Buffer) => {
      const row = jsonOf(raw)
      const time = numberOf(row?.['time'])

      count += 1

      if (!row || !time) return

      const type = textOf(row['type'])

      if (type === 'turn.prompt') {
        const origin = row['origin'] as Record<string, unknown> | undefined
        const human = textOf(origin?.['kind']) === 'user'
        const id = textOf(row['promptId']) || String(time)

        rows.prompts.push({ ...place(time), key: keyOf(`kimi\n${file.session}\n${id}`), human })
        // Формат 1.4 `turn.ended` не пишет, а оборванный ход его не дописал: прошлый ход кончается
        // своей последней записью.
        if (state.turnStart) rows.spans.push(span(state.last))
        state.turnStart = time
      } else if (type === 'usage.record') {
        const usage = (row['usage'] ?? {}) as Record<string, unknown>
        const id = `kimi\n${file.session}\n${file.path}\n${time}\n${count}`

        rows.answers.push({
          ...place(time),
          id,
          key: keyOf(id),
          model: textOf(row['model']),
          input: numberOf(usage['inputOther']),
          output: numberOf(usage['output']),
          cacheRead: numberOf(usage['inputCacheRead']),
          cacheWrite: numberOf(usage['inputCacheCreation']),
          cacheWrite1h: 0,
          fast: false,
          subagent: file.subagent,
        })
      } else if (type === 'turn.ended' && state.turnStart) {
        rows.spans.push(span(time))
        state.turnStart = 0
      }

      state.last = Math.max(state.last, time)
    }

    const parser: JournalParser = {
      line,
      // Открытый отрезок - и при каждой выдаче: ход ещё идёт или журнал оборвался на нём.
      take: () => {
        const taken = rows

        if (state.turnStart) taken.spans.push(span(state.last))
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

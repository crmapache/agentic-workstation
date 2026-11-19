import { keyOf } from '../stats-keys'
import { IDLE_GAP_MS } from '../stats.constants'
import { isMachineText } from '../transcripts/line-facts'
import type { EditFact } from '../transcripts/line-facts'
import type { SpanRow, AnswerRow, LinePlace, ParsedRows } from '../transcripts/parsed-rows'
import { emptyRows, mergeAnswer } from '../transcripts/parsed-rows'
import type { CodexCarry } from './codex-carry'
import type { Json, CodexToolFact } from './codex-facts'
import {
  text,
  isRecord,
  itemToolOf,
  userTextOf,
  itemEditsOf,
  codexUsageOf,
  legacyCallOf,
  patchEditsOf,
  patchSucceeded,
} from './codex-facts'

/** Уровни обслуживания, которые OpenAI считает по цене Fast (codex-fast.ts). */
const FAST_TIERS = new Set(['priority', 'fast'])

/** Сколько незавершённых правок старого журнала помнить: больше разом не бывает. */
const MAX_PENDING_PATCHES = 64

const parse = (raw: Buffer): Json | null => {
  try {
    const body: unknown = JSON.parse(raw.toString('utf8'))

    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

/**
 * Разбор одного журнала Codex строка за строкой - в записи базы, без ввода-вывода. Первая
 * строка файла - `session_meta`: чей это поток, его папка и не субагент ли он. Модель и
 * быстрый режим приходят строками хода (`turn_context`, `thread_settings_applied`), а не
 * в каждом ответе, - разбор помнит их в carry между проходами.
 *
 * Сессия - корневой поток (`session_id`): у субагента (ревью) это поток родителя, как
 * субагенты Claude - работа своего разговора. Ход начинается строкой `task_started`: время до
 * неё - ожидание человека, а не работа, поэтому сообщение человека записывается временем
 * начала хода. Ход без сообщения (начат не человеком) - автоматическим началом.
 *
 * Новые журналы пишут одно и то же дважды: вызов модели (`response_item`) и готовое действие
 * (`item_completed`), расход - `token_count` и `token_usage_record`. Читается одно: готовые
 * действия и расход по ответам, как только они встретились в файле (они идут раньше своих
 * двойников); старые журналы без них читаются по `response_item` и `token_count`.
 */
export class CodexParser {
  private readonly answers = new Map<number, AnswerRow>()
  private rows = emptyRows()

  constructor(private readonly state: CodexCarry) {}

  get carry(): CodexCarry {
    return this.state
  }

  line(raw: Buffer): void {
    const body = parse(raw)
    const ts = Date.parse(text(body ?? undefined, 'timestamp'))

    if (!body || Number.isNaN(ts)) return

    const type = text(body, 'type')
    const payload = isRecord(body['payload']) ? body['payload'] : {}

    if (type === 'session_meta') return this.meta(payload)
    if (type === 'turn_context') return this.context(payload)
    if (type === 'world_state') return
    if (type === 'token_usage_record') return this.record(payload, ts)
    if (type === 'event_msg') return this.event(payload, ts)
    if (type === 'response_item') return this.responseItem(payload, ts)

    this.mark(ts, false)
  }

  /** Записи с прошлого вызова плюс открытый отрезок (его конец ещё будет расти). */
  take(): ParsedRows {
    const rows = this.rows

    rows.answers = [...this.answers.values()]
    if (this.state.span) rows.spans.push({ ...this.state.span })

    this.answers.clear()
    this.rows = emptyRows()

    return rows
  }

  private place(ts: number): LinePlace {
    return { ts, cwd: this.state.cwd, session: this.state.session }
  }

  private meta(payload: Json) {
    const thread = text(payload, 'id')
    const source = payload['source']

    if (thread) this.state.thread = thread
    this.state.session = text(payload, 'session_id') || thread || this.state.session
    this.state.cwd = text(payload, 'cwd') || this.state.cwd
    this.state.subagent =
      text(payload, 'parent_thread_id') !== '' ||
      (isRecord(source) && source['subagent'] !== undefined)
  }

  private context(payload: Json) {
    this.state.model = text(payload, 'model') || this.state.model
    this.state.cwd = text(payload, 'cwd') || this.state.cwd
  }

  private event(payload: Json, ts: number) {
    const kind = text(payload, 'type')

    if (kind === 'thread_settings_applied') return this.settings(payload)
    if (kind === 'task_started') return this.turnStarted(payload, ts)
    if (kind === 'item_completed') return this.item(payload, ts)
    if (kind === 'user_message' && !this.state.items) {
      return this.prompt(text(payload, 'message'), `${this.state.thread}\n${ts}`, ts)
    }

    if (kind === 'token_count' && !this.state.records) this.tokenCount(payload, ts)
    if (kind === 'task_complete' || kind === 'turn_aborted') this.autoStart()

    this.mark(ts, false)
  }

  private settings(payload: Json) {
    const settings = isRecord(payload['thread_settings']) ? payload['thread_settings'] : {}
    const tier = text(settings, 'service_tier')

    this.state.model = text(settings, 'model') || this.state.model
    this.state.cwd = text(settings, 'cwd') || this.state.cwd
    if (tier) this.state.fast = FAST_TIERS.has(tier)
  }

  /** Начало хода: новый отрезок; сообщение человека встанет на это время. */
  private turnStarted(payload: Json, ts: number) {
    this.autoStart()

    if (this.state.subagent) return this.mark(ts, false)

    this.state.turn = { at: ts, id: text(payload, 'turn_id') || String(ts) }
    this.mark(ts, true)
  }

  /** Ход начался без сообщения человека: его начало - автоматическое. */
  private autoStart() {
    const turn = this.state.turn

    if (!turn) return

    this.state.turn = null
    this.rows.prompts.push({
      ...this.place(turn.at),
      key: keyOf(`codex\n${this.state.session}\n${turn.id}`),
      human: false,
    })
  }

  private item(payload: Json, ts: number) {
    const item = isRecord(payload['item']) ? payload['item'] : {}
    const id = text(item, 'id')

    this.state.items = true

    if (item['type'] === 'UserMessage') {
      return this.prompt(userTextOf(item['content']), id || `${this.state.thread}\n${ts}`, ts)
    }

    const tool = itemToolOf(item)

    if (tool && id) this.toolCall(id, tool, ts)
    if (id) this.edits(id, itemEditsOf(item), ts)

    this.mark(ts, false)
  }

  /**
   * Сообщение человека. У субагента сообщений человека нет: его задание пишет родитель. Первое
   * сообщение хода - временем начала хода, остальные (подсказка посреди хода) - своим.
   */
  private prompt(said: string, id: string, ts: number) {
    if (this.state.subagent || said.trim() === '') return this.mark(ts, false)

    const turn = this.state.turn
    const at = turn ? turn.at : ts

    this.state.turn = null
    this.rows.prompts.push({
      ...this.place(at),
      key: keyOf(`codex\n${id}`),
      human: !isMachineText(said),
    })

    this.mark(ts, turn === null)
  }

  /** Расход ответа API: ключ - id ответа, строка не задвоится ни в форке, ни в архиве. */
  private record(payload: Json, ts: number) {
    this.state.records = true

    const id =
      text(payload, 'response_id') || `${this.state.thread}\n${text(payload, 'turn_id')}\n${ts}`

    this.answer(`codex\n${id}`, payload['usage'], ts)
    this.mark(ts, false)
  }

  /**
   * Расход старого журнала: `last_token_usage` - последний ответ. Ключ - накопленный итог
   * потока: строка, повторённая ради лимитов, несёт тот же итог и не задвоит ответ.
   */
  private tokenCount(payload: Json, ts: number) {
    const info = isRecord(payload['info']) ? payload['info'] : null
    const total = isRecord(info?.['total_token_usage']) ? info['total_token_usage'] : {}

    if (!info) return

    this.answer(
      `codex-tc\n${this.state.thread}\n${String(total['total_tokens'])}`,
      info['last_token_usage'],
      ts,
    )
  }

  private answer(id: string, usage: unknown, ts: number) {
    const tokens = codexUsageOf(usage)

    if (!tokens) return

    const row: AnswerRow = {
      ...this.place(ts),
      ...tokens,
      id,
      key: keyOf(id),
      model: this.state.model || 'unknown',
      cacheWrite1h: 0,
      fast: this.state.fast,
      subagent: this.state.subagent,
    }
    const known = this.answers.get(row.key)

    if (known) mergeAnswer(known, row)
    else this.answers.set(row.key, row)
  }

  /** Вызов модели старого журнала; в новом его двойник - готовое действие. */
  private responseItem(payload: Json, ts: number) {
    if (!this.state.items) this.legacy(payload, ts)

    this.mark(ts, false)
  }

  private legacy(payload: Json, ts: number) {
    const type = text(payload, 'type')

    if (type.endsWith('_output')) {
      const id = text(payload, 'call_id')
      const pending = this.state.patches[id]

      if (!pending) return

      delete this.state.patches[id]

      if (patchSucceeded(payload['output'])) this.edits(id, pending.edits, pending.at)

      return
    }

    const found = legacyCallOf(payload)

    if (!found) return

    this.toolCall(found.id, found.tool, ts)

    const edits = found.patch ? patchEditsOf(found.patch, this.state.cwd) : []

    if (edits.length === 0) return

    const ids = Object.keys(this.state.patches)

    if (ids.length >= MAX_PENDING_PATCHES && ids[0]) delete this.state.patches[ids[0]]

    this.state.patches[found.id] = { at: ts, edits }
  }

  private toolCall(id: string, tool: CodexToolFact, ts: number) {
    this.rows.toolCalls.push({
      ...this.place(ts),
      key: keyOf(`codex\n${id}`),
      ...tool,
      subagent: this.state.subagent,
    })
  }

  private edits(id: string, edits: readonly EditFact[], ts: number) {
    for (const edit of edits) {
      if (!edit.path || edit.added + edit.removed === 0) continue

      this.rows.edits.push({
        ...this.place(ts),
        key: keyOf(`codex\n${id}\n${edit.path}`),
        tool: edit.tool,
        ext: edit.ext,
        fileHash: keyOf(edit.path),
        added: edit.added,
        removed: edit.removed,
        subagent: this.state.subagent,
      })
    }
  }

  /**
   * Время строки - в отрезок активности. Новый отрезок - на начале хода, на паузе длиннее
   * IDLE_GAP_MS и на смене сессии; строки настройки хода (session_meta, turn_context,
   * world_state, thread_settings_applied) отрезок не тянут: их пишет открытие потока, а не
   * работа.
   */
  private mark(ts: number, starts: boolean) {
    const span: SpanRow | null = this.state.span
    const continues =
      span !== null &&
      !starts &&
      span.session === this.state.session &&
      ts - span.end <= IDLE_GAP_MS

    if (continues) {
      span.end = Math.max(span.end, ts)

      return
    }

    if (span) this.rows.spans.push({ ...span })

    this.state.span = { start: ts, end: ts, cwd: this.state.cwd, session: this.state.session }
  }
}

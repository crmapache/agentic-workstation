import { keyOf } from '../stats-keys'
import { IDLE_GAP_MS } from '../stats.constants'
import type { SkeletonValue } from './json-skeleton'
import { readSkeleton } from './json-skeleton'
import type { AnswerFact, PromptKind, ToolUseFact } from './line-facts'
import {
  editsOf,
  answerOf,
  skipsEdits,
  toolUsesOf,
  mcpServerOf,
  permissionOf,
  promptKindOf,
  toolResultsOf,
} from './line-facts'
import type { SpanRow, AnswerRow, LinePlace, ParsedRows, FileContext } from './parsed-rows'
import { emptyRows, mergeAnswer } from './parsed-rows'

type Json = Record<string, unknown>

const HEAD_KEYS = new Set([
  'type',
  'timestamp',
  'cwd',
  'sessionId',
  'uuid',
  'isSidechain',
  'toolUseResult',
  'permissionDecision',
])

/** Записи, у которых есть время работы; служебные строки CLI (снимки, заголовки) - нет. */
const ENTRY_TYPES = new Set(['user', 'assistant', 'system', 'attachment'])

/** Инструменты, у результата которых считаются строки. */
const EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'Bash'])

/** Результат, который стоит разбирать целиком: в нём разность файла. */
const PATCH_MARKERS = ['"structuredPatch"', '"bashEditDiff"']

/** Решение по разрешению принял человек, а не правило. */
const USER_DECISION = '"source":"user_'

const TOOL_USE_ID = '"tool_use_id":"'
const QUOTE = 0x22

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Есть ли в куске строки (вложенном значении верхнего ключа) этот текст. */
const within = (raw: Buffer, value: SkeletonValue | undefined, needle: string): boolean =>
  typeof value === 'object' && raw.subarray(value.start, value.end).includes(needle)

/**
 * id вызова, на который отвечает строка-результат, или null - строка не результат. Первый
 * tool_use_id строки - её блок результата: внутри строковых значений кавычки экранированы.
 */
const resultIdOf = (raw: Buffer): string | null => {
  const at = raw.indexOf(TOOL_USE_ID)

  if (at === -1) return null

  const start = at + TOOL_USE_ID.length

  return raw.toString('latin1', start, raw.indexOf(QUOTE, start))
}

const parse = (raw: Buffer): Json | null => {
  try {
    const body: unknown = JSON.parse(raw.toString('utf8'))

    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Json) : null
  } catch {
    return null
  }
}

/**
 * Разбор одного транскрипта, строка за строкой, в записи базы. Без ввода-вывода: базу он
 * видит только через FileContext, поэтому разбор проверяется на синтетических строках.
 *
 * Строка сначала читается «скелетом» (json-skeleton.ts); целиком разбирается только та,
 * что несёт нужное: ответ модели, сообщение человека, результат правки, решение по
 * разрешению. Вывод инструментов и вложения - половина байтов - так и не становятся строкой.
 *
 * Форк копирует историю разговора в новый файл - те же записи и время, но новая сессия.
 * Посчитанная второй раз, она удвоила бы время старых ходов. Копия узнаётся по ключу
 * (ответ, вызов, сообщение уже записаны из другого файла), строки без ключа (вложения,
 * служебные) идут за последней строкой с ключом.
 */
export class FileParser {
  /** Вызовы правки, ждущие результата: по их входу досчитываются строки без разности. */
  private readonly pending = new Map<string, { name: string; skipEdits: boolean; input: Json }>()
  /** Ответы между сбросами: строки одного ответа сходятся в одну запись. */
  private readonly answers = new Map<number, AnswerRow>()
  private rows = emptyRows()
  private copying = false

  constructor(
    private readonly context: FileContext,
    private span: SpanRow | null,
  ) {}

  /** Открытый отрезок - чтобы следующий проход продолжил его, а не начал новый. */
  get carry(): SpanRow | null {
    return this.span
  }

  line(raw: Buffer): void {
    const head = readSkeleton(raw, HEAD_KEYS)
    const type = asText(head?.get('type'))
    const ts = Date.parse(asText(head?.get('timestamp')))

    if (!head || !ENTRY_TYPES.has(type) || Number.isNaN(ts)) return

    const sidechain = this.context.subagent || head.get('isSidechain') === true
    const place: LinePlace = {
      ts,
      cwd: asText(head.get('cwd')),
      // Субагент пишет сессию родителя, но надёжнее папка: она есть всегда.
      session: this.context.subagent
        ? this.context.session
        : asText(head.get('sessionId')) || this.context.session,
    }

    if (type === 'assistant') this.assistant(raw, place, sidechain)
    else if (type === 'user') this.user(raw, head, place, sidechain)
    else if (!this.copying) this.mark(place, null)
  }

  /** Записи с прошлого вызова плюс открытый отрезок (его конец ещё будет расти). */
  take(): ParsedRows {
    const rows = this.rows

    rows.answers = [...this.answers.values()]
    if (this.span) rows.spans.push({ ...this.span })

    this.answers.clear()
    this.rows = emptyRows()

    return rows
  }

  private assistant(raw: Buffer, place: LinePlace, subagent: boolean) {
    const body = parse(raw)

    if (!body) return

    const answer = answerOf(body)
    const uses = toolUsesOf(body)
    const first = uses[0]

    if (answer) this.copying = this.context.isCopy('answers', keyOf(answer.id))
    else if (first) this.copying = this.context.isCopy('tool_calls', keyOf(first.id))

    if (this.copying) return
    if (answer) this.addAnswer(answer, place, subagent)

    for (const use of uses) this.toolCall(use, place, subagent)

    this.mark(place, null)
  }

  private user(
    raw: Buffer,
    head: Map<string, SkeletonValue>,
    place: LinePlace,
    sidechain: boolean,
  ) {
    const resultId = resultIdOf(raw)
    const uuid = asText(head.get('uuid'))

    if (resultId !== null) {
      this.copying = this.context.isCopy('tool_calls', keyOf(resultId))

      if (this.copying) return
      if (this.wantsResult(raw, head, resultId)) {
        const body = parse(raw)

        if (body) this.results(body, place, sidechain)
      }

      return this.mark(place, null)
    }

    // У субагента первая строка - его задание от родителя, а не сообщение человека.
    const body = sidechain ? null : parse(raw)
    const kind: PromptKind = body ? promptKindOf(body) : null

    if (kind) {
      const key = keyOf(uuid || `${place.session}\n${place.ts}`)

      this.copying = this.context.isCopy('prompts', key)

      if (!this.copying) this.rows.prompts.push({ ...place, key, human: kind === 'human' })
    }

    if (!this.copying) this.mark(place, kind)
  }

  /**
   * Результат разбирается целиком, только если в нём правка или решение человека. Признаки
   * ищутся в своих полях, а не во всей строке: вывод инструмента в ней лежит дважды.
   */
  private wantsResult(raw: Buffer, head: Map<string, SkeletonValue>, id: string): boolean {
    const result = head.get('toolUseResult')

    if (PATCH_MARKERS.some((marker) => within(raw, result, marker))) return true
    if (within(raw, head.get('permissionDecision'), USER_DECISION)) return true

    const use = this.pending.get(id)

    // Bash без разности файлов ничего не правил: его вывод (часто мегабайты) не разбирается.
    if (use?.name === 'Bash') this.pending.delete(id)

    return use !== undefined && use.name !== 'Bash'
  }

  private results(body: Json, place: LinePlace, subagent: boolean) {
    const decision = permissionOf(body)

    for (const result of toolResultsOf(body)) {
      const use = this.pending.get(result.id) ?? this.context.knownTool(result.id)

      this.pending.delete(result.id)

      if (decision) this.rows.permissions.push({ ...place, key: keyOf(result.id), decision })
      if (result.isError) continue

      for (const edit of editsOf(body['toolUseResult'], use)) {
        if (!edit.path || edit.added + edit.removed === 0) continue

        this.rows.edits.push({
          ...place,
          key: keyOf(`${result.id}\n${edit.path}`),
          tool: edit.tool,
          ext: edit.ext,
          fileHash: keyOf(edit.path),
          added: edit.added,
          removed: edit.removed,
          subagent,
        })
      }
    }
  }

  private toolCall(use: ToolUseFact, place: LinePlace, subagent: boolean) {
    const skipEdits = skipsEdits(use)

    this.rows.toolCalls.push({
      ...place,
      key: keyOf(use.id),
      tool: use.name,
      server: mcpServerOf(use.name),
      skipEdits,
      subagent,
    })

    if (EDITING_TOOLS.has(use.name)) {
      this.pending.set(use.id, { name: use.name, skipEdits, input: use.input })
    }
  }

  private addAnswer(answer: AnswerFact, place: LinePlace, subagent: boolean) {
    const row: AnswerRow = { ...place, ...answer, key: keyOf(answer.id), subagent }
    const known = this.answers.get(row.key)

    if (known) mergeAnswer(known, row)
    else this.answers.set(row.key, row)
  }

  /**
   * Время записи - в отрезок активности. Новый отрезок - на начале хода (промежуток до
   * него - ожидание, а не работа), на паузе длиннее IDLE_GAP_MS и на смене сессии.
   */
  private mark(place: LinePlace, kind: PromptKind) {
    const span = this.span
    const continues =
      span !== null &&
      kind === null &&
      span.session === place.session &&
      place.ts - span.end <= IDLE_GAP_MS

    if (continues) {
      span.end = Math.max(span.end, place.ts)

      return
    }

    if (span) this.rows.spans.push({ ...span })

    this.span = { start: place.ts, end: place.ts, cwd: place.cwd, session: place.session }
  }
}

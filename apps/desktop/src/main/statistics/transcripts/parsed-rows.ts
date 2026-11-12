import type { AnswerFact } from './line-facts'

/** Вызов, прочитанный в прошлый проход: его строка уже в базе, а результат пришёл сейчас. */
export type KnownTool = { name: string; skipEdits: boolean }

/** Таблицы, по ключу которых узнаётся строка, скопированная форком из другого файла. */
export type CopyTable = 'answers' | 'prompts' | 'tool_calls'

export type FileContext = {
  /** Сессия из пути: имя основного транскрипта или папка над subagents/. */
  session: string
  /** Файл субагента: всё в нём - работа разговора-родителя. */
  subagent: boolean
  knownTool: (id: string) => KnownTool | null
  /** Запись с этим ключом уже есть, и она из другого файла. */
  isCopy: (table: CopyTable, key: number) => boolean
}

/** Где запись: время, папка (cwd) и сессия. */
export type LinePlace = { ts: number; cwd: string; session: string }

export type AnswerRow = LinePlace & AnswerFact & { key: number; subagent: boolean }

export type ToolCallRow = LinePlace & {
  key: number
  tool: string
  server: string | null
  skipEdits: boolean
  subagent: boolean
}

export type EditRow = LinePlace & {
  key: number
  tool: string
  ext: string
  fileHash: number
  added: number
  removed: number
  subagent: boolean
}

export type PromptRow = LinePlace & { key: number; human: boolean }

export type PermissionRow = LinePlace & { key: number; decision: 'allow' | 'deny' }

/** Отрезок активности файла; открытый отрезок переживает проход (files.carry). */
export type SpanRow = { start: number; end: number; cwd: string; session: string }

export type ParsedRows = {
  answers: AnswerRow[]
  toolCalls: ToolCallRow[]
  edits: EditRow[]
  prompts: PromptRow[]
  permissions: PermissionRow[]
  spans: SpanRow[]
}

export const emptyRows = (): ParsedRows => ({
  answers: [],
  toolCalls: [],
  edits: [],
  prompts: [],
  permissions: [],
  spans: [],
})

/** Строки одного ответа: по каждому полю наибольшее, время - самое раннее. */
export const mergeAnswer = (known: AnswerRow, row: AnswerRow): void => {
  known.ts = Math.min(known.ts, row.ts)
  known.input = Math.max(known.input, row.input)
  known.output = Math.max(known.output, row.output)
  known.cacheRead = Math.max(known.cacheRead, row.cacheRead)
  known.cacheWrite = Math.max(known.cacheWrite, row.cacheWrite)
  known.cacheWrite1h = Math.max(known.cacheWrite1h, row.cacheWrite1h)
  known.fast ||= row.fast
}

import type { ProviderId } from '@shared/providers'

import type { CopyTable, KnownTool, ParsedRows } from '../transcripts/parsed-rows'

/**
 * Откуда статистика читает работу агентов: журнал провайдера на диске. У Claude Code и Codex
 * это папка с JSONL (projects/ в доме CLI, CODEX_HOME), у OpenCode - его база SQLite. Только
 * данные: источник едет в поток статистики сообщением, а чем его читать, решает поток по
 * провайдеру.
 */
export type ScanSource = { provider: ProviderId; path: string }

/** Файл журнала на диске и чей он. */
export type JournalFile = {
  path: string
  size: number
  mtimeMs: number
  /** Когда файл создан: форк моложе своего оригинала, а оригинал должен прочитаться первым. */
  birthtimeMs: number
  /** Сессия по пути файла; разбор может знать точнее (Codex - из первой строки). */
  session: string
  /** Файл субагента: всё в нём - работа разговора-родителя. */
  subagent: boolean
}

/** Что разбор может спросить у базы, не видя её. */
export type ParserTools = {
  knownTool: (id: string) => KnownTool | null
  /** Запись с этим ключом уже есть, и она из другого файла (копия форка). */
  isCopy: (table: CopyTable, key: number) => boolean
}

/**
 * Разбор одного файла журнала строка за строкой. carry - что разбор должен помнить до
 * следующего прохода (открытый отрезок активности, сессия и модель Codex): пишется в
 * files.carry вместе со смещением.
 */
export type JournalParser = {
  line: (raw: Buffer) => void
  take: () => ParsedRows
  readonly carry: string | null
}

/** Формат JSONL-журнала провайдера: где его файлы и чем разбирать файл. */
export type JournalFormat = {
  walk: (root: string) => Promise<JournalFile[]>
  parser: (file: JournalFile, carry: string | null, tools: ParserTools) => JournalParser
}

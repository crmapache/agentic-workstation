import type { HistoryCause, HistoryContent } from '@shared/local-history'

import type { DocumentStatus } from '../editor.types'

export type LocalHistoryViewProps = {
  projectId: string
  /** Имя проекта - подпись истории всего проекта. */
  projectName: string
  /** Чья история: файл или папка от корня проекта, '' - весь проект. */
  path: string
  /** Активна ли вкладка истории: спрятанная за файлом клавиатуру не берёт. */
  isActive: boolean
}

/**
 * Строка списка истории: событие или самая ранняя известная версия файла - та, что была до
 * первого события (её тоже можно вернуть). version - что строка показывает и возвращает;
 * previous - что было до события.
 */
export type HistoryRow = {
  key: string
  path: string
  at: number
  cause: HistoryCause | 'earliest'
  origin: string | null
  version: string | null
  previous: string | null
}

/** Строки одного дня, новые сверху; start - местная полночь. */
export type HistoryDay = { start: number; rows: HistoryRow[] }

/** Сторона разницы: версия по ключу (null - пусто: файла не было) или файл сейчас. */
export type HistorySide = { kind: 'version'; key: string | null } | { kind: 'file' }

/** Правая сторона готовой разницы: текст или документ файла сейчас. */
export type HistoryModified = { kind: 'text'; text: string } | { kind: 'document' }

/**
 * Что показать справа от списка. ready: слева текст версии, справа - текст другой версии или
 * файл сейчас (документ редактора, правится) или пусто (файла нет). Иначе - ещё читается или
 * почему строк нет: версия не текст, пропала, файл сейчас не показать.
 */
export type HistoryDiffState =
  | { kind: 'loading' }
  | { kind: 'ready'; original: string; modified: HistoryModified; readOnly: boolean }
  | { kind: 'binary' }
  | { kind: 'lost' }
  | {
      kind: 'fileProblem'
      status: Exclude<DocumentStatus, { kind: 'text' | 'loading' | 'missing' }>
    }

export type HistoryDiffInput = {
  left: HistoryContent | undefined
  right: HistorySide
  rightContent: HistoryContent | undefined
  status: DocumentStatus
}

export type HistoryHeaderProps = {
  projectId: string
  projectName: string
  path: string
  isFolder: boolean
  /** Выбранная строка: её версию возвращает «Restore»; null - выбирать нечего. */
  row: HistoryRow | null
  retentionDays: number
}

export type RevisionListProps = {
  days: readonly HistoryDay[]
  /** Список папки: в строке ещё и файл. */
  isFolder: boolean
  selected: string | null
  truncated: boolean
  onSelect: (key: string) => void
}

export type RevisionRowProps = {
  row: HistoryRow
  isFolder: boolean
  isSelected: boolean
  onSelect: (key: string) => void
}

export type HistoryDiffProps = { projectId: string; row: HistoryRow; isActive: boolean }

export type HistoryDiffBarProps = {
  /** Сколько различий нашёл Monaco; null - ещё считает или показывать нечего. */
  count: number | null
  onPrevious: () => void
  onNext: () => void
}

export type HistoryPlaceholderProps = {
  state: Extract<HistoryDiffState, { kind: 'binary' | 'lost' | 'fileProblem' }>
}

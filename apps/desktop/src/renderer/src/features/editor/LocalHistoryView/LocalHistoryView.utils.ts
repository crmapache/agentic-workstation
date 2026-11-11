import type { HistoryEntry } from '@shared/local-history'

import type { HistoryCompare } from '../editor.types'
import { daysBetween } from '../../../lib/dates.utils'
import { baseName, splitPath } from '../../../lib/path.utils'
import type {
  HistoryDay,
  HistoryRow,
  HistorySide,
  HistoryDiffInput,
  HistoryDiffState,
} from './LocalHistoryView.types'

/** Как назвать событие в списке: причина, у переноса - откуда, у агента без «до» - создал. */
export type CauseName =
  | 'edit'
  | 'outside'
  | 'agent'
  | 'agentCreated'
  | 'refactor'
  | 'created'
  | 'deleted'
  | 'moved'
  | 'renamed'
  | 'restored'
  | 'earliest'

/**
 * Строки списка: события как есть, новые сверху. У файла снизу - версия до первого события,
 * если она известна и событие её поменяло: её тоже можно посмотреть и вернуть.
 */
export const historyRows = (
  entries: readonly HistoryEntry[],
  path: string,
  isFolder: boolean,
): HistoryRow[] => {
  const rows: HistoryRow[] = entries.map(({ id, ...entry }) => ({ key: String(id), ...entry }))
  const oldest = entries.at(-1)

  if (!oldest || isFolder || oldest.previous === null || oldest.previous === oldest.version) {
    return rows
  }

  return [
    ...rows,
    {
      key: 'earliest',
      path,
      at: oldest.at,
      cause: 'earliest',
      origin: null,
      version: oldest.previous,
      previous: null,
    },
  ]
}

/** Строки по дням (местным), порядок - как в списке. */
export const historyDays = (rows: readonly HistoryRow[]): HistoryDay[] => {
  const days: HistoryDay[] = []

  for (const row of rows) {
    const start = new Date(row.at).setHours(0, 0, 0, 0)
    const last = days.at(-1)

    if (last?.start === start) last.rows.push(row)
    else days.push({ start, rows: [row] })
  }

  return days
}

/** «Сегодня» или «вчера» для этого времени; дальше - датой. */
export const dayName = (at: number, now: number): 'today' | 'yesterday' | null => {
  const away = daysBetween(now, at)

  return away === 0 ? 'today' : away === -1 ? 'yesterday' : null
}

/**
 * Как назвать событие: у переноса в той же папке - переименование (откуда - имя), в другую -
 * перенос (откуда - путь), у агента без «до» - создал. Подстановки - для перевода.
 */
export const causeOf = (row: HistoryRow): { name: CauseName; path: string; from: string } => {
  const origin = row.origin ?? ''

  if (row.cause === 'agent' && row.previous === null) {
    return { name: 'agentCreated', path: origin, from: '' }
  }
  if (row.cause !== 'moved') return { name: row.cause, path: origin, from: '' }

  return splitPath(origin).folder === splitPath(row.path).folder
    ? { name: 'renamed', path: origin, from: baseName(origin) }
    : { name: 'moved', path: origin, from: '' }
}

/** Цвет знака события: появился, удалён, правка ИИ; остальные - тихим цветом. */
export const causeTone = (row: HistoryRow): 'created' | 'deleted' | 'agent' | null => {
  if (row.cause === 'agent') return 'agent'
  if (row.cause === 'deleted') return 'deleted'

  return row.cause === 'created' ? 'created' : null
}

/**
 * Стороны разницы. С текущим: версия строки слева, файл сейчас справа - правится, кусок
 * версии возвращается стрелкой, как в WebStorm. Изменение: что было до события и что стало;
 * у удаления справа пусто.
 */
export const sidesOf = (
  row: HistoryRow,
  compare: HistoryCompare,
): { left: string | null; right: HistorySide } =>
  compare === 'current'
    ? { left: row.version, right: { kind: 'file' } }
    : {
        left: row.previous,
        right: { kind: 'version', key: row.cause === 'deleted' ? null : row.version },
      }

/**
 * Что показать: обе стороны готовы - разницу; версия пропала или не текст - почему; файл
 * сейчас не показать строками - теми же словами, что в редакторе; иначе ждать. Файла сейчас
 * нет - справа пусто и не правится.
 */
export const historyDiffState = ({
  left,
  right,
  rightContent,
  status,
}: HistoryDiffInput): HistoryDiffState => {
  const other = right.kind === 'version' ? rightContent : undefined

  if (left?.kind === 'lost' || other?.kind === 'lost') return { kind: 'lost' }
  if (left?.kind === 'binary' || other?.kind === 'binary') return { kind: 'binary' }

  const isFile = right.kind === 'file'

  if (isFile && status.kind !== 'text' && status.kind !== 'loading' && status.kind !== 'missing') {
    return { kind: 'fileProblem', status }
  }

  if (left === undefined) return { kind: 'loading' }
  if (!isFile) {
    return other
      ? {
          kind: 'ready',
          original: left.text,
          modified: { kind: 'text', text: other.text },
          readOnly: true,
        }
      : { kind: 'loading' }
  }
  if (status.kind === 'loading') return { kind: 'loading' }
  if (status.kind === 'missing') {
    return {
      kind: 'ready',
      original: left.text,
      modified: { kind: 'text', text: '' },
      readOnly: true,
    }
  }

  return {
    kind: 'ready',
    original: left.text,
    modified: { kind: 'document' },
    readOnly: status.kind === 'text' && status.readOnly,
  }
}

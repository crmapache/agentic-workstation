import type { TrackerSendCode } from '@shared/tracker'

import type { RunLink, AutoRunLink } from './tracker-book'
import type { RecordKind } from './tracker-records'
import { fieldsOf, RECORD_KINDS } from './tracker-records'

/**
 * Разбор файла трекера: битая запись, привязка или связь пропускается, а не роняет книгу целиком
 * - файл мог оборваться или прийти из более новой версии IDE.
 */

/** Запись книги в памяти: поля, версия облака и метка «не отправлено». */
export type BookEntry = {
  record: { id: string; kind: RecordKind; fields: ReturnType<typeof fieldsOf> }
  rev: number
  dirty: boolean
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const entriesOf = (value: unknown): Map<string, BookEntry> => {
  const entries = new Map<string, BookEntry>()

  if (!isObject(value)) return entries

  for (const [id, raw] of Object.entries(value)) {
    if (!isObject(raw) || !(RECORD_KINDS as readonly unknown[]).includes(raw.k)) continue

    entries.set(id, {
      record: { id, kind: raw.k as RecordKind, fields: fieldsOf(raw.f) },
      rev: typeof raw.rev === 'number' && raw.rev >= 0 ? raw.rev : 0,
      dirty: raw.dirty !== false,
    })
  }

  return entries
}

export const stringsOf = (value: unknown): Record<string, string> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (pair): pair is [string, string] => typeof pair[1] === 'string',
        ),
      )
    : {}

export const runsOf = (value: unknown): Record<string, RunLink> => {
  const runs: Record<string, RunLink> = {}

  if (!isObject(value)) return runs

  for (const [cardId, raw] of Object.entries(value)) {
    if (!isObject(raw) || typeof raw.queueId !== 'string' || typeof raw.itemId !== 'string')
      continue

    runs[cardId] = {
      queueId: raw.queueId,
      itemId: raw.itemId,
      sentAt: typeof raw.sentAt === 'number' ? raw.sentAt : 0,
      settled: raw.settled === true,
      due: typeof raw.due === 'string' ? raw.due : null,
    }
  }

  return runs
}

export const autoRunsOf = (value: unknown): Record<string, AutoRunLink> => {
  const links: Record<string, AutoRunLink> = {}

  if (!isObject(value)) return links

  for (const [cardId, raw] of Object.entries(value)) {
    if (!isObject(raw) || typeof raw.projectPath !== 'string') continue

    links[cardId] = {
      projectPath: raw.projectPath,
      firedFor: typeof raw.firedFor === 'string' ? raw.firedFor : null,
      // Код отказа пишет сама IDE; незнакомый (из более новой версии) окно покажет общим словом.
      failure: typeof raw.failure === 'string' ? (raw.failure as TrackerSendCode) : null,
    }
  }

  return links
}

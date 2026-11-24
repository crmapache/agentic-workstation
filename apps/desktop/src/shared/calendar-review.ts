import type { CalendarMeeting } from './calendar-overlaps'

/**
 * Разбор накладок (ADR 0116): список впереди с отметкой «видел», история переносов, которую
 * замечает синк, и текст для чата ИИ, который предлагает, как развести встречи.
 */

/** Накладка впереди для вкладки Overlaps: обе встречи целиком и отметка «видел». */
export type OverlapView = {
  key: string
  /** Общий отрезок, мс UTC. */
  start: number
  end: number
  soft: boolean
  seen: boolean
  a: CalendarMeeting
  b: CalendarMeeting
}

/** Что стало со встречей, которая ушла со своего времени. */
export type MoveKind = 'moved' | 'declined' | 'cancelled' | 'removed'

/** Перенос встречи, замеченный синком: по истории ИИ видит, кто и как обычно уступает. */
export type MoveRecord = {
  /** Когда синк его заметил, мс. */
  at: number
  sourceId: string
  title: string
  organizer: string | null
  /** Прежнее начало, мс UTC. */
  from: number
  /** Новое начало; null - встреча не перенесена, а отклонена, отменена или удалена. */
  to: number | null
  kind: MoveKind
  /** На прежнем времени встреча стояла в накладке: так видно, кто уступал. */
  clashed: boolean
}

/** Разбор накладки для чата ИИ: подпись чипа и текст, который уйдёт модели. */
export type OverlapBriefOutcome = { ok: true; label: string; text: string } | { ok: false }

/** Ссылка на накладку в чате: модель видит её в теге, окно узнаёт чип при повторе сообщения. */
export const OVERLAP_TAG = 'calendar-overlap'

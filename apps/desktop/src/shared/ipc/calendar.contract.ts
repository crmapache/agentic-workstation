import type {
  CalendarEvent,
  CalendarState,
  CalendarOutcome,
  CalendarSourceDraft,
  CalendarSourcePatch,
  GoogleCalendarsOutcome,
} from '../calendar'
import type { OverlapView, OverlapBriefOutcome } from '../calendar-review'
import type { CalendarSettings } from '../calendar-settings'

/**
 * Часть контракта (contract.ts) про календарь звонков (ADR 0114). Календарь общий на IDE, не
 * проектный. Правила - .claude/rules/ipc-contract.md.
 */
export type CalendarInvokeContract = {
  'calendar:state': { request: void; response: CalendarState }
  /** События видимых источников, задевающие период [from, to), мс UTC. */
  'calendar:events': { request: { from: number; to: number }; response: CalendarEvent[] }
  /** Новый источник или правка; прямой источник сразу читается. */
  'calendar:saveSource': { request: { source: CalendarSourceDraft }; response: CalendarOutcome }
  'calendar:patchSource': {
    request: { id: string; patch: CalendarSourcePatch }
    response: CalendarState
  }
  'calendar:removeSource': { request: { id: string }; response: CalendarState }
  /** Синк одного источника (sourceId) или всех; withAi - вместе с источниками, которые читает ИИ. */
  'calendar:sync': {
    request: { sourceId: string | null; withAi: boolean }
    response: CalendarState
  }
  /** Остановить синк источника или всех. */
  'calendar:cancel': { request: { sourceId: string | null }; response: CalendarState }
  'calendar:setSettings': {
    request: { settings: Partial<CalendarSettings> }
    response: CalendarState
  }
  /** Вид открыли: прямые источники, прочитанные давно, обновляются. */
  'calendar:viewed': { request: void; response: CalendarState }
  /** Календари аккаунта Google коннектора - для формы источника. */
  'calendar:googleCalendars': { request: { connectorId: string }; response: GoogleCalendarsOutcome }
  /** Накладки впереди (до конца окна прямых источников) с обеими встречами и отметкой «видел». */
  'calendar:overlaps': { request: void; response: OverlapView[] }
  /** Отметить накладку просмотренной (она перестаёт гореть) или снять отметку. */
  'calendar:markOverlap': { request: { key: string; seen: boolean }; response: CalendarState }
  /** Разбор накладки для чата ИИ: обе встречи, история переносов и правила. */
  'calendar:overlapBrief': { request: { key: string }; response: OverlapBriefOutcome }
}

export type CalendarEventContract = {
  /** Источники, их синк, настройки или события поменялись. */
  'calendar:changed': CalendarState
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const CALENDAR_CHANNELS = {
  'calendar:state': true,
  'calendar:events': true,
  'calendar:saveSource': true,
  'calendar:patchSource': true,
  'calendar:removeSource': true,
  'calendar:sync': true,
  'calendar:cancel': true,
  'calendar:setSettings': true,
  'calendar:viewed': true,
  'calendar:googleCalendars': true,
  'calendar:overlaps': true,
  'calendar:markOverlap': true,
  'calendar:overlapBrief': true,
} satisfies Record<keyof CalendarInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const CALENDAR_EVENTS = {
  'calendar:changed': true,
} satisfies Record<keyof CalendarEventContract, true>

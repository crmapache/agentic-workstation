import type {
  CalendarColor,
  CalendarSource,
  GoogleSourceSpec,
  CalendarDraftSpec,
  AiScreenSourceSpec,
  CalendarSourceBase,
  CalendarSourceSpec,
  AiBrowserSourceSpec,
  CalendarSourceDraft,
  CalendarSourcePatch,
} from './calendar'
import { AI_HINTS_MAX, AI_WEEKS_MAX, CALENDAR_COLORS, AI_WEEKS_DEFAULT } from './calendar'
import type { CalendarSettings } from './calendar-settings'
import {
  REMINDERS_MAX,
  MORNING_SYNC_MODES,
  REMINDER_MINUTES_MAX,
  DEFAULT_CALENDAR_SETTINGS,
} from './calendar-settings'
import type { AiChoice } from './ide-prefs'
import { parseAiChain } from './ide-prefs'

/** Имя источника и прочие короткие строки: дальше на сетке всё равно не видно. */
const NAME_MAX = 80

/** Адрес страницы и ссылка ICS: длиннее не бывает у настоящих, а промпт не резиновый. */
const URL_MAX = 2000

/** Календарей одного аккаунта Google в источнике. */
const CALENDARS_MAX = 50

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const colorOf = (value: unknown): CalendarColor =>
  CALENDAR_COLORS.find((color) => color === value) ?? 0

const weeksOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value)
    ? Math.min(Math.max(value, 1), AI_WEEKS_MAX)
    : AI_WEEKS_DEFAULT

const DEFAULT_AI: AiChoice[] = [{ provider: 'claude', model: '', effort: '' }]

/** Адрес http(s), который можно открыть; иначе null. */
export const webUrl = (value: unknown): URL | null => {
  const raw = text(value, URL_MAX)

  try {
    const url = new URL(raw)

    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** Ссылка ICS: `webcal:` - тот же https; иначе только http(s). */
export const icsUrl = (value: unknown): URL | null =>
  webUrl(text(value, URL_MAX).replace(/^webcals?:\/\//i, 'https://'))

/** Ссылка ICS без пути и запроса - их часто составляет секретный ключ. */
export const icsMask = (url: URL): string => `${url.protocol}//${url.host}/…`

const baseOf = (input: Record<string, unknown>): Omit<CalendarSourceBase, 'id'> | null => {
  const name = text(input['name'], NAME_MAX)

  return name
    ? {
        name,
        color: colorOf(input['color']),
        visible: flag(input['visible'], true),
        inOverlaps: flag(input['inOverlaps'], true),
      }
    : null
}

type SharedSpec = GoogleSourceSpec | AiBrowserSourceSpec | AiScreenSourceSpec

/** Поля вида, общие форме и диску: всё, кроме ICS. */
const sharedSpecOf = (input: Record<string, unknown>): SharedSpec | null => {
  const connectorId = text(input['connectorId'], NAME_MAX * 2)
  const hints = text(input['hints'], AI_HINTS_MAX)
  const ai = parseAiChain(input['ai']) ?? DEFAULT_AI

  switch (input['kind']) {
    case 'google': {
      const ids = Array.isArray(input['calendarIds']) ? input['calendarIds'] : []
      const calendarIds = [...new Set(ids.map((id) => text(id, URL_MAX)).filter(Boolean))].slice(
        0,
        CALENDARS_MAX,
      )

      return connectorId ? { kind: 'google', connectorId, calendarIds } : null
    }
    case 'ai-browser': {
      const url = webUrl(input['url'])
      const profile = text(input['profile'], NAME_MAX * 2)

      return connectorId && url && profile
        ? {
            kind: 'ai-browser',
            connectorId,
            profile,
            url: url.href,
            hints,
            allowClicks: flag(input['allowClicks'], false),
            weeksAhead: weeksOf(input['weeksAhead']),
            ai,
          }
        : null
    }
    case 'ai-screen': {
      const app = text(input['app'], NAME_MAX)

      return connectorId && app
        ? {
            kind: 'ai-screen',
            connectorId,
            app,
            hints,
            weeksAhead: weeksOf(input['weeksAhead']),
            ai,
          }
        : null
    }
    default:
      return null
  }
}

/** Вид источника из формы: у ICS полный адрес, пусто при правке - прежний (решает сервис). */
const draftSpecOf = (input: Record<string, unknown>): CalendarDraftSpec | null => {
  if (input['kind'] !== 'ics') return sharedSpecOf(input)

  const url = text(input['url'], URL_MAX)

  return url === '' || icsUrl(url) ? { kind: 'ics', url } : null
}

/** Вид источника с диска: у ICS только маска, адрес - в хранилище. */
const storedSpecOf = (input: Record<string, unknown>): CalendarSourceSpec | null => {
  if (input['kind'] !== 'ics') return sharedSpecOf(input)

  const urlMask = text(input['urlMask'], URL_MAX)

  return urlMask ? { kind: 'ics', urlMask } : null
}

/** Источник из формы; негодный - null (окну - код invalid). */
export const parseSourceDraft = (value: unknown): CalendarSourceDraft | null => {
  if (!isRecord(value)) return null

  const base = baseOf(value)
  const spec = draftSpecOf(value)
  const id = text(value['id'], NAME_MAX)

  return base && spec ? { ...base, id: id || null, ...spec } : null
}

/** Источник с диска; негодный выпадает, а не ломает остальные. */
export const parseStoredSource = (value: unknown): CalendarSource | null => {
  if (!isRecord(value)) return null

  const base = baseOf(value)
  const spec = storedSpecOf(value)
  const id = text(value['id'], NAME_MAX)

  return base && spec && id ? { ...base, id, ...spec } : null
}

export const parseSourcePatch = (value: unknown): CalendarSourcePatch => {
  const input = isRecord(value) ? value : {}

  return {
    ...(typeof input['visible'] === 'boolean' && { visible: input['visible'] }),
    ...(typeof input['inOverlaps'] === 'boolean' && { inOverlaps: input['inOverlaps'] }),
  }
}

const DAY_MINUTES = 24 * 60

/** Минуты от полуночи в пределах суток, кратные пяти; не число - null. */
const minuteOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value / 5) * 5, 0), DAY_MINUTES)
    : null

/** Рабочее время: конец позже начала, иначе прежнее. */
const workHoursOf = (
  value: unknown,
  base: CalendarSettings['workHours'],
): CalendarSettings['workHours'] => {
  const input = isRecord(value) ? value : {}
  const from = minuteOf(input['from']) ?? base.from
  const to = minuteOf(input['to']) ?? base.to

  return to > from ? { from, to } : base
}

/** Рабочие дни: 0-6 без повторов, по порядку; не массив - прежние. */
const workDaysOf = (value: unknown, base: number[]): number[] =>
  Array.isArray(value)
    ? [...new Set(value)]
        .filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        .sort((a, b) => a - b)
    : base

/** Напоминания: целые минуты в пределах недели, без повторов, по убыванию, не больше трёх. */
const remindersOf = (value: unknown, base: number[]): number[] =>
  Array.isArray(value)
    ? [...new Set(value)]
        .filter(
          (minutes): minutes is number =>
            Number.isInteger(minutes) && minutes >= 0 && minutes <= REMINDER_MINUTES_MAX,
        )
        .sort((a, b) => b - a)
        .slice(0, REMINDERS_MAX)
    : base

/** Настройки поверх base: негодное поле остаётся прежним. */
export const parseCalendarSettings = (
  value: unknown,
  base: CalendarSettings = DEFAULT_CALENDAR_SETTINGS,
): CalendarSettings => {
  const input = isRecord(value) ? value : {}

  return {
    notifyOverlaps: flag(input['notifyOverlaps'], base.notifyOverlaps),
    workHours: workHoursOf(input['workHours'], base.workHours),
    workDays: workDaysOf(input['workDays'], base.workDays),
    reminders: remindersOf(input['reminders'], base.reminders),
    morningSync:
      MORNING_SYNC_MODES.find((mode) => mode === input['morningSync']) ?? base.morningSync,
  }
}

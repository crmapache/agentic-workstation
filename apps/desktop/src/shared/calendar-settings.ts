/**
 * Настройки календаря звонков (ADR 0114, 0116): живут в Settings → Calendar, а не на самом виде.
 * Рабочее время подсвечивается на сетке и задаёт начало утреннего синка, рабочие дни - какие
 * колонки выходные.
 */

/**
 * Что делать в начале рабочего дня с источниками, которые читает ИИ: прочитать их самим
 * (по экрану - только напомнить, он забирает мышь), только напомнить или ничего.
 */
export const MORNING_SYNC_MODES = ['sync', 'remind', 'off'] as const

export type MorningSync = (typeof MORNING_SYNC_MODES)[number]

/** Напоминаний о звонке - не больше трёх: дальше это шум, а не помощь. */
export const REMINDERS_MAX = 3

/** Дальше недели напоминать о звонке незачем: за неделю его ещё перенесут. */
export const REMINDER_MINUTES_MAX = 7 * 24 * 60

export type CalendarSettings = {
  /** Новая накладка впереди - карточкой в уведомлениях IDE. */
  notifyOverlaps: boolean
  /** Рабочее время, минуты от местной полуночи; to позже from. */
  workHours: { from: number; to: number }
  /** Рабочие дни по Date.getDay (0 - воскресенье); остальные на сетке - выходные. */
  workDays: number[]
  /** За сколько минут до звонка напомнить; пусто - не напоминать. По убыванию, без повторов. */
  reminders: number[]
  morningSync: MorningSync
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  notifyOverlaps: true,
  workHours: { from: 9 * 60, to: 18 * 60 },
  workDays: [1, 2, 3, 4, 5],
  reminders: [10],
  morningSync: 'sync',
}

/** Рабочий ли день у местной полуночи midnight. */
export const isWorkDay = (settings: CalendarSettings, midnight: number): boolean =>
  settings.workDays.includes(new Date(midnight).getDay())

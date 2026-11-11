import { answerLabel } from '@shared/scenario-rules'
import type { ScenarioScope } from '@shared/scenarios'

import { MARK_CHARS } from './scenarios.constants'

/**
 * Арифметика форм хаба и полос очереди и расписания (то, что в ACC жило внутри QueueBand,
 * ScheduleBand, WhenForm и NewScenarioForm): номер черновика, часы ожидания, чьи слова у причины
 * остановки, ответы чипами, час формы по частям.
 */

const DRAFT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const DRAFT_ID_LENGTH = 16

/** Номер запроса черновика: по нему отменяют, и по нему же выбрасывают ответ, который опоздал. */
export const freshDraftId = (): string =>
  [...crypto.getRandomValues(new Uint8Array(DRAFT_ID_LENGTH))]
    .map((byte) => DRAFT_ID_ALPHABET[byte % DRAFT_ID_ALPHABET.length] ?? '')
    .join('')

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Сколько уже ждём - «0:42», «12:05», «1:02:03». Показание прибора, а не слова: строка, которая
 * на десятой и на девяностой секунде читается одинаково, неотличима от зависшей.
 */
export const waitClock = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** Отказ писателя сценариев словом, на которое у окна есть текст; всё прочее - слова самого CLI. */
export type DraftErrorCode =
  'noClaude' | 'untrusted' | 'outdated' | 'timeout' | 'empty' | 'unreadable'

const DRAFT_ERROR_CODES: Record<DraftErrorCode, true> = {
  noClaude: true,
  untrusted: true,
  outdated: true,
  timeout: true,
  empty: true,
  unreadable: true,
}

export const draftErrorCode = (error: string): DraftErrorCode | null =>
  Object.hasOwn(DRAFT_ERROR_CODES, error) ? (error as DraftErrorCode) : null

// Record, а не массив: новое состояние прогона или новый код отказа не соберутся, пока их не
// впишут сюда, - иначе причина остановки молча стала бы «неизвестно, чем кончилось».
/** Фраза без точки в конце - чтобы встать внутрь другой фразы, а не дать «..». */
export const withoutStop = (text: string): string => text.trim().replace(/\.+$/, '')

/** Ответ чипом: имя вопроса и короткое значение - ссылка хвостом, многострочное - первой строкой. */
export type AnswerChip = { name: string; value: string }

/** Ответы, которые есть что показать, по порядку; пустые не рисуются. */
export const answerChips = (inputs: Readonly<Record<string, string>>): AnswerChip[] =>
  Object.entries(inputs)
    .filter(([, value]) => value.trim().length > 0)
    .map(([name, value]) => ({ name, value: answerLabel({ [name]: value }, MARK_CHARS) }))

const DAY_MINUTES = 24 * 60

const clampMinutes = (at: number): number => Math.min(Math.max(Math.round(at), 0), DAY_MINUTES - 1)

/** Часы и минуты из минут от полуночи - два меню формы. */
export const hourOf = (at: number): number => Math.floor(clampMinutes(at) / 60)

export const minuteOf = (at: number): number => clampMinutes(at) % 60

/** Тот же час с другим значением часов: минуты остаются. */
export const withHour = (at: number, hour: number): number => hour * 60 + minuteOf(at)

/** Тот же час с другими минутами: часы остаются. */
export const withMinute = (at: number, minute: number): number => hourOf(at) * 60 + minute

/**
 * Минуты от полуночи момента - час пропущенной строки. Её место - когда её пропустили, а не
 * нынешний час записи: разовый, передвинутый после пропуска, говорил бы, что пропущен в новое время.
 */
export const minutesOfDay = (at: number): number => {
  const moment = new Date(at)

  return moment.getHours() * 60 + moment.getMinutes()
}

/** Полка нового сценария: проектной нет, когда папки проекта нет на месте. */
export const scopeFor = (scope: ScenarioScope, canShare: boolean): ScenarioScope =>
  canShare ? scope : 'user'

const dayAndDate = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** «Tue, Oct 21» - заголовок дня расписания дальше завтрашнего и дата рядом с Today/Tomorrow. */
export const dayLabel = (at: number): string => dayAndDate.format(new Date(at))

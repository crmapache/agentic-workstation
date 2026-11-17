import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'

import type { InboxTone, InboxAction } from '@shared/inbox'
import { DAY_MS, MINUTE_MS } from '@shared/time-units'

import { action } from './inbox-items'

/**
 * Уведомление от ИИ (инструмент notify коннектора уведомлений): проверка того, что прислала
 * модель, - заголовок, текст, кнопки и время напоминания. Ошибка - текстом для модели: она
 * поправит вызов.
 */

export class NoticeError extends Error {}

export const TITLE_MAX = 120
export const BODY_MAX = 4_000
export const LABEL_MAX = 40
export const ACTIONS_MAX = 4

/** Дальше года напоминание - уже не напоминание, а забытая запись. */
const AHEAD_MAX_MS = 366 * DAY_MS

/** Чуть в прошлом - это «сейчас»: модель считает минуты, пока пишет вызов. */
const PAST_SLACK_MS = 2 * MINUTE_MS

export type NoticeButton = { label: string; type: 'reply' | 'open' | 'dismiss'; value: string }

export type Notice = {
  title: string
  body: string
  tone: InboxTone
  /** 0 - сейчас. */
  deliverAt: number
  actions: InboxAction[]
}

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

/** Местное время из частей; NaN - такого дня или часа нет (30 февраля, 24:00). */
const localMoment = (parts: RegExpExecArray): number => {
  const [year, month, day, hour, minute, second] = parts.slice(1).map((part) => Number(part ?? 0))
  const moment = new Date(year ?? 0, (month ?? 1) - 1, day, hour, minute, second)
  const same =
    moment.getFullYear() === year &&
    moment.getMonth() === (month ?? 1) - 1 &&
    moment.getDate() === day &&
    moment.getHours() === hour &&
    moment.getMinutes() === minute

  return same ? moment.getTime() : Number.NaN
}

/**
 * Время напоминания: ISO 8601. Без пояса - местное время машины человека (так его и называют:
 * «завтра в 10»); с поясом или Z - как сказано. Пусто - сейчас (0).
 */
export const parseWhen = (value: string, now: number): number => {
  const said = value.trim()

  if (!said) return 0

  const local = LOCAL_TIME.exec(said)
  // Только дата без времени - не время: Date.parse прочёл бы её полночью UTC, то есть вечером
  // накануне в поясе человека. И часы со смещением обязательны - иначе это местное время выше.
  const zoned = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(said)
  const moment = local ? localMoment(local) : zoned ? Date.parse(said) : Number.NaN

  if (!Number.isFinite(moment)) {
    throw new NoticeError(
      `"at" must be ISO 8601 time like 2026-12-01T09:00 (local) - got "${said}"`,
    )
  }

  if (moment < now - PAST_SLACK_MS) throw new NoticeError('"at" is in the past')
  if (moment > now + AHEAD_MAX_MS) throw new NoticeError('"at" is more than a year ahead')

  return moment <= now ? 0 : moment
}

/** Что открыть: адрес сайта или путь на машине (~ - домашняя папка). */
const openTarget = (value: string): string => {
  const said = value.trim()

  if (/^https?:\/\//i.test(said)) {
    try {
      return new URL(said).toString()
    } catch {
      throw new NoticeError(`"${said}" is not a valid link`)
    }
  }

  const path =
    said === '~' ? homedir() : said.startsWith('~/') ? join(homedir(), said.slice(2)) : said

  if (!isAbsolute(path)) {
    throw new NoticeError('an "open" button needs an http(s) link or an absolute path in "value"')
  }

  return path
}

const oneLine = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Кнопки уведомления. reply доступен только разговору, которому есть куда вернуть нажатие
 * (прогон задания, вкладка панели): иначе модель ждала бы ответа, который не придёт.
 */
export const buttonsOf = (buttons: readonly NoticeButton[], canReply: boolean): InboxAction[] => {
  if (buttons.length > ACTIONS_MAX) throw new NoticeError(`at most ${ACTIONS_MAX} buttons`)

  return buttons.map((button, index) => {
    const label = oneLine(button.label, LABEL_MAX)

    if (!label) throw new NoticeError('every button needs a label')

    if (button.type === 'reply' && !canReply) {
      throw new NoticeError(
        'reply buttons work only in chats and scheduled task runs of the IDE; use open or dismiss here',
      )
    }

    return action(button.type, {
      id: `b${index}`,
      label,
      value: button.type === 'open' ? openTarget(button.value) : button.value.trim().slice(0, 2000),
      primary: index === 0,
    })
  })
}

export const noticeOf = (
  input: { title: string; body: string; attention: boolean; at: string; buttons: NoticeButton[] },
  canReply: boolean,
  now: number,
): Notice => {
  const title = oneLine(input.title, TITLE_MAX)

  if (!title) throw new NoticeError('"title" is required')

  return {
    title,
    body: input.body.trim().slice(0, BODY_MAX),
    tone: input.attention ? 'attention' : 'info',
    deliverAt: parseWhen(input.at, now),
    actions: buttonsOf(input.buttons, canReply),
  }
}

import type { TFunction } from 'i18next'

const SECOND = 1000

const MINUTE = 60 * SECOND

const HOUR = 60 * MINUTE

const DAY = 24 * HOUR

const WEEK = 7 * DAY

/**
 * Сколько длится работа - как в IDE: «12s», «3m 05s», «1h 02m 05s». Секунды остаются и после
 * часа: по ним видно, что ход или прогон идёт, а не стоит. Отрицательное (часы разошлись) -
 * ноль, а не минус.
 */
export const durationText = (t: TFunction, ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / SECOND)
  const pad = (part: number) => String(part).padStart(2, '0')

  if (total < 60) return t('time.seconds', { count: total })
  if (total < 3600) {
    return t('time.minutesSeconds', { minutes: Math.floor(total / 60), seconds: pad(total % 60) })
  }

  return t('time.hoursMinutesSeconds', {
    hours: Math.floor(total / 3600),
    minutes: pad(Math.floor(total / 60) % 60),
    seconds: pad(total % 60),
  })
}

/** Как давно - грубо, двумя единицами: «40s», «15m», «1h 5m», «3d 4h». Секунды здесь шум. */
const agoText = (t: TFunction, ms: number): string => {
  if (ms < MINUTE) return t('time.seconds', { count: Math.floor(ms / SECOND) })
  if (ms < HOUR) return t('time.minutes', { count: Math.floor(ms / MINUTE) })

  if (ms < DAY) {
    return t('time.hoursMinutes', {
      hours: Math.floor(ms / HOUR),
      minutes: Math.floor((ms % HOUR) / MINUTE),
    })
  }

  return t('time.daysHours', {
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / HOUR),
  })
}

/**
 * Сколько прошло с момента на часах IDE. offset - насколько часы IDE впереди часов телефона:
 * без поправки «идёт 2m» на телефоне с отставшими часами было бы «идёт 5m».
 */
export const sinceText = (t: TFunction, since: number, now: number, offset: number): string => {
  const elapsed = now + offset - since

  if (elapsed < 45 * SECOND) return t('time.justNow')

  // Дольше недели - дата, а не «23d 4h»: так давно считают днями календаря, а не часами.
  return elapsed < WEEK ? agoText(t, elapsed) : dateText(since - offset)
}

/** День по часам телефона: «Nov 3». */
export const dateText = (at: number): string =>
  new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })

/** Время дня по часам телефона: «до 14:30». */
export const clockText = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * Момент дня по часам телефона: сегодня - только время, другой день - с датой. at - уже по
 * часам телефона (поправку на часы IDE вычитает вызывающий).
 */
export const momentText = (at: number, now: number): string =>
  new Date(at).toDateString() === new Date(now).toDateString()
    ? clockText(at)
    : `${dateText(at)}, ${clockText(at)}`

/** Деньги прогона: «$0.42». */
export const costText = (usd: number): string => `$${usd.toFixed(2)}`

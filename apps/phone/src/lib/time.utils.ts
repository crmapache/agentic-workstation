import type { TFunction } from 'i18next'

const SECOND = 1000

const MINUTE = 60 * SECOND

const HOUR = 60 * MINUTE

const DAY = 24 * HOUR

const WEEK = 7 * DAY

/** Сколько прошло - коротко, двумя единицами: «40s», «2m 40s», «1h 5m», «3d 4h». */
export const durationText = (t: TFunction, ms: number): string => {
  const safe = Math.max(0, ms)

  if (safe < MINUTE) return t('time.seconds', { count: Math.floor(safe / SECOND) })
  if (safe < HOUR) {
    const minutes = Math.floor(safe / MINUTE)
    const seconds = Math.floor((safe % MINUTE) / SECOND)

    return seconds > 0 && minutes < 10
      ? t('time.minutesSeconds', { minutes, seconds })
      : t('time.minutes', { count: minutes })
  }

  if (safe < DAY) {
    return t('time.hoursMinutes', {
      hours: Math.floor(safe / HOUR),
      minutes: Math.floor((safe % HOUR) / MINUTE),
    })
  }

  return t('time.daysHours', {
    days: Math.floor(safe / DAY),
    hours: Math.floor((safe % DAY) / HOUR),
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
  return elapsed < WEEK ? durationText(t, elapsed) : dateText(since - offset)
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

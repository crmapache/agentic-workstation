import { MINUTE_MS } from './time-units'

/** Смещение пояса в момент: «-06:00». Правила поясов и летнего времени знает Intl. */
export const offsetAt = (moment: Date, timeZone: string): string => {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(moment)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const offset = name.replace('GMT', '')

  return offset === '' ? '+00:00' : offset
}

/** «-06:00» - в минуты: -360. */
export const minutesOf = (offset: string): number => {
  const sign = offset.startsWith('-') ? -1 : 1
  const [hours = 0, minutes = 0] = offset.slice(1).split(':').map(Number)

  return sign * (hours * 60 + minutes)
}

/** Знает ли Intl такой пояс IANA («Europe/Madrid»). */
export const isTimeZone = (timeZone: string): boolean => {
  if (!timeZone) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone })

    return true
  } catch {
    return false
  }
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/

/**
 * Местное время на часах пояса («2026-11-24T09:30» или дата - полночь) - в мс UTC. Смещение
 * берётся дважды: на догадке и на уточнённом моменте, иначе в день перевода часов время
 * съехало бы на час. Час, которого нет (весной стрелки прыгнули), - на час позже, как у
 * календарей. Негодная строка - null.
 */
export const wallTimeToUtc = (wall: string, timeZone: string): number | null => {
  const match = WALL_TIME.exec(wall)

  if (!match) return null

  const [year = 0, month = 1, day = 1, hour = 0, minute = 0] = match
    .slice(1)
    .map((part) => Number(part ?? 0))
  const naive = Date.UTC(year, month - 1, day, hour, minute)

  if (new Date(naive).getUTCDate() !== day || hour > 23 || minute > 59) return null

  const first = naive - minutesOf(offsetAt(new Date(naive), timeZone)) * MINUTE_MS

  return naive - minutesOf(offsetAt(new Date(first), timeZone)) * MINUTE_MS
}
